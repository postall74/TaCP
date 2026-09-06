using TkpApi;
using Xunit;

namespace TkpApi.Tests;

/* ============================================================
   ТЕСТЫ РАЗБОРА CSV-ПРАЙСОВ (чистая часть CatalogCsv — без БД).
   ============================================================ */

public class CatalogCsvTests
{
    private const string Valid = "KM1-40;Контактор 40А;IEK;Контакторы и реле;нку;шт;1450;AC-3";

    [Fact]
    public void ParseLine_ValidRow_FillsAllFields()
    {
        var e = CatalogCsv.ParseLine(Valid);

        Assert.NotNull(e);
        Assert.Equal("KM1-40", e!.Sku);
        Assert.Equal("Контактор 40А", e.Name);
        Assert.Equal("IEK", e.Brand);
        Assert.Equal("Контакторы и реле", e.Category);
        Assert.Equal(Direction.Nku, e.Direction);
        Assert.Equal("шт", e.Unit);
        Assert.Equal(1450m, e.Purchase);   // единственная цена — закупочная
        Assert.Equal("AC-3", e.Attrs);
    }

    [Fact]
    public void ParseLine_Header_ReturnsNull()
    {
        var header = "артикул;наименование;бренд;категория;направление;ед;закупка;характеристики";
        Assert.Null(CatalogCsv.ParseLine(header));
        Assert.True(CatalogCsv.IsHeader(header));
    }

    [Fact]
    public void ParseLine_TooShort_ReturnsNull()
    {
        Assert.Null(CatalogCsv.ParseLine("только;три;поля"));
    }

    [Fact]
    public void ParseLine_InvalidPrice_ReturnsNull()
    {
        Assert.Null(CatalogCsv.ParseLine("X;N;B;C;нку;шт;НЕЧИСЛО;")); // закупка (c[6]) не число
    }

    [Theory]
    [InlineData("1800", 1800.0)]
    [InlineData("1800.50", 1800.50)]
    [InlineData("1 800,50", 1800.50)]   // русская локаль из Excel
    [InlineData(" 2 290 ", 2290.0)]
    public void ParseLine_PriceFormats_ParsedInvariant(string raw, double expected)
    {
        var e = CatalogCsv.ParseLine($"X;N;B;C;нку;шт;{raw};"); // закупка — c[6]
        Assert.NotNull(e);
        Assert.Equal((decimal)expected, e!.Purchase);
    }

    [Theory]
    [InlineData("нку", Direction.Nku)]
    [InlineData("Nku", Direction.Nku)]
    [InlineData("асу", Direction.Asu)]
    [InlineData("обогрев", Direction.Heat)]
    [InlineData("электрообогрев", Direction.Heat)]
    [InlineData("универсальное", Direction.Uni)]
    [InlineData("что-то неизвестное", Direction.Uni)]
    public void ParseLine_Direction_Mapped(string raw, Direction expected)
    {
        var e = CatalogCsv.ParseLine($"X;N;B;C;{raw};шт;1;2;");
        Assert.NotNull(e);
        Assert.Equal(expected, e!.Direction);
    }

    [Fact]
    public void Parse_MultiLine_KeepsValidDropsHeaderAndBad()
    {
        var text = string.Join("\n",
            "артикул;наименование;бренд;категория;направление;ед;закупка;характеристики",
            "A1;Поз. 1;B1;К1;нку;шт;10;",
            "битая строка",
            "A2;Поз. 2;B2;К2;асу;шт;30;");

        var items = CatalogCsv.Parse(text);

        Assert.Equal(2, items.Count);
        Assert.Equal(new[] { "A1", "A2" }, items.Select(i => i.Sku));
    }

    [Fact]
    public void ParseLine_MissingUnit_DefaultsToSht()
    {
        var e = CatalogCsv.ParseLine("X;N;B;C;нку;;1;2;");
        Assert.NotNull(e);
        Assert.Equal("шт", e!.Unit);
    }
}
