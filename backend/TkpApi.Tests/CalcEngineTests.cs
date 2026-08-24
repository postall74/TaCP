using TkpApi;
using Xunit;

namespace TkpApi.Tests;

/* ============================================================
   ТЕСТЫ РАСЧЁТНОГО ДВИЖКА (CalcEngine — серверное зеркало
   фронтового calcProject). Набор сценариев повторяет фронтовые
   тесты, чтобы обе реализации гарантированно не расходились.
   ============================================================ */

public class CalcEngineTests
{
    private static readonly Rates TestRates = new()
    {
        Design = 1000, Production = 1000, Software = 2000, Smr = 1000, Pnr = 1000,
    };

    private static Project Make(Action<Project>? mutate = null)
    {
        var p = new Project
        {
            Cabinets = new List<Cabinet>
            {
                new()
                {
                    Kind = "ЩР", Name = "Шкаф 1",
                    Items = new List<LineItem>
                    {
                        new() { Qty = 2, Price = 1000, Purchase = 700 },
                        new() { Qty = 1, Price = 500, Purchase = 300 },
                    },
                },
            },
        };
        mutate?.Invoke(p);
        return p;
    }

    private static decimal R2(decimal v) => Math.Round(v, 2);

    [Fact]
    public void Calc_BaseSums()
    {
        var c = CalcEngine.Calc(Make(), TestRates);
        Assert.Equal(2500m, c.EqBase);   // 2×1000 + 1×500
        Assert.Equal(1700m, c.EqCost);   // 2×700 + 1×300
        Assert.Equal(2, c.PosCount);
    }

    [Fact]
    public void Calc_EquipmentMarkup()
    {
        var c = CalcEngine.Calc(Make(p => p.Markup = 20), TestRates);
        Assert.Equal(500m, c.MarkupSum);      // 20% от 2500
        Assert.Equal(3000m, c.CabinetsSell);
    }

    [Fact]
    public void Calc_LaborByRolesAndWorkMarkup()
    {
        var c = CalcEngine.Calc(Make(p =>
        {
            p.WorkMarkup = 25;
            p.Cabinets[0].Hours = 10;         // × Production 1000
            p.Cabinets[0].DesignHours = 2;    // × Design 1000
            p.Cabinets[0].SoftwareHours = 1;  // × Software 2000
        }), TestRates);

        Assert.Equal(14000m, c.LaborCost);    // 10000 + 2000 + 2000
        Assert.Equal(17500m, c.LaborSell);    // × 1.25
        Assert.Equal(13m, c.LaborHours);
    }

    [Fact]
    public void Calc_DiscountThenVat()
    {
        var c = CalcEngine.Calc(Make(p => { p.Discount = 10; p.VatRate = 20; }), TestRates);
        Assert.Equal(2500m, c.SellBase);
        Assert.Equal(250m, c.DiscountSum);
        Assert.Equal(2250m, c.AfterDiscount);
        Assert.Equal(450m, c.VatSum);
        Assert.Equal(2700m, c.Total);
    }

    [Fact]
    public void Calc_ZeroVat_AddsNothing()
    {
        var c = CalcEngine.Calc(Make(p => p.VatRate = 0), TestRates);
        Assert.Equal(0m, c.VatSum);
        Assert.Equal(c.AfterDiscount, c.Total);
    }

    [Fact]
    public void Calc_ProfitMarginMarkup()
    {
        var c = CalcEngine.Calc(Make(p => p.Markup = 50), TestRates);
        Assert.Equal(2050m, c.Profit);                        // 3750 − 1700
        Assert.Equal(R2(2050m / 3750m * 100m), R2(c.MarginPct));
        Assert.Equal(R2(2050m / 1700m * 100m), R2(c.MarkupPct));
    }

    [Fact]
    public void Calc_TzzAndUnforeseen()
    {
        var c = CalcEngine.Calc(Make(p => { p.TzzPct = 1; p.UnforeseenPct = 2; }), TestRates);
        Assert.Equal(17m, c.TzzSum);                          // 1% от 1700
        var basis = 1700m + 17m;                              // + сторонние/ФОТ/доп = 0
        Assert.Equal(R2(basis * 0.02m), R2(c.UnforeseenSum));
        Assert.Equal(R2(basis * 1.02m), R2(c.PlannedCost));
    }
}
