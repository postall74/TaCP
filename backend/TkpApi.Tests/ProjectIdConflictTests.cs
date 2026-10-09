using Microsoft.EntityFrameworkCore;
using Npgsql;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class ProjectIdConflictTests
{
    [Theory]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_projects", true)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "IX_projects_Number", false)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_cabinets", false)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_items", false)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_cabinet_segments", false)]
    [InlineData("23503", "PK_projects", false)]
    public void Is_OnlyMatchesProjectPrimaryKey(
        string sqlState, string constraintName, bool expected)
    {
        var postgres = new PostgresException(
            "database error", "ERROR", "ERROR", sqlState,
            detail: "", hint: "", position: 0, internalPosition: 0,
            internalQuery: "", where: "", schemaName: "public",
            tableName: "projects", columnName: "", dataTypeName: "",
            constraintName: constraintName, file: "", line: "", routine: "");

        Assert.Equal(expected,
            ProjectIdConflict.Is(new DbUpdateException("save failed", postgres)));
    }
}
