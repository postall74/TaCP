using Microsoft.EntityFrameworkCore;
using TkpApi;

/* ============================================================
   TKP·PRO BACKEND — ASP.NET Core 8, Minimal API + EF Core + PostgreSQL.

   Запуск:
     1) appsettings.json → ConnectionStrings:Tkp = "Host=localhost;Database=tkp;Username=postgres;Password=…"
     2) dotnet ef migrations add Init && dotnet ef database update
     3) dotnet run  →  http://localhost:5085

   Фронтенд подключается заменой action'ов src/store.ts на fetch-вызовы
   этих эндпоинтов (контракты совпадают с моделью src/types.ts).
   ============================================================ */

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddDbContext<TkpDbContext>(o =>
    o.UseNpgsql(builder.Configuration.GetConnectionString("Tkp")));
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors();

/* ---------------- Projects ---------------- */

app.MapGet("/api/projects", async (TkpDbContext db) =>
    await db.Projects.Include(p => p.Cabinets).ThenInclude(c => c.Items)
                     .OrderByDescending(p => p.UpdatedAt).ToListAsync());

app.MapPost("/api/projects", async (Project p, TkpDbContext db) =>
{
    p.Id = Guid.NewGuid();
    db.Projects.Add(p);
    await db.SaveChangesAsync();
    return Results.Created($"/api/projects/{p.Id}", p);
});

app.MapGet("/api/projects/{id:guid}", async (Guid id, TkpDbContext db) =>
    await db.Projects.Include(p => p.Cabinets).ThenInclude(c => c.Items)
                     .Include(p => p.Versions)
                     .FirstOrDefaultAsync(p => p.Id == id) is { } p
        ? Results.Ok(p)
        : Results.NotFound());

app.MapPut("/api/projects/{id:guid}", async (Guid id, Project patch, TkpDbContext db) =>
{
    var p = await db.Projects.Include(x => x.Cabinets).ThenInclude(c => c.Items)
                             .FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();
    // переносим редактируемые поля; Id/CreatedAt не трогаем
    db.Entry(p).CurrentValues.SetValues(patch);
    p.Id = id;
    p.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(p);
});

app.MapDelete("/api/projects/{id:guid}", async (Guid id, TkpDbContext db) =>
{
    var p = await db.Projects.FindAsync(id);
    if (p is null) return Results.NotFound();
    db.Projects.Remove(p);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

/* Шкафы: одиночное добавление и пакетное (результат мастера подбора). */
app.MapPost("/api/projects/{id:guid}/cabinets", async (Guid id, List<Cabinet> cabs, TkpDbContext db) =>
{
    var p = await db.Projects.FindAsync(id);
    if (p is null) return Results.NotFound();
    p.Cabinets.AddRange(cabs);
    p.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(p.Cabinets);
});

app.MapDelete("/api/cabinets/{id:guid}", async (Guid id, TkpDbContext db) =>
{
    var c = await db.Cabinets.FindAsync(id);
    if (c is null) return Results.NotFound();
    db.Cabinets.Remove(c);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

/* Позиция в шкаф — цена фиксируется снимком из справочника на сервере. */
app.MapPost("/api/cabinets/{id:guid}/items", async (Guid id, Guid equipmentId, decimal qty, TkpDbContext db) =>
{
    var cab = await db.Cabinets.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id);
    var eq = await db.Equipment.FindAsync(equipmentId);
    if (cab is null || eq is null) return Results.NotFound();

    var ex = cab.Items.FirstOrDefault(i => i.EquipmentId == equipmentId);
    if (ex is not null) ex.Qty += qty;
    else cab.Items.Add(new LineItem
    {
        EquipmentId = eq.Id, Sku = eq.Sku, Name = eq.Name, Brand = eq.Brand,
        Unit = eq.Unit, Qty = qty, Price = eq.Price, Purchase = eq.Purchase
    });
    await db.SaveChangesAsync();
    return Results.Ok(cab.Items);
});

/* ---------------- Версии ---------------- */

app.MapPost("/api/projects/{id:guid}/versions", async (Guid id, string? label, TkpDbContext db) =>
{
    var p = await db.Projects.Include(x => x.Cabinets).ThenInclude(c => c.Items)
                             .Include(x => x.Versions).FirstOrDefaultAsync(x => x.Id == id);
    if (p is null) return Results.NotFound();
    p.Versions.Insert(0, new ProjectVersion { Label = label ?? $"Версия {p.Versions.Count + 1}" });
    await db.SaveChangesAsync();
    return Results.Ok(p.Versions);
});

/* ---------------- Каталог ---------------- */

app.MapGet("/api/catalog", async (TkpDbContext db) => await db.Equipment.OrderBy(e => e.Category).ToListAsync());

app.MapPost("/api/catalog", async (Equipment e, TkpDbContext db) =>
{
    db.Equipment.Add(e);
    await db.SaveChangesAsync();
    return Results.Created($"/api/catalog", e);
});

app.MapPut("/api/catalog/{id:guid}", async (Guid id, Equipment e, TkpDbContext db) =>
{
    e.Id = id;
    db.Equipment.Update(e);
    await db.SaveChangesAsync();
    return Results.Ok(e);
});

app.MapDelete("/api/catalog/{id:guid}", async (Guid id, TkpDbContext db) =>
{
    var e = await db.Equipment.FindAsync(id);
    if (e is null) return Results.NotFound();
    db.Equipment.Remove(e);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

/* Импорт прайса: CSV «артикул;наименование;бренд;категория;направление;ед;закупка;цена;характеристики».
   Дубликаты по артикулу обновляются, новое — добавляется. */
app.MapPost("/api/catalog/import", async (HttpRequest req, TkpDbContext db) =>
{
    using var reader = new StreamReader(req.Body);
    var lines = (await reader.ReadToEndAsync()).Split('\n', StringSplitOptions.RemoveEmptyEntries);
    var bySku = (await db.Equipment.ToListAsync()).ToDictionary(e => e.Sku.ToLowerInvariant());
    int added = 0, updated = 0, skipped = 0;

    foreach (var line in lines.Skip(1))
    {
        var c = line.Split(';');
        if (c.Length < 8 || !decimal.TryParse(c[7], out var price)) { skipped++; continue; }
        decimal.TryParse(c[6], out var purchase);
        if (bySku.TryGetValue(c[0].Trim().ToLowerInvariant(), out var ex))
        {
            ex.Name = c[1].Trim(); ex.Brand = c[2].Trim(); ex.Category = c[3].Trim();
            ex.Unit = c[5].Trim(); ex.Purchase = purchase; ex.Price = price;
            ex.Attrs = c.Length > 8 ? c[8].Trim() : null;
            updated++;
        }
        else
        {
            var ne = new Equipment
            {
                Sku = c[0].Trim(), Name = c[1].Trim(), Brand = c[2].Trim(), Category = c[3].Trim(),
                Unit = c[5].Trim(), Purchase = purchase, Price = price,
                Attrs = c.Length > 8 ? c[8].Trim() : null
            };
            db.Equipment.Add(ne);
            bySku[ne.Sku.ToLowerInvariant()] = ne;
            added++;
        }
    }
    await db.SaveChangesAsync();
    return Results.Ok(new { added, updated, skipped });
});

/* ---------------- Тарифы и настройки ---------------- */

// В боевой схеме — таблицы rate_cards / settings; здесь для краткости in-memory singleton.
var rates = new Rates();
var company = new CompanySettings();
app.MapGet("/api/rates", () => rates);
app.MapPut("/api/rates", (Rates r) => { rates = r; return Results.Ok(rates); });
app.MapGet("/api/settings", () => company);
app.MapPut("/api/settings", (CompanySettings c) => { company = c; return Results.Ok(company); });

app.Run();
