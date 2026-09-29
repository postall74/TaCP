using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using TkpApi;
using TkpApi.Migrations;
using Xunit;

namespace TkpApi.Tests;

public class RatePersistenceContractTests
{
    [Fact]
    public void EfModelDefinesUnrestrictedNumericSingletonWithDefaults()
    {
        var options = new DbContextOptionsBuilder<TkpDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused")
            .Options;
        using var db = new TkpDbContext(options);
        var entity = db.GetService<IDesignTimeModel>().Model.FindEntityType(typeof(RatesRow))!;

        Assert.Equal("rate_cards", entity.GetTableName());
        Assert.Equal([nameof(RatesRow.Id)], entity.FindPrimaryKey()!.Properties.Select(p => p.Name));
        foreach (var name in new[] { "Design", "Production", "Software", "Smr", "Pnr" })
            Assert.Equal("numeric", entity.FindProperty(name)!.GetColumnType());

        var seed = Assert.Single(entity.GetSeedData());
        Assert.Equal(1, seed[nameof(RatesRow.Id)]);
        Assert.Equal(1800m, seed[nameof(RatesRow.Design)]);
        Assert.Equal(1800m, seed[nameof(RatesRow.Production)]);
        Assert.Equal(2200m, seed[nameof(RatesRow.Software)]);
        Assert.Equal(1800m, seed[nameof(RatesRow.Smr)]);
        Assert.Equal(1800m, seed[nameof(RatesRow.Pnr)]);

        var table = StoreObjectIdentifier.Table("rate_cards", null);
        Assert.Contains(entity.GetCheckConstraints(), c =>
            c.Name == "CK_rate_cards_singleton" && c.Sql == "\"Id\" = 1");
    }

    [Fact]
    public void MigrationCreatesAndSeedsOnlyRateCardsAndDownDropsOnlyIt()
    {
        var migration = new ExposedMigration();
        var up = migration.BuildUpOperations();
        var create = Assert.Single(up.OfType<CreateTableOperation>());
        Assert.Equal("rate_cards", create.Name);
        Assert.Equal(["Id", "Design", "Production", "Software", "Smr", "Pnr"],
            create.Columns.Select(c => c.Name));
        Assert.All(create.Columns.Where(c => c.Name != "Id"), c => Assert.Equal("numeric", c.ColumnType));
        var insert = Assert.Single(up.OfType<InsertDataOperation>());
        Assert.Equal("rate_cards", insert.Table);
        Assert.Equal(1, insert.Values.GetValue(0, Array.IndexOf(insert.Columns, "Id")));

        var drop = Assert.Single(migration.BuildDownOperations().OfType<DropTableOperation>());
        Assert.Equal("rate_cards", drop.Name);
    }

    [Fact]
    public void RoutesKeepStaffAndAdminPoliciesAndUseOneCompleteSqlUpdate()
    {
        var source = File.ReadAllText(FindRepoFile("backend", "TkpApi", "Program.cs"));
        Assert.Contains("MapGet(\"/api/rates\"", source);
        Assert.Contains("SingleAsync(ct)).RequireAuthorization(\"Staff\")", source);
        Assert.Contains("MapPut(\"/api/rates\"", source);
        Assert.Contains("}).RequireAuthorization(\"AdminOnly\")", source);

        var put = source[source.IndexOf("app.MapPut(\"/api/rates\"", StringComparison.Ordinal)..];
        put = put[..put.IndexOf("/* ----------------", StringComparison.Ordinal)];
        Assert.Equal(1, Count(put, "ExecuteUpdateAsync"));
        foreach (var name in new[] { "Design", "Production", "Software", "Smr", "Pnr" })
            Assert.Equal(1, Count(put, $"SetProperty(x => x.{name}, r.{name})"));
        Assert.Contains("if (updated != 1)", put);
    }

    private static int Count(string value, string needle) =>
        (value.Length - value.Replace(needle, "", StringComparison.Ordinal).Length) / needle.Length;

    private static string FindRepoFile(params string[] parts)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var path = Path.Combine([directory.FullName, .. parts]);
            if (File.Exists(path)) return path;
            directory = directory.Parent;
        }
        throw new FileNotFoundException(string.Join('/', parts));
    }

    private sealed class ExposedMigration : PersistTenantRates
    {
        public IReadOnlyList<MigrationOperation> BuildUpOperations()
        {
            var builder = new MigrationBuilder("Npgsql.EntityFrameworkCore.PostgreSQL");
            Up(builder);
            return builder.Operations;
        }

        public IReadOnlyList<MigrationOperation> BuildDownOperations()
        {
            var builder = new MigrationBuilder("Npgsql.EntityFrameworkCore.PostgreSQL");
            Down(builder);
            return builder.Operations;
        }
    }
}
