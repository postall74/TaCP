using Microsoft.EntityFrameworkCore;
using Npgsql;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class CabinetBatchConflictTests
{
    [Fact]
    public void HasDuplicateIds_UsesExactCaseSensitiveIds()
    {
        Assert.True(CabinetBatchConflict.HasDuplicateIds(new[] { "cab-a", "cab-a" }));
        Assert.False(CabinetBatchConflict.HasDuplicateIds(new[] { "cab-a", "CAB-A" }));
        Assert.False(CabinetBatchConflict.HasDuplicateIds(Array.Empty<string>()));
    }

    [Theory]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_cabinets", true)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_items", false)]
    [InlineData("23503", "PK_project_cabinets", false)]
    public void Is_OnlyMatchesCabinetPrimaryKey(
        string sqlState, string constraintName, bool expected)
    {
        var postgres = new PostgresException(
            "database error", "ERROR", "ERROR", sqlState,
            detail: "", hint: "", position: 0, internalPosition: 0,
            internalQuery: "", where: "", schemaName: "public",
            tableName: "project_cabinets", columnName: "", dataTypeName: "",
            constraintName: constraintName, file: "", line: "", routine: "");

        Assert.Equal(expected,
            CabinetBatchConflict.Is(new DbUpdateException("save failed", postgres)));
    }
}
