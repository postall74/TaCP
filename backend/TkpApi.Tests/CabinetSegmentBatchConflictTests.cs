using Microsoft.EntityFrameworkCore;
using Npgsql;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class CabinetSegmentBatchConflictTests
{
    [Fact]
    public void HasDuplicateIds_UsesExactCaseSensitiveIds()
    {
        Assert.True(CabinetSegmentBatchConflict.HasDuplicateIds(new[] { "segment-a", "segment-a" }));
        Assert.False(CabinetSegmentBatchConflict.HasDuplicateIds(new[] { "segment-a", "SEGMENT-A" }));
        Assert.False(CabinetSegmentBatchConflict.HasDuplicateIds(Array.Empty<string>()));
    }

    [Theory]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_cabinet_segments", true)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_cabinets", false)]
    [InlineData(PostgresErrorCodes.UniqueViolation, "PK_project_items", false)]
    [InlineData("23503", "PK_cabinet_segments", false)]
    public void Is_OnlyMatchesNestedSegmentPrimaryKey(
        string sqlState, string constraintName, bool expected)
    {
        var postgres = new PostgresException(
            "database error", "ERROR", "ERROR", sqlState,
            detail: "", hint: "", position: 0, internalPosition: 0,
            internalQuery: "", where: "", schemaName: "public",
            tableName: "cabinet_segments", columnName: "", dataTypeName: "",
            constraintName: constraintName, file: "", line: "", routine: "");

        Assert.Equal(expected,
            CabinetSegmentBatchConflict.Is(new DbUpdateException("save failed", postgres)));
    }
}
