using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class AuthRegistrationTests
{
    [Fact]
    public void RoleAssignmentFailureDetail_IsStableAndDoesNotExposeStoreInternals()
    {
        Assert.Equal(
            "Не удалось назначить роль пользователю. Повторите попытку позже",
            AuthExtensions.RoleAssignmentFailureDetail);
        Assert.DoesNotContain("AspNet", AuthExtensions.RoleAssignmentFailureDetail);
        Assert.DoesNotContain("exception", AuthExtensions.RoleAssignmentFailureDetail,
            StringComparison.OrdinalIgnoreCase);
    }
}
