using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace TkpApi;

/* ============================================================
   АУТЕНТИФИКАЦИЯ И РОЛИ (ASP.NET Identity + JWT).

   Зачем отдельным файлом: весь auth-механизм инкапсулирован в трёх
   расширениях, Program.cs меняется минимально (3 строки), а модуль
   легко переносится в десктоп/серверную версию без переписывания.

   Подключение в Program.cs:
       var builder = WebApplication.CreateBuilder(args);
       builder.Services.AddTkpAuth(builder.Configuration);   // ①
       ...
       app.UseTkpAuth();                                     // ②  (после UseRouting, до Map*)
       app.MapAuthEndpoints();                               // ③
       await app.SeedRolesAndAdminAsync();                   // ④  (после EnsureCreated)

   Роли: admin / manager / engineer (см. Roles в Models.cs).
   ============================================================ */

public static class AuthExtensions
{
    /// <summary>Секция конфигурации: Jwt:Key, Jwt:Issuer, Jwt:Audience, Jwt:ExpireMinutes.</summary>
    public const string Section = "Jwt";

    /* ---------------- ① регистрация сервисов ---------------- */

    public static IServiceCollection AddTkpAuth(this IServiceCollection services, IConfiguration config)
    {
        // Identity: пользователи + роли, без Cookie (токены вместо сессий)
        services.AddIdentityCore<AppUser>(o =>
            {
                o.Password.RequireDigit = true;
                o.Password.RequiredLength = 6;
                o.Password.RequireNonAlphanumeric = false;
                o.User.RequireUniqueEmail = true;
            })
            .AddRoles<IdentityRole>()
            .AddEntityFrameworkStores<TkpDbContext>()
            .AddSignInManager();

        // JWT-аутентификация
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = config[$"{Section}:Issuer"] ?? "tkp-api",
                    ValidAudience = config[$"{Section}:Audience"] ?? "tkp-web",
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetKey(config))),
                    ClockSkew = TimeSpan.FromMinutes(1),
                };
            });

        services.AddAuthorization(o =>
        {
            // именованные политики — их используют эндпоинты через RequireAuthorization("…")
            o.AddPolicy("AdminOnly", p => p.RequireRole(Roles.Admin));
            o.AddPolicy("Staff", p => p.RequireRole(Roles.Admin, Roles.Manager, Roles.Engineer));
        });

        return services;
    }

    /* ---------------- ② включение middleware ---------------- */

    public static IApplicationBuilder UseTkpAuth(this IApplicationBuilder app)
    {
        app.UseAuthentication();
        app.UseAuthorization();
        return app;
    }

    /* ---------------- ③ эндпоинты /api/auth/* ---------------- */

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/auth").AllowAnonymous();

        // Регистрация (в проде — закрыть или оставить только админу; см. RequireAdmin)
        g.MapPost("/register", async (RegisterDto dto, UserManager<AppUser> users) =>
        {
            var user = new AppUser
            {
                UserName = dto.Email, Email = dto.Email,
                FullName = dto.FullName, Position = dto.Position ?? "",
            };
            var res = await users.CreateAsync(user, dto.Password);
            if (!res.Succeeded)
                return Results.BadRequest(new { errors = res.Errors.Select(e => e.Description) });

            await users.AddToRoleAsync(user, NormalizeRole(dto.Role));
            return Results.Ok(new { user.Id, user.Email, user.FullName, role = NormalizeRole(dto.Role) });
        });

        // Логин → JWT
        g.MapPost("/login", async (LoginDto dto, SignInManager<AppUser> signIn,
                                   UserManager<AppUser> users, IConfiguration config) =>
        {
            var user = await users.FindByEmailAsync(dto.Email);
            if (user is null || !await users.CheckPasswordAsync(user, dto.Password))
                return Results.Unauthorized();

            var roles = await users.GetRolesAsync(user);
            var token = IssueToken(user, roles, config);
            return Results.Ok(new { token = token.Token, expiresAt = token.ExpiresAt, user = ToDto(user, roles) });
        });

        // Текущий пользователь по токену
        app.MapGet("/api/auth/me", async (ClaimsPrincipal cp, UserManager<AppUser> users) =>
        {
            var id = cp.FindFirstValue(ClaimTypes.NameIdentifier);
            var user = id is null ? null : await users.FindByIdAsync(id);
            if (user is null) return Results.Unauthorized();
            var roles = await users.GetRolesAsync(user);
            return Results.Ok(ToDto(user, roles));
        }).RequireAuthorization("Staff");

        // Список пользователей — только админ
        app.MapGet("/api/auth/users", async (UserManager<AppUser> users) =>
        {
            var list = await users.Users.OrderBy(u => u.Email).ToListAsync();
            var result = new List<object>();
            foreach (var u in list)
                result.Add(ToDto(u, await users.GetRolesAsync(u)));
            return Results.Ok(result);
        }).RequireAuthorization("AdminOnly");

        return app;
    }

    /* ---------------- ④ сид ролей и администратора ---------------- */

    public static async Task SeedRolesAndAdminAsync(this IHost app)
    {
        using var scope = app.Services.CreateScope();
        var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var cfg = scope.ServiceProvider.GetRequiredService<IConfiguration>();
        var log = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("AuthSeed");

        foreach (var r in new[] { Roles.Admin, Roles.Manager, Roles.Engineer })
            if (!await roles.RoleExistsAsync(r))
                await roles.CreateAsync(new IdentityRole(r));

        // администратор по умолчанию (пароль из конфигурации, смена при первом входе)
        var email = cfg["Admin:Email"] ?? "admin@tkp.local";
        if (await users.FindByEmailAsync(email) is null)
        {
            var admin = new AppUser { UserName = email, Email = email, FullName = "Администратор", Position = "admin" };
            var password = cfg["Admin:Password"] ?? "Admin#12345";
            var res = await users.CreateAsync(admin, password);
            if (res.Succeeded)
            {
                await users.AddToRoleAsync(admin, Roles.Admin);
                log.LogInformation("Создан администратор {Email} (смените пароль!)", email);
            }
        }
    }

    /* ---------------- вспомогательное ---------------- */

    private static string GetKey(IConfiguration config) =>
        config[$"{Section}:Key"] ?? throw new InvalidOperationException(
            "Добавьте в appsettings.json секцию Jwt:Key (секрет ≥ 32 символов).");

    private static string NormalizeRole(string? role) => (role ?? Roles.Engineer).ToLowerInvariant() switch
    {
        Roles.Admin or Roles.Manager or Roles.Engineer => (role ?? Roles.Engineer).ToLowerInvariant(),
        _ => Roles.Engineer, // неизвестная роль деградирует до инженера
    };

    private static (string Token, DateTime ExpiresAt) IssueToken(AppUser user, IList<string> roles, IConfiguration config)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(GetKey(config)));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expires = DateTime.UtcNow.AddMinutes(double.Parse(config[$"{Section}:ExpireMinutes"] ?? "480"));

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id),
            new(ClaimTypes.Email, user.Email ?? ""),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.GivenName, user.Position),
        };
        claims.AddRange(roles.Select(r => new Claim(ClaimTypes.Role, r)));

        var jwt = new JwtSecurityToken(
            issuer: config[$"{Section}:Issuer"] ?? "tkp-api",
            audience: config[$"{Section}:Audience"] ?? "tkp-web",
            claims: claims,
            expires: expires,
            signingCredentials: creds);

        return (new JwtSecurityTokenHandler().WriteToken(jwt), expires);
    }

    private static object ToDto(AppUser u, IList<string> roles) => new
    {
        id = u.Id,
        email = u.Email,
        fullName = u.FullName,
        position = u.Position,
        roles,
    };
}

/* ---------------- DTO ---------------- */

public sealed record LoginDto(string Email, string Password);
public sealed record RegisterDto(string Email, string Password, string FullName, string? Position, string? Role);
