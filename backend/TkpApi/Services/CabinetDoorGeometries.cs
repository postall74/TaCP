namespace TkpApi.Services;

public sealed record CabinetDoorGeometryError(string Detail, string CabinetId, int? Door = null);
public sealed record CabinetDoorGeometryVersionConflict(string Detail, string CabinetId, string? Schema);

public static class CabinetDoorGeometries
{
    public const string Schema = "cabinet-door-geometry-v1";
    public const string Units = "mm";
    public const string View = "outside-front";
    private const int MaxMm = 10_000;

    public static CabinetDoorGeometryError? Validate(Cabinet cabinet) =>
        Validate(cabinet.Id, cabinet.DoorGeometry, cabinet.DoorLayout);

    public static CabinetDoorGeometryError? Validate(
        string cabinetId,
        CabinetDoorGeometry? geometry,
        CabinetDoorLayout? layout)
    {
        if (geometry is null) return null;
        if (!string.Equals(geometry.Schema, Schema, StringComparison.Ordinal))
            return Error("Неизвестная схема геометрии дверцы", cabinetId);
        if (!string.Equals(geometry.Units, Units, StringComparison.Ordinal))
            return Error("units должен быть mm", cabinetId);
        if (!string.Equals(geometry.View, View, StringComparison.Ordinal))
            return Error("view должен быть outside-front", cabinetId);
        if (geometry.Leaves is null || geometry.Leaves.Count is not (1 or 2))
            return Error("leaves должен содержать одну или две дверцы", cabinetId);
        if (layout is not null && geometry.Leaves.Count != layout.DoorCount)
            return Error("Число полотен должно совпадать с doorLayout.doorCount", cabinetId);

        var doors = new HashSet<int>();
        foreach (var leaf in geometry.Leaves)
        {
            if (leaf is null)
                return Error("Полотно дверцы не может быть null", cabinetId);
            if (!doors.Add(leaf.Door))
                return Error("door должен быть уникален", cabinetId, leaf.Door);
            if (leaf.OriginXmm is < 0 or > MaxMm || leaf.OriginYmm is < 0 or > MaxMm)
                return Error("originXmm и originYmm должны быть от 0 до 10000", cabinetId, leaf.Door);
            if (leaf.WidthMm is < 1 or > MaxMm || leaf.HeightMm is < 1 or > MaxMm)
                return Error("Размеры полотна должны быть от 1 до 10000 мм", cabinetId, leaf.Door);
            if ((long)leaf.OriginXmm + leaf.WidthMm > MaxMm ||
                (long)leaf.OriginYmm + leaf.HeightMm > MaxMm)
                return Error("Полотно должно помещаться во фронтальное поле 10000×10000 мм", cabinetId, leaf.Door);

            var placement = leaf.Placement;
            if (placement is null)
                return Error("placement обязателен", cabinetId, leaf.Door);
            if (placement.LeftMm is < 0 or > MaxMm || placement.TopMm is < 0 or > MaxMm)
                return Error("leftMm и topMm должны быть от 0 до 10000", cabinetId, leaf.Door);
            if (placement.WidthMm is < 1 or > MaxMm || placement.HeightMm is < 1 or > MaxMm)
                return Error("Размеры placement должны быть от 1 до 10000 мм", cabinetId, leaf.Door);
            if ((long)placement.LeftMm + placement.WidthMm > leaf.WidthMm ||
                (long)placement.TopMm + placement.HeightMm > leaf.HeightMm)
                return Error("placement должен целиком помещаться внутри полотна", cabinetId, leaf.Door);
        }

        for (var door = 0; door < geometry.Leaves.Count; door++)
            if (!doors.Contains(door))
                return Error("door должен задавать последовательные индексы от 0", cabinetId, door);

        if (geometry.Leaves.Count == 2 && Overlaps(geometry.Leaves[0], geometry.Leaves[1]))
            return Error("Полотна дверцы не должны перекрываться", cabinetId);

        return null;
    }

    public static CabinetDoorGeometry Clone(CabinetDoorGeometry geometry) => new()
    {
        Schema = geometry.Schema,
        Units = geometry.Units,
        View = geometry.View,
        Leaves = geometry.Leaves.Select(leaf => new CabinetDoorLeaf
        {
            Door = leaf.Door,
            OriginXmm = leaf.OriginXmm,
            OriginYmm = leaf.OriginYmm,
            WidthMm = leaf.WidthMm,
            HeightMm = leaf.HeightMm,
            Placement = new CabinetDoorPlacement
            {
                LeftMm = leaf.Placement.LeftMm,
                TopMm = leaf.Placement.TopMm,
                WidthMm = leaf.Placement.WidthMm,
                HeightMm = leaf.Placement.HeightMm,
                ExtensionData = CloneExtensionData(leaf.Placement.ExtensionData),
            },
            ExtensionData = CloneExtensionData(leaf.ExtensionData),
        }).ToList(),
        ExtensionData = CloneExtensionData(geometry.ExtensionData),
    };

    public static CabinetDoorGeometryVersionConflict? UnsupportedPersistedSchema(Cabinet cabinet) =>
        cabinet.DoorGeometry is { Schema: var schema } && !string.Equals(schema, Schema, StringComparison.Ordinal)
            ? new CabinetDoorGeometryVersionConflict(
                "Геометрия дверцы создана в неподдерживаемой версии; обновите приложение перед изменением шкафа",
                cabinet.Id,
                schema)
            : null;

    private static bool Overlaps(CabinetDoorLeaf first, CabinetDoorLeaf second) =>
        first.OriginXmm < (long)second.OriginXmm + second.WidthMm &&
        second.OriginXmm < (long)first.OriginXmm + first.WidthMm &&
        first.OriginYmm < (long)second.OriginYmm + second.HeightMm &&
        second.OriginYmm < (long)first.OriginYmm + first.HeightMm;

    private static Dictionary<string, System.Text.Json.JsonElement>? CloneExtensionData(
        Dictionary<string, System.Text.Json.JsonElement>? source) =>
        source?.ToDictionary(pair => pair.Key, pair => pair.Value.Clone(), StringComparer.Ordinal);

    private static CabinetDoorGeometryError Error(string detail, string cabinetId, int? door = null) =>
        new(detail, cabinetId, door);
}
