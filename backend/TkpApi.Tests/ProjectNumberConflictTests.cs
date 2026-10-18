using Microsoft.EntityFrameworkCore;
using Npgsql;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class ProjectNumberConflictTests
{
    [Theory]
    [InlineData(PostgresErrorCodes.UniqueViolation, "IX_projects_Number", true)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_projects", false)]
    [InlineData("23503", "IX_projects_Number", false)]
    public void Is_OnlyMatchesProjectNumberUniqueConstraint(
        string sqlState, string constraintName, bool expected)
    {
        var postgres = new PostgresException(
            "database error", "ERROR", "ERROR", sqlState,
            detail: "", hint: "", position: 0, internalPosition: 0,
            internalQuery: "", where: "", schemaName: "public",
            tableName: "projects", columnName: "", dataTypeName: "",
            constraintName: constraintName, file: "", line: "", routine: "");
        var error = new DbUpdateException("save failed", postgres);

        Assert.Equal(expected, ProjectNumberConflict.Is(error));
    }

    [Fact]
    public void Detail_IsStableForPostAndPut()
    {
        Assert.Equal("Проект с таким номером уже существует", ProjectNumberConflict.Detail);
    }
}
