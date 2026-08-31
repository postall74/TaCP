using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.OpenApi.Models;
using TkpApi;

/* ============================================================
   TKP·PRO BACKEND — ASP.NET Core 8, Minimal API + EF Core + PostgreSQL.

   Запуск (см. ../README.md):
     1) appsettings.json → ConnectionStrings:Tkp
     2) dotnet run  →  http://localhost:5085 (Swagger: /swagger)
   При пустой БД каталог автоматически наполняется из seed-catalog.csv.

   Фронтенд подключается заменой action'ов src/store.ts на вызовы этих
   эндпоинтов — контракты совпадают с моделью src/types.ts.
   ============================================================ */

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<TkpDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Tkp")));
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    // Кнопка Authorize в Swagger: вставляется «Bearer <токен>» из POST /api/auth/login
    o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Вставьте токен из /api/auth/login (префикс Bearer не нужен)",
    });
    o.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } }] =
            Array.Empty<string>(),
    });
});
// Аутентификация и роли: Identity + JWT, политики AdminOnly/Staff (см. AuthExtensions.cs)
builder.Services.AddTkpAuth(builder.Configuration);
// Контракт JSON с фронтендом (src/types.ts):
//  • enum'ы Direction/ProjectStatus — строками "nku"/"draft";
//  • даты — unix-миллисекундами (число). Без UnixMsDateTimeConverter сервер
//    отвечал 400 на POST/PUT проектов: фронтенд шлёт createdAt как number,
//    а DateTime из числа не десериализуется (см. JsonConverters.cs).
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    o.SerializerOptions.Converters.Add(new UnixMsDateTimeConverter());
});

var app = builder.Build();
app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();
app.UseTkpAuth();        // UseAuthentication + UseAuthorization (до Map*)
app.MapAuthEndpoints();  // /api/auth/register|login|me|users

/* ---------------- раздача фронтенда (работа в локальной сети) ----------------
   npm run build складывает приложение в dist/; API отдаёт его сам, поэтому
   все участники сети открывают ОДИН адрес — http://<сервер>:5085 — без
   отдельного веб-сервера. Путь настраивается StaticFilesPath в appsettings. */
var staticDir = Path.GetFullPath(Path.Combine(
    app.Environment.ContentRootPath,
    builder.Configuration["StaticFilesPath"] ?? "../../dist"));
if (Directory.Exists(staticDir))
{
    var provider = new PhysicalFileProvider(staticDir);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider, DefaultFileNames = new[] { "index.html" } });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
    app.Logger.LogInformation("Фронтенд раздаётся из {Dir} — единый адрес для сети", staticDir);
}

/* ---------------- запуск: схема + сид каталога ---------------- */

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TkpDbContext>();
    EnsureSchema(db, app.Logger);
    EnsureExtraTables(db); // company_settings + deleted_equipment для существующих БД
    PurgeDeleted(db);      // сразу удаляем позиции корзины старше 90 дней
    if (!db.Equipment.Any())
    {
        var seedPath = Path.Combine(app.Environment.ContentRootPath, "seed-catalog.csv");
        if (File.Exists(seedPath))
        {
            var (a, _, _) = CatalogCsv.Import(db, File.ReadAllText(seedPath));
            db.SaveChanges();
            app.Logger.LogInformation("Каталог наполнен из seed-catalog.csv: {Count} позиций", a);
        }
    }
}
// Роли (admin/manager/engineer) и администратор из appsettings:Admin — идемпотентно
await app.SeedRolesAndAdminAsync();

// Фоновая чистка «корзины» справочника: каждые 6 часов удаляем позиции старше 90 дней
_ = new Timer(_ =>
{
    using var scope = app.Services.CreateScope();
    try { PurgeDeleted(scope.ServiceProvider.GetRequiredService<TkpDbContext>()); }
    catch (Exception ex) { app.Logger.LogWarning(ex, "Чистка deleted_equipment не выполнена"); }
}, null, TimeSpan.FromHours(6), TimeSpan.FromHours(6));

/* ---------------- Projects ---------------- */

/* Проверка доступности — ОТКРЫТЫЙ эндпоинт (без авторизации).
   Кнопка «Проверить» на фронтенде ходит сюда до входа: прежний ping
   на /api/rates всегда давал 401 без токена. */
app.MapGet("/api/health", () =>
    Results.Ok(new { status = "ok", service = "tkp-api", time = DateTime.UtcNow }));

/* AsSplitQuery: два дочерних набора (шкафы+позиции и версии) читаются
   отдельными SQL-запросами — без декартова произведения и предупреждения EF. */
app.MapGet("/api/projects", async (TkpDbContext db) =>
    await db.Projects.Include(p => p.Cabinets).ThenInclude(c => c.Items)
                     .Include(p => p.Versions)
                     .AsSplitQuery()
                     .OrderByDescending(p => p.UpdatedAt).ToListAsync())
   .RequireAuthorization("Staff");

app.MapPost("/api/projects", async (Project p, TkpDbContext db) =>
{
    if (string.IsNullOrEmpty(p.Id)) p.Id = Guid.NewGuid().ToString();
    db.Projects.Add(p);
    await db.SaveChangesAsync();
    return Results.Created($"/api/projects/{p.Id}", p);
}).RequireAuthorization("Staff");

app.MapGet("/api/projects/{id}", async (string id, TkpDbContext db) =>
    await db.Projects.Include(p => p.Cabinets).ThenInclude(c => c.Items)
                     .Include(p => p.Versions)
                     .FirstOrDefaultAsync(p => p.Id == id) is { } p
        ? Results.Ok(p)
        : Results.NotFound())
   .RequireAuthorization("Staff");

/* Полная синхронизация: скаляры проекта + замена состава шкафов одним пакетом.
   Именно этот эндпоинт использует фронтенд после каждой локальной мутации.
   Смена статуса валидируется по матрице прав (Rights.cs — зеркало roles.ts):
   «выиграно/проиграно» — только менеджер/админ, иначе 403 с причиной. */
app.MapPut("/api/projects/{id}", async (string id, Project patch, TkpDbContext db, ClaimsPrincipal user) =>
{
    var p = await db.Projects.Include(x => x.Cabinets).ThenInclude(c => c.Items)
                             .FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();

    if (patch.Status != p.Status)
    {
        var perm = Rights.PermForStatus(patch.Status);
        if (!Rights.Can(user, perm)) return Rights.Forbid(user, perm);
    }

    var created = p.CreatedAt;
    db.Entry(p).CurrentValues.SetValues(patch);
    p.Id = id;
    p.CreatedAt = created;
    p.UpdatedAt = DateTime.UtcNow;

    db.Cabinets.RemoveRange(p.Cabinets);          // cascade удалит позиции
    p.Cabinets = patch.Cabinets ?? new List<Cabinet>();
    await db.SaveChangesAsync();
    return Results.Ok(p);
}).RequireAuthorization("Staff");

/* Удаление ТКП — по матрице прав: менеджер/админ (инженеру — 403 с причиной).
   Политика Staff здесь сознательно недостаточна: она лишь подтверждает вход. */
app.MapDelete("/api/projects/{id}", async (string id, TkpDbContext db, ClaimsPrincipal user) =>
{
    if (!Rights.Can(user, Rights.ProjectDelete)) return Rights.Forbid(user, Rights.ProjectDelete);
    var p = await db.Projects.FindAsync(id);
    if (p is null) return Results.NotFound();
    db.Projects.Remove(p);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("Staff");

/* Шкафы: пакетное добавление (результат мастера подбора). */
app.MapPost("/api/projects/{id}/cabinets", async (string id, List<Cabinet> cabs, TkpDbContext db) =>
{
    var p = await db.Projects.Include(x => x.Cabinets).ThenInclude(c => c.Items)
                             .FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();
    p.Cabinets.AddRange(cabs);
    p.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(p.Cabinets);
}).RequireAuthorization("Staff");

app.MapDelete("/api/cabinets/{id}", async (string id, TkpDbContext db) =>
{
    var c = await db.Cabinets.FindAsync(id);
    if (c is null) return Results.NotFound();
    db.Cabinets.Remove(c);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("Staff");

/* Позиция в шкаф — цена фиксируется снимком из справочника на сервере. */
app.MapPost("/api/cabinets/{id}/items", async (string id, string equipmentId, decimal qty, TkpDbContext db) =>
{
    var cab = await db.Cabinets.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id);
    var eq = await db.Equipment.FindAsync(equipmentId);
    if (cab is null || eq is null) return Results.NotFound();

    var ex = cab.Items.FirstOrDefault(i => i.EqId == equipmentId);
    if (ex is not null) ex.Qty += qty;
    else cab.Items.Add(new LineItem
    {
        EqId = eq.Id, Sku = eq.Sku, Name = eq.Name, Brand = eq.Brand,
        Unit = eq.Unit, Qty = qty, Purchase = eq.Purchase
    });
    await db.SaveChangesAsync();
    return Results.Ok(cab.Items);
}).RequireAuthorization("Staff");

/* ---------------- Версии ---------------- */

app.MapPost("/api/projects/{id}/versions", async (string id, string? label, TkpDbContext db) =>
{
    var p = await db.Projects.Include(x => x.Cabinets).ThenInclude(c => c.Items)
                             .Include(x => x.Versions).FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();

    var eqBase = p.Cabinets.Sum(c => c.Items.Sum(i => i.Purchase * i.Qty)); // база = закупочная
    var snapshot = JsonSerializer.SerializeToElement(new
    {
        cabinets = p.Cabinets,
        calc = new { eqBase, total = eqBase * (1 + p.Markup / 100m) } // ориентир; полный расчёт — на клиенте
    });
    p.Versions.Insert(0, new ProjectVersion { Label = label ?? $"Версия {p.Versions.Count + 1}", Snapshot = snapshot });
    await db.SaveChangesAsync();
    return Results.Ok(p.Versions);
}).RequireAuthorization("Staff");

/* ---------------- Каталог ---------------- */

app.MapGet("/api/catalog", async (TkpDbContext db) =>
    await db.Equipment.OrderBy(e => e.Category).ThenBy(e => e.Sku).ToListAsync())
   .RequireAuthorization("Staff");

/* Добавление позиции — все сотрудники (catalog.add), но с защитой от дублей:
   справочник общий, и позиция с тем же артикулом (или названием+брендом) уже
   могла быть заведена кем-то другим. Дубль не создаём — отвечаем 409 с данными
   существующей позиции, клиент подсвечивает её в таблице. */
app.MapPost("/api/catalog", async (Equipment e, TkpDbContext db) =>
{
    var sku = e.Sku.Trim();
    var existing = await db.Equipment.FirstOrDefaultAsync(x =>
        x.Sku.ToLower() == sku.ToLower() ||
        (x.Name.ToLower() == e.Name.Trim().ToLower() && x.Brand.ToLower() == e.Brand.Trim().ToLower()));
    if (existing is not null)
        return Results.Conflict(new { detail = "Такая позиция уже есть в справочнике", existing });

    // повторное добавление артикула возвращает позицию из «корзины»
    var tomb = await db.DeletedEquipment.FirstOrDefaultAsync(x => x.Sku.ToLower() == sku.ToLower());
    if (tomb is not null) db.DeletedEquipment.Remove(tomb);

    if (string.IsNullOrEmpty(e.Id)) e.Id = Guid.NewGuid().ToString();
    db.Equipment.Add(e);
    await db.SaveChangesAsync();
    return Results.Created("/api/catalog", e);
}).RequireAuthorization("Staff");

/* PUT — upsert: позиция могла быть создана офлайн и прийти при восстановлении
   связи (отложенная синхронизация клиента). Если строки с таким id нет —
   создаём (с проверкой дубля артикула); правка/создание возвращают позицию
   из «корзины», если она там лежала. */
app.MapPut("/api/catalog/{id}", async (string id, Equipment e, TkpDbContext db) =>
{
    e.Id = id;
    var ex = await db.Equipment.FindAsync(id);
    if (ex is null)
    {
        var sku = e.Sku.Trim().ToLower();
        var dup = await db.Equipment.AnyAsync(x => x.Id != id && x.Sku.ToLower() == sku);
        if (dup) return Results.Conflict(new { detail = "Позиция с таким артикулом уже есть в справочнике" });
        db.Equipment.Add(e);
    }
    else db.Equipment.Update(e);

    var tomb = await db.DeletedEquipment.FirstOrDefaultAsync(x => x.Id == id || x.Sku.ToLower() == e.Sku.Trim().ToLower());
    if (tomb is not null) db.DeletedEquipment.Remove(tomb); // «воскрешение»

    await db.SaveChangesAsync();
    return Results.Ok(e);
}).RequireAuthorization("Staff");

/* Удаление позиции — только менеджер/админ (catalog.delete). Инженер пополняет
   справочник, но не удаляет из общей базы — защита от случайной потери данных.
   Позиция не исчезает: копируется в «корзину» (deleted_equipment) на 90 дней —
   проекты, где она использована, видят пометку и срок, а повторное добавление
   того же артикула возвращает её в справочник. Идемпотентно (повтор → 204). */
app.MapDelete("/api/catalog/{id}", async (string id, TkpDbContext db, ClaimsPrincipal user) =>
{
    if (!Rights.Can(user, Rights.CatalogDelete)) return Rights.Forbid(user, Rights.CatalogDelete);
    var e = await db.Equipment.FindAsync(id);
    if (e is null) return Results.NoContent(); // уже удалена (например, офлайн-очередью)

    var old = await db.DeletedEquipment.FindAsync(id); // повторное удаление той же позиции
    if (old is not null) db.DeletedEquipment.Remove(old);
    db.DeletedEquipment.Add(new DeletedEquipment
    {
        Id = e.Id, Sku = e.Sku, Name = e.Name, Brand = e.Brand, Category = e.Category,
        Direction = e.Direction, Unit = e.Unit, Purchase = e.Purchase,
        RatedCurrent = e.RatedCurrent, Attrs = e.Attrs ?? "",
        DeletedAt = DateTime.UtcNow,
        DeletedBy = user.FindFirstValue(ClaimTypes.Email) ?? user.Identity?.Name ?? "?",
    });
    db.Equipment.Remove(e);
    await db.SaveChangesAsync();
    return Results.NoContent();
}).RequireAuthorization("Staff");

/* «Корзина» справочника: удалённые позиции с датой удаления (unix-мс) и автором.
   Клиент помечает ими позиции в ТКП («удалено из справочника, осталось N дней»)
   и предлагает замену из аналогов той же категории. */
app.MapGet("/api/catalog/deleted", async (TkpDbContext db) =>
    (await db.DeletedEquipment.OrderByDescending(x => x.DeletedAt).ToListAsync())
        .Select(x => new
        {
            id = x.Id, sku = x.Sku, name = x.Name, brand = x.Brand, category = x.Category,
            direction = x.Direction, unit = x.Unit, purchase = x.Purchase,
            ratedCurrent = x.RatedCurrent, attrs = x.Attrs,
            deletedAt = new DateTimeOffset(DateTime.SpecifyKind(x.DeletedAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
            deletedBy = x.DeletedBy,
        }))
   .RequireAuthorization("Staff");

/* Импорт прайса: CSV «артикул;наименование;бренд;категория;направление;ед;закупка;цена;характеристики».
   Массовая операция с перезаписью цен — только менеджер/админ (catalog.import). */
app.MapPost("/api/catalog/import", async (HttpRequest req, TkpDbContext db, ClaimsPrincipal user) =>
{
    if (!Rights.Can(user, Rights.CatalogImport)) return Rights.Forbid(user, Rights.CatalogImport);
    using var reader = new StreamReader(req.Body);
    var text = await reader.ReadToEndAsync();
    var (added, updated, skipped) = CatalogCsv.Import(db, text);
    await db.SaveChangesAsync();
    return Results.Ok(new { added, updated, skipped });
}).RequireAuthorization("Staff");

/* ---------------- Тарифы и настройки ---------------- */

// Тарифы — общие для всех (единые нормо-часы компании), админ.
var rates = new Rates();
app.MapGet("/api/rates", () => rates).RequireAuthorization("Staff");
app.MapPut("/api/rates", (Rates r) => { rates = r; return Results.Ok(rates); }).RequireAuthorization("AdminOnly");

/* Реквизиты компании ПРИВЯЗАНЫ К УЧЁТНОЙ ЗАПИСИ и хранятся в БД (company_settings):
   у каждого пользователя свой исполнитель/контакты в документах. Строки нет —
   возвращаются значения по умолчанию (ЗАО «Эталон-Прибор»). */
app.MapGet("/api/settings", async (ClaimsPrincipal user, TkpDbContext db) =>
{
    var uid = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var row = await db.CompanySettings.FirstOrDefaultAsync(x => x.UserId == uid);
    return Results.Ok(row is null ? new CompanySettings() : (CompanySettings)row);
}).RequireAuthorization("Staff");

/* Заполняют менеджер и админ (политика ManagerUp); инженер видит только для чтения. */
app.MapPut("/api/settings", async (CompanySettings c, ClaimsPrincipal user, TkpDbContext db) =>
{
    var uid = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "";
    var row = await db.CompanySettings.FirstOrDefaultAsync(x => x.UserId == uid);
    if (row is null)
    {
        row = new CompanySettingsRow { UserId = uid };
        db.CompanySettings.Add(row);
    }
    row.CompanyName = c.CompanyName; row.Tagline = c.Tagline; row.Address = c.Address;
    row.Phone = c.Phone; row.Email = c.Email; row.Requisites = c.Requisites;
    row.Manager = c.Manager; row.Executor = c.Executor;
    row.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok((CompanySettings)row);
}).RequireAuthorization("ManagerUp");

/* SPA-fallback: все маршруты, кроме /api и существующих файлов, отдают index.html —
   фронтенд роутится на клиенте. Регистрируется последним. */
app.MapFallback(async ctx =>
{
    if (ctx.Request.Path.StartsWithSegments("/api") || !Directory.Exists(staticDir))
    {
        ctx.Response.StatusCode = 404;
        return;
    }
    ctx.Response.ContentType = "text/html; charset=utf-8";
    await ctx.Response.SendFileAsync(Path.Combine(staticDir, "index.html"));
});

app.Run();

/* ---------------- доп. таблицы и «корзина» справочника ---------------- */

/// <summary>Создаёт company_settings и deleted_equipment в уже существующей БД
/// (EnsureCreated не добавляет таблицы в готовую базу, а миграций может не быть).</summary>
static void EnsureExtraTables(TkpDbContext db)
{
    db.Database.ExecuteSqlRaw("""
        CREATE TABLE IF NOT EXISTS "company_settings" (
            "Id" text NOT NULL PRIMARY KEY,
            "UserId" text NOT NULL,
            "UpdatedAt" timestamptz NOT NULL,
            "CompanyName" text NOT NULL, "Tagline" text NOT NULL, "Address" text NOT NULL,
            "Phone" text NOT NULL, "Email" text NOT NULL, "Requisites" text NOT NULL,
            "Manager" text NOT NULL, "Executor" text NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "ix_company_settings_UserId" ON "company_settings" ("UserId");

        CREATE TABLE IF NOT EXISTS "deleted_equipment" (
            "Id" text NOT NULL PRIMARY KEY,
            "Sku" text NOT NULL, "Name" text NOT NULL, "Brand" text NOT NULL,
            "Category" text NOT NULL, "Direction" integer NOT NULL, "Unit" text NOT NULL,
            "Purchase" numeric(12,2) NOT NULL, "RatedCurrent" numeric(8,2) NOT NULL,
            "Attrs" text NOT NULL, "DeletedAt" timestamptz NOT NULL, "DeletedBy" text NOT NULL
        );
        CREATE INDEX IF NOT EXISTS "ix_deleted_equipment_Sku" ON "deleted_equipment" ("Sku");
        CREATE INDEX IF NOT EXISTS "ix_deleted_equipment_DeletedAt" ON "deleted_equipment" ("DeletedAt");
        """);
}

/// <summary>Безвозвратно удаляет позиции «корзины» старше 90 дней.
/// ExecuteSql (не Raw) параметризует cutoff — без предупреждений EF1002.</summary>
static void PurgeDeleted(TkpDbContext db)
{
    var cutoff = DateTime.UtcNow.AddDays(-90);
    var n = db.Database.ExecuteSql($"DELETE FROM \"deleted_equipment\" WHERE \"DeletedAt\" < {cutoff}");
    if (n > 0) Console.WriteLine($"[корзина] безвозвратно удалено позиций старше 90 дней: {n}");
}

/* ---------------- схема БД: миграции + авто-baseline ---------------- */

/// <summary>
/// Применяет EF-миграции. Три случая:
///  1. Файлов миграций ещё нет (чистый клон) — создаём схему EnsureCreated (dev-режим);
///  2. БД уже содержит таблицы от EnsureCreated, но нет журнала миграций —
///     помечаем ВСЕ текущие миграции как применённые (baseline), чтобы не пересоздавать данные;
///  3. Обычный режим — накатываем ожидающие миграции.
/// Команды для генерации миграций — в backend/MIGRATIONS.md.
/// </summary>
static void EnsureSchema(TkpDbContext db, ILogger logger)
{
    var pending = db.Database.GetPendingMigrations().ToList();
    var applied = db.Database.GetAppliedMigrations().ToList();

    if (pending.Count == 0 && applied.Count == 0)
    {
        // Миграции не сгенерированы — dev-режим (см. MIGRATIONS.md, как перейти на миграции)
        db.Database.EnsureCreated();
        logger.LogInformation("Миграции не найдены — схема создана через EnsureCreated (dev)");
        return;
    }

    if (applied.Count == 0 && db.Database.CanConnect() && HasAnyTable(db))
    {
        // Существующая БД от EnsureCreated: baseline — помечаем все миграции применёнными.
        // Имя таблицы — константа (не интерполяция), поэтому EF1002 (SQL-injection) не срабатывает.
        db.Database.ExecuteSqlRaw(
            "CREATE TABLE IF NOT EXISTS \"__EFMigrationsHistory\" (\"MigrationId\" varchar(150) NOT NULL PRIMARY KEY, \"ProductVersion\" varchar(32) NOT NULL)");
        foreach (var m in pending)
            db.Database.ExecuteSqlRaw(
                "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES (@p0, @p1)", m, "8.0.8");
        logger.LogInformation("Baseline: {Count} миграций помечены как применённые (схема уже существовала)", pending.Count);
        return;
    }

    db.Database.Migrate();
    logger.LogInformation("Миграции накатаны: {Count} применено", db.Database.GetAppliedMigrations().Count());
}

static bool HasAnyTable(TkpDbContext db)
{
    try
    {
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'";
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }
    catch
    {
        return false;
    }
}

// Разбор CSV прайс-листа вынесен в CatalogCsv.cs (чистая часть + Import).
