using System.Text;

namespace TkpApi.Services;

public sealed record CabinetDoorLayoutError(string Detail, string CabinetId, string? ElementId = null);
public sealed record CabinetDoorLayoutVersionConflict(string Detail, string CabinetId, string? Schema);

public static class CabinetDoorLayouts
{
    public const string Schema = "cabinet-door-layout-v1";
    private static readonly HashSet<string> Kinds =
        ["lamp", "button", "selector", "start-stop-pair", "emergency-stop"];
    private static readonly HashSet<string> Tones = ["green", "amber", "red", "neutral"];
    private static readonly HashSet<string> LabelSides = ["above", "below"];

    public static CabinetDoorLayoutError? Validate(Cabinet cabinet) =>
        cabinet.DoorLayout is { } layout ? Validate(cabinet.Id, layout) : null;

    public static CabinetDoorLayoutError? Validate(string cabinetId, CabinetDoorLayout layout)
    {
        if (!string.Equals(layout.Schema, Schema, StringComparison.Ordinal))
            return Error("Неизвестная схема компоновки дверцы", cabinetId);
        if (layout.DoorCount is not (1 or 2))
            return Error("doorCount должен быть равен 1 или 2", cabinetId);
        if (!LabelSides.Contains(layout.LabelSide))
            return Error("labelSide должен быть above или below", cabinetId);
        if (layout.Elements is null)
            return Error("elements обязателен", cabinetId);
        if (layout.Elements.Count > 128)
            return Error("В компоновке допускается не более 128 элементов", cabinetId);

        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var element in layout.Elements)
        {
            if (element is null)
                return Error("Элемент компоновки не может быть null", cabinetId);
            if (element.ElementId is null || UnicodeLength(element.ElementId) is < 1 or > 64)
                return Error("id элемента должен содержать от 1 до 64 символов", cabinetId, element.ElementId);
            if (!ids.Add(element.ElementId))
                return Error("id элемента должен быть уникален внутри шкафа", cabinetId, element.ElementId);
            if (!Kinds.Contains(element.Kind))
                return Error("Неизвестный kind элемента", cabinetId, element.ElementId);
            if (element.Kind == "lamp")
            {
                if (element.Tone is null || !Tones.Contains(element.Tone))
                    return Error("Для lamp требуется tone green, amber, red или neutral", cabinetId, element.ElementId);
            }
            else if (element.Tone is not null)
            {
                return Error("tone допустим только для lamp", cabinetId, element.ElementId);
            }
            if (element.Label is null || UnicodeLength(element.Label) > 120)
                return Error("label должен содержать не более 120 символов", cabinetId, element.ElementId);
            if (element.Door < 0 || element.Door >= layout.DoorCount)
                return Error("door должен ссылаться на существующую дверцу", cabinetId, element.ElementId);
            if (element.X is < 0 or > 1000 || element.Y is < 0 or > 1000)
                return Error("x и y должны быть целыми числами от 0 до 1000", cabinetId, element.ElementId);
        }

        return null;
    }

    public static CabinetDoorLayout Clone(CabinetDoorLayout layout) => new()
    {
        Schema = layout.Schema,
        DoorCount = layout.DoorCount,
        LabelSide = layout.LabelSide,
        Elements = layout.Elements.Select(element => new CabinetDoorElement
        {
            ElementId = element.ElementId,
            Kind = element.Kind,
            Tone = element.Tone,
            Label = element.Label,
            Door = element.Door,
            X = element.X,
            Y = element.Y,
            ExtensionData = CloneExtensionData(element.ExtensionData),
        }).ToList(),
        ExtensionData = CloneExtensionData(layout.ExtensionData),
    };

    public static CabinetDoorLayoutVersionConflict? UnsupportedPersistedSchema(Cabinet cabinet) =>
        cabinet.DoorLayout is { Schema: var schema } && !string.Equals(schema, Schema, StringComparison.Ordinal)
            ? new CabinetDoorLayoutVersionConflict(
                "Компоновка дверцы создана в неподдерживаемой версии; обновите приложение перед изменением шкафа",
                cabinet.Id,
                schema)
            : null;

    private static int UnicodeLength(string value) => value.EnumerateRunes().Count();

    private static Dictionary<string, System.Text.Json.JsonElement>? CloneExtensionData(
        Dictionary<string, System.Text.Json.JsonElement>? source) =>
        source?.ToDictionary(pair => pair.Key, pair => pair.Value.Clone(), StringComparer.Ordinal);

    private static CabinetDoorLayoutError Error(string detail, string cabinetId, string? elementId = null) =>
        new(detail, cabinetId, elementId);
}
