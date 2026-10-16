using System.Text.Json;
using System.Text.Json.Serialization;
using TkpApi.Services;
using Xunit;

namespace TkpApi.Tests;

public class CabinetDoorLayoutContractTests
{
    private static readonly JsonSerializerOptions Wire = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };

    private static CabinetDoorLayout Valid(params CabinetDoorElement[] elements) => new()
    {
        Schema = CabinetDoorLayouts.Schema,
        DoorCount = 2,
        LabelSide = "below",
        Elements = elements.ToList(),
    };

    private static CabinetDoorElement Element(string id = "lamp-0") => new()
    {
        ElementId = id, Kind = "lamp", Tone = "green", Label = "Сеть 1",
        Door = 0, X = 250, Y = 180,
    };

    [Fact]
    public void Fixture_UsesExactWireCasing_AndRoundTrips()
    {
        var path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
            "../../../../TkpApi/cabinet-door-layout-v1.fixture.json"));
        var json = File.ReadAllText(path);
        var layout = JsonSerializer.Deserialize<CabinetDoorLayout>(json, Wire)!;

        Assert.Null(CabinetDoorLayouts.Validate("cab-1", layout));
        using var output = JsonDocument.Parse(JsonSerializer.Serialize(layout, Wire));
        var root = output.RootElement;
        Assert.Equal("cabinet-door-layout-v1", root.GetProperty("schema").GetString());
        Assert.Equal(2, root.GetProperty("doorCount").GetInt32());
        Assert.Equal("below", root.GetProperty("labelSide").GetString());
        Assert.Equal("lamp-0", root.GetProperty("elements")[0].GetProperty("id").GetString());
        Assert.False(root.TryGetProperty("Schema", out _));
        Assert.False(root.GetProperty("elements")[1].TryGetProperty("tone", out _));
    }

    [Theory]
    [InlineData("cabinet-door-layout-v2", 2, "below")]
    [InlineData("cabinet-door-layout-v1", 0, "below")]
    [InlineData("cabinet-door-layout-v1", 3, "below")]
    [InlineData("cabinet-door-layout-v1", 2, "side")]
    public void Rejects_InvalidEnvelope(string schema, int doors, string side)
    {
        var layout = Valid(Element());
        layout.Schema = schema; layout.DoorCount = doors; layout.LabelSide = side;
        Assert.NotNull(CabinetDoorLayouts.Validate("cab-1", layout));
    }

    [Fact]
    public void Rejects_DuplicateIds_CaseSensitively()
    {
        Assert.NotNull(CabinetDoorLayouts.Validate("cab-1", Valid(Element("x"), Element("x"))));
        Assert.Null(CabinetDoorLayouts.Validate("cab-1", Valid(Element("x"), Element("X"))));
    }

    [Fact]
    public void Rejects_InvalidToneKindDoorCoordinatesAndLimits()
    {
        var cases = new List<CabinetDoorLayout>
        {
            Valid(new CabinetDoorElement { ElementId="x", Kind="button", Tone="red", Label="", Door=0, X=0, Y=0 }),
            Valid(new CabinetDoorElement { ElementId="x", Kind="lamp", Tone=null, Label="", Door=0, X=0, Y=0 }),
            Valid(new CabinetDoorElement { ElementId="x", Kind="other", Tone=null, Label="", Door=0, X=0, Y=0 }),
            Valid(new CabinetDoorElement { ElementId="x", Kind="button", Tone=null, Label="", Door=2, X=0, Y=0 }),
            Valid(new CabinetDoorElement { ElementId="x", Kind="button", Tone=null, Label="", Door=0, X=-1, Y=0 }),
            Valid(new CabinetDoorElement { ElementId="x", Kind="button", Tone=null, Label="", Door=0, X=0, Y=1001 }),
            Valid(new CabinetDoorElement { ElementId=new string('x',65), Kind="button", Tone=null, Label="", Door=0, X=0, Y=0 }),
            Valid(new CabinetDoorElement { ElementId="x", Kind="button", Tone=null, Label=new string('я',121), Door=0, X=0, Y=0 }),
            Valid(Enumerable.Range(0,129).Select(i => Element($"x-{i}")).ToArray()),
        };
        Assert.All(cases, layout => Assert.NotNull(CabinetDoorLayouts.Validate("cab-1", layout)));
    }

    [Fact]
    public void UnicodeLimits_CountRunes_NotUtf16Units()
    {
        var element = Element(string.Concat(Enumerable.Repeat("😀", 64)));
        element.Label = string.Concat(Enumerable.Repeat("😀", 120));
        Assert.Null(CabinetDoorLayouts.Validate("cab-1", Valid(element)));
        element.Label += "😀";
        Assert.NotNull(CabinetDoorLayouts.Validate("cab-1", Valid(element)));
    }

    [Fact]
    public void Clone_IsDetached()
    {
        var source = Valid(Element());
        var clone = CabinetDoorLayouts.Clone(source);
        clone.Elements[0].Label = "changed";
        Assert.Equal("Сеть 1", source.Elements[0].Label);
    }

    [Fact]
    public void FutureExtensionData_IsPreservedAcrossTypedRoundTrip()
    {
        const string json = """
          {"schema":"cabinet-door-layout-v2","doorCount":2,"labelSide":"below","futureRoot":true,
           "elements":[{"id":"lamp-0","kind":"lamp","tone":"green","label":"x","door":0,"x":1,"y":2,"rotation":90}]}
          """;
        var typed = JsonSerializer.Deserialize<CabinetDoorLayout>(json, Wire)!;
        using var roundTrip = JsonDocument.Parse(JsonSerializer.Serialize(typed, Wire));
        Assert.True(roundTrip.RootElement.TryGetProperty("futureRoot", out _));
        Assert.True(roundTrip.RootElement.GetProperty("elements")[0].TryGetProperty("rotation", out _));
    }

    [Fact]
    public void PersistedFutureSchema_IsFailClosed_BeforeWrite()
    {
        var cabinet = new Cabinet { Id = "cab-1", DoorLayout = Valid(Element()) };
        Assert.Null(CabinetDoorLayouts.UnsupportedPersistedSchema(cabinet));

        cabinet.DoorLayout.Schema = "cabinet-door-layout-v2";
        var conflict = CabinetDoorLayouts.UnsupportedPersistedSchema(cabinet);

        Assert.NotNull(conflict);
        Assert.Equal("cab-1", conflict.CabinetId);
        Assert.Equal("cabinet-door-layout-v2", conflict.Schema);
    }
}
