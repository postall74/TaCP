using System.Security.Claims;

namespace TkpApi;

/* ============================================================
   МАТРИЦА ПРАВ — серверное зеркало src/utils/roles.ts.

   Клиент применяет матрицу в двух слоях: UI (кнопки гаснут) и
   store (мутации блокируются). Но этого недостаточно: прямой
   вызов API (curl / Swagger / будущий тонкий клиент) обходил бы
   правила. Данный модуль ДОЗАКРЫВАЕТ те же правила на сервере:
   эндпоинты спрашивают Rights.Can(user, …) и отвечают 403 с
   человекочитаемой причиной (тело — RFC 7807 Problem, поле detail).

   Приоритет ролей и тексты отказов — один в один с roles.ts:
   admin > manager > engineer; неизвестная роль деградирует до
   инженера (как NormalizeRole в AuthExtensions).
   ============================================================ */

public static class Rights
{
    /* Действия — строки, идентичные типу Perm в roles.ts */
    public const string ProjectCreate    = "project.create";
    public const string ProjectEdit      = "project.edit";
    public const string ProjectDelete    = "project.delete";
    public const string ProjectDuplicate = "project.duplicate";
    public const string StatusWorkflow   = "status.workflow";  // черновик → на расчёте → отправлено
    public const string StatusDecide     = "status.decide";    // отправлено → выиграно/проиграно
    public const string CatalogAdd       = "catalog.add";      // добавление позиций (все сотрудники)
    public const string CatalogEdit      = "catalog.edit";     // правка своих/общих позиций (все)
    public const string CatalogDelete    = "catalog.delete";   // удаление — менеджер/админ
    public const string CatalogImport    = "catalog.import";   // импорт прайсов — менеджер/админ
    public const string RatesEdit        = "rates.edit";
    public const string SettingsEdit     = "settings.edit";
    public const string UsersManage      = "users.manage";

    private static readonly Dictionary<string, string[]> Matrix = new()
    {
        [Roles.Admin] = new[]
        {
            ProjectCreate, ProjectEdit, ProjectDelete, ProjectDuplicate,
            StatusWorkflow, StatusDecide,
            CatalogAdd, CatalogEdit, CatalogDelete, CatalogImport,
            RatesEdit, SettingsEdit, UsersManage,
        },
        [Roles.Manager] = new[]
        {
            ProjectCreate, ProjectEdit, ProjectDelete, ProjectDuplicate,
            StatusWorkflow, StatusDecide,
            CatalogAdd, CatalogEdit, CatalogDelete, CatalogImport,
            SettingsEdit, // реквизиты компании — менеджер + админ
        },
        [Roles.Engineer] = new[]
        {
            ProjectCreate, ProjectEdit, ProjectDuplicate,
            StatusWorkflow,
            CatalogAdd, CatalogEdit, // инженер пополняет справочник, но НЕ удаляет и НЕ импортирует
        },
    };

    /// <summary>Роль из JWT: приоритет admin → manager → engineer (как currentRole в roles.ts).</summary>
    public static string RoleOf(ClaimsPrincipal user) =>
        user.IsInRole(Roles.Admin) ? Roles.Admin :
        user.IsInRole(Roles.Manager) ? Roles.Manager :
        Roles.Engineer;

    public static bool Can(string role, string perm) =>
        Matrix.TryGetValue(role, out var perms) && Array.IndexOf(perms, perm) >= 0;

    public static bool Can(ClaimsPrincipal user, string perm) => Can(RoleOf(user), perm);

    /// <summary>Какое право нужно, чтобы ПЕРЕВЕСТИ проект в указанный статус (зеркало canMoveTo).</summary>
    public static string PermForStatus(ProjectStatus to) =>
        to is ProjectStatus.Won or ProjectStatus.Lost ? StatusDecide : StatusWorkflow;

    /// <summary>Человекочитаемое объяснение отказа (тексты синхронизированы с denyReason в roles.ts).</summary>
    public static string DenyReason(string role, string perm)
    {
        var label = role switch
        {
            Roles.Admin => "Администратор",
            Roles.Manager => "Менеджер",
            _ => "Инженер",
        };
        return perm switch
        {
            ProjectDelete => $"Удаление ТКП доступно менеджеру и администратору (вы — {label})",
            StatusDecide => $"Решение «выиграно/проиграно» принимает менеджер или администратор (вы — {label})",
            CatalogDelete => $"Удалять позиции из общего справочника могут менеджер и администратор (вы — {label})",
            CatalogImport => $"Импорт прайсов доступен менеджеру и администратору (вы — {label})",
            SettingsEdit => $"Реквизиты компании заполняют менеджер и администратор (вы — {label})",
            RatesEdit or UsersManage => $"Раздел доступен только администратору (вы — {label})",
            _ => $"Недостаточно прав (вы — {label})",
        };
    }

    /* ---------------- смена ролей: защита последнего админа ---------------- */

    public const string LastAdminDeny =
        "Нельзя снять роль администратора с последнего администратора — сначала назначьте админом кого-то ещё";

    /// <summary>
    /// Можно ли пользователю с ролями <paramref name="oldRoles"/> назначить
    /// <paramref name="newRole"/>, если всего администраторов <paramref name="adminCount"/>.
    /// Чистая функция — эндпоинт добавляет к ней только подсчёт админов в БД.
    /// </summary>
    public static (bool Ok, string? Reason) CanChangeRole(
        IEnumerable<string> oldRoles, string newRole, int adminCount)
    {
        var wasAdmin = oldRoles.Contains(Roles.Admin, StringComparer.OrdinalIgnoreCase);
        var staysAdmin = string.Equals(newRole, Roles.Admin, StringComparison.OrdinalIgnoreCase);
        if (wasAdmin && !staysAdmin && adminCount <= 1)
            return (false, LastAdminDeny);
        return (true, null);
    }

    /// <summary>Единый формат отказа: 403 + RFC 7807, причина — в detail.</summary>
    public static IResult Forbid(ClaimsPrincipal user, string perm) =>
        Results.Problem(
            statusCode: StatusCodes.Status403Forbidden,
            title: "Forbidden",
            detail: DenyReason(RoleOf(user), perm));
}
