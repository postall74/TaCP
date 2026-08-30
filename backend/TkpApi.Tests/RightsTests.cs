using System.Security.Claims;
using TkpApi;
using Xunit;

/* ============================================================
   ТЕСТЫ СЕРВЕРНОЙ МАТРИЦЫ ПРАВ (Rights.cs — зеркало roles.ts).
   Сценарии повторяют фронтовые: две реализации прав не расходятся.
   ClaimsPrincipal собирается вручную — Identity и БД не нужны.
   ============================================================ */

public class RightsTests
{
    private static ClaimsPrincipal User(params string[] roles) =>
        new(new ClaimsIdentity(roles.Select(r => new Claim(ClaimTypes.Role, r)), "test"));

    /* ---------------- роль из токена ---------------- */

    [Fact]
    public void RoleOf_PriorityIsAdminThenManagerThenEngineer()
    {
        Assert.Equal(Roles.Admin, Rights.RoleOf(User(Roles.Manager, Roles.Admin)));
        Assert.Equal(Roles.Manager, Rights.RoleOf(User(Roles.Engineer, Roles.Manager)));
        Assert.Equal(Roles.Engineer, Rights.RoleOf(User(Roles.Engineer)));
    }

    [Fact]
    public void RoleOf_UnknownOrEmpty_DegradesToEngineer()
    {
        Assert.Equal(Roles.Engineer, Rights.RoleOf(User()));
        Assert.Equal(Roles.Engineer, Rights.RoleOf(User("superuser")));
    }

    /* ---------------- матрица: кто что может ---------------- */

    [Theory]
    [InlineData(Roles.Admin, Rights.ProjectDelete, true)]
    [InlineData(Roles.Admin, Rights.StatusDecide, true)]
    [InlineData(Roles.Admin, Rights.RatesEdit, true)]
    [InlineData(Roles.Admin, Rights.SettingsEdit, true)]
    [InlineData(Roles.Admin, Rights.UsersManage, true)]
    [InlineData(Roles.Manager, Rights.ProjectDelete, true)]
    [InlineData(Roles.Manager, Rights.StatusDecide, true)]
    [InlineData(Roles.Manager, Rights.RatesEdit, false)]
    [InlineData(Roles.Manager, Rights.SettingsEdit, false)]
    [InlineData(Roles.Manager, Rights.UsersManage, false)]
    [InlineData(Roles.Engineer, Rights.ProjectDelete, false)]
    [InlineData(Roles.Engineer, Rights.StatusDecide, false)]
    [InlineData(Roles.Engineer, Rights.StatusWorkflow, true)]
    [InlineData(Roles.Engineer, Rights.CatalogEdit, true)]
    [InlineData(Roles.Engineer, Rights.RatesEdit, false)]
    public void Can_MatchesFrontendMatrix(string role, string perm, bool expected) =>
        Assert.Equal(expected, Rights.Can(role, perm));

    /* ---------------- статусы: зеркало canMoveTo ---------------- */

    [Fact]
    public void PermForStatus_WonLostRequireDecide()
    {
        Assert.Equal(Rights.StatusDecide, Rights.PermForStatus(ProjectStatus.Won));
        Assert.Equal(Rights.StatusDecide, Rights.PermForStatus(ProjectStatus.Lost));
        Assert.Equal(Rights.StatusWorkflow, Rights.PermForStatus(ProjectStatus.Calc));
        Assert.Equal(Rights.StatusWorkflow, Rights.PermForStatus(ProjectStatus.Sent));
        Assert.Equal(Rights.StatusWorkflow, Rights.PermForStatus(ProjectStatus.Draft));
    }

    [Fact]
    public void Engineer_CannotDecide_ButCanWorkflow()
    {
        var eng = User(Roles.Engineer);
        Assert.False(Rights.Can(eng, Rights.PermForStatus(ProjectStatus.Won)));
        Assert.True(Rights.Can(eng, Rights.PermForStatus(ProjectStatus.Sent)));
    }

    [Fact]
    public void Manager_CanDecideAndDelete()
    {
        var mgr = User(Roles.Manager);
        Assert.True(Rights.Can(mgr, Rights.PermForStatus(ProjectStatus.Lost)));
        Assert.True(Rights.Can(mgr, Rights.ProjectDelete));
    }

    /* ---------------- объяснение отказа ---------------- */

    [Fact]
    public void DenyReason_MentionsRoleAndAction()
    {
        Assert.Contains("менеджеру и администратору", Rights.DenyReason(Roles.Engineer, Rights.ProjectDelete));
        Assert.Contains("Инженер", Rights.DenyReason(Roles.Engineer, Rights.ProjectDelete));
        Assert.Contains("выиграно/проиграно", Rights.DenyReason(Roles.Manager, Rights.StatusDecide));
        Assert.Contains("только администратору", Rights.DenyReason(Roles.Manager, Rights.RatesEdit));
    }

    /* ---------------- защита последнего администратора ---------------- */

    [Fact]
    public void CanChangeRole_LastAdminCannotBeDemoted()
    {
        var (ok, reason) = Rights.CanChangeRole(new[] { Roles.Admin }, Roles.Engineer, adminCount: 1);
        Assert.False(ok);
        Assert.Equal(Rights.LastAdminDeny, reason);

        (ok, _) = Rights.CanChangeRole(new[] { Roles.Admin }, Roles.Manager, adminCount: 1);
        Assert.False(ok);
    }

    [Fact]
    public void CanChangeRole_LastAdminMayKeepOrReassignAdmin()
    {
        // admin → admin (переназначение) при одном админе — разрешено
        var (ok, _) = Rights.CanChangeRole(new[] { Roles.Admin }, Roles.Admin, adminCount: 1);
        Assert.True(ok);
    }

    [Fact]
    public void CanChangeRole_SecondAdminCanBeDemoted()
    {
        var (ok, reason) = Rights.CanChangeRole(new[] { Roles.Admin }, Roles.Engineer, adminCount: 2);
        Assert.True(ok);
        Assert.Null(reason);
    }

    [Fact]
    public void CanChangeRole_NonAdminIsAlwaysAllowed()
    {
        Assert.True(Rights.CanChangeRole(new[] { Roles.Engineer }, Roles.Manager, adminCount: 1).Ok);
        Assert.True(Rights.CanChangeRole(new[] { Roles.Manager }, Roles.Admin, adminCount: 1).Ok);
    }
}
