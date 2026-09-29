using System.Text.Json;
using TkpApi;
using Xunit;

namespace TkpApi.Tests;

public class CalcFixtureTests
{
    private sealed class FixtureRoot
    {
        public decimal ComparisonTolerance { get; init; }
        public List<Scenario> Scenarios { get; init; } = [];
    }

    public sealed class Scenario
    {
        public string Id { get; init; } = "";
        public Rates Rates { get; init; } = new();
        public ProjectInput Project { get; init; } = new();
        public List<CabinetInput> Cabinets { get; init; } = [];
        public Dictionary<string, decimal> Expected { get; init; } = [];
    }

    public sealed class ProjectInput
    {
        public decimal Markup { get; init; }
        public decimal WorkMarkup { get; init; }
        public decimal Discount { get; init; }
        public decimal VatRate { get; init; }
        public decimal TzzPct { get; init; }
        public decimal ThirdParty { get; init; }
        public decimal ExtraCosts { get; init; }
        public decimal UnforeseenPct { get; init; }
        public decimal TripCosts { get; init; }
        public decimal TransportPct { get; init; }
        public decimal SmrCost { get; init; }
        public decimal SmrSell { get; init; }
        public decimal PnrCost { get; init; }
        public decimal PnrSell { get; init; }
    }

    public sealed class CabinetInput
    {
        public decimal Hours { get; init; }
        public decimal DesignHours { get; init; }
        public decimal SoftwareHours { get; init; }
        public List<ItemInput> Items { get; init; } = [];
    }

    public sealed class ItemInput
    {
        public decimal Qty { get; init; }
        public decimal Purchase { get; init; }
    }

    public static IEnumerable<object[]> Scenarios()
    {
        var fixture = LoadFixture();
        return fixture.Scenarios.Select(s => new object[] { s, fixture.ComparisonTolerance });
    }

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void SharedFixtureMatchesServerEngine(Scenario scenario, decimal tolerance)
    {
        var p = scenario.Project;
        var project = new Project
        {
            Markup = p.Markup, WorkMarkup = p.WorkMarkup, Discount = p.Discount, VatRate = p.VatRate,
            TzzPct = p.TzzPct, ThirdParty = p.ThirdParty, ExtraCosts = p.ExtraCosts,
            UnforeseenPct = p.UnforeseenPct, TripCosts = p.TripCosts, TransportPct = p.TransportPct,
            SmrCost = p.SmrCost, SmrSell = p.SmrSell, PnrCost = p.PnrCost, PnrSell = p.PnrSell,
            Cabinets = scenario.Cabinets.Select((cab, index) => new Cabinet
            {
                Id = $"cab-{index}", Hours = cab.Hours, DesignHours = cab.DesignHours,
                SoftwareHours = cab.SoftwareHours,
                Items = cab.Items.Select((item, itemIndex) => new LineItem
                {
                    Id = $"item-{index}-{itemIndex}", Qty = item.Qty, Purchase = item.Purchase,
                }).ToList(),
            }).ToList(),
        };

        var actual = CalcEngine.Calc(project, scenario.Rates);
        foreach (var (field, expected) in scenario.Expected)
            Assert.InRange(Math.Abs(Value(actual, field) - expected), 0m, tolerance);
    }

    private static decimal Value(ProjectCalc value, string field) => field switch
    {
        "eqBase" => value.EqBase, "eqCost" => value.EqCost, "markupSum" => value.MarkupSum,
        "laborCost" => value.LaborCost, "laborSell" => value.LaborSell, "laborHours" => value.LaborHours,
        "cabinetsSell" => value.CabinetsSell, "tzzSum" => value.TzzSum,
        "plannedCost" => value.PlannedCost, "unforeseenSum" => value.UnforeseenSum,
        "totalCost" => value.TotalCost, "transportSum" => value.TransportSum, "sellBase" => value.SellBase,
        "discountSum" => value.DiscountSum, "afterDiscount" => value.AfterDiscount, "vatSum" => value.VatSum,
        "total" => value.Total, "profit" => value.Profit, "marginPct" => value.MarginPct,
        "markupPct" => value.MarkupPct, "posCount" => value.PosCount,
        _ => throw new InvalidDataException($"Unknown expected field '{field}'."),
    };

    private static FixtureRoot LoadFixture()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            var path = Path.Combine(directory.FullName, "qa", "fixtures", "calc-v1.json");
            if (File.Exists(path))
                return JsonSerializer.Deserialize<FixtureRoot>(File.ReadAllText(path), new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                }) ?? throw new InvalidDataException("Calculation fixture is empty.");
            directory = directory.Parent;
        }
        throw new FileNotFoundException("Cannot locate qa/fixtures/calc-v1.json from test output directory.");
    }
}
