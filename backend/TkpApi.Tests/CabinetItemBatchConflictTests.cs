using Microsoft.EntityFrameworkCore;
using Npgsql;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class CabinetItemBatchConflictTests
{
    [Fact]
    public void HasDuplicateIds_UsesExactCaseSensitiveIds()
    {
        Assert.True(CabinetItemBatchConflict.HasDuplicateIds(new[] { "item-a", "item-a" }));
        Assert.False(CabinetItemBatchConflict.HasDuplicateIds(new[] { "item-a", "ITEM-A" }));
        Assert.False(CabinetItemBatchConflict.HasDuplicateIds(Array.Empty<string>()));
    }

    [Theory]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_items", true)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_cabinets", false)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_cabinet_segments", false)]
    [InlineData("23503", "PK_project_items", false)]
    public void Is_OnlyMatchesNestedItemPrimaryKey(
        string sqlState, string constraintName, bool expected)
    {
        var postgres = new PostgresException(
            "database error", "ERROR", "ERROR", sqlState,
            detail: "", hint: "", position: 0, internalPosition: 0,
            internalQuery: "", where: "", schemaName: "public",
            tableName: "project_items", columnName: "", dataTypeName: "",
            constraintName: constraintName, file: "", line: "", routine: "");

        Assert.Equal(expected,
            CabinetItemBatchConflict.Is(new DbUpdateException("save failed", postgres)));
    }
}
