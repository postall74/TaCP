using System.Text.Json;

namespace TkpApi.Services;

/// <summary>Read compatibility for snapshots written before project-version-v1.</summary>
public static class ProjectVersionSnapshots
{
    private static readonly IReadOnlyDictionary<string, string> CabinetFields = Fields(
        "Id", "Kind", "Name", "Hours", "DesignHours", "SoftwareHours", "Note", "Items", "Segments", "Form");
    private static readonly IReadOnlyDictionary<string, string> ItemFields = Fields(
        "Id", "EqId", "Sku", "Name", "Brand", "Unit", "Qty", "Purchase");
    private static readonly IReadOnlyDictionary<string, string> SegmentFields = Fields(
        "Id", "Kind", "Name", "Partitions");

    // Return detached copies: normalizing a response must never dirty stored snapshots.
    public static List<ProjectVersion> ForResponse(IEnumerable<ProjectVersion> versions) =>
        versions.Select(v => new ProjectVersion
        {
            Id = v.Id, Ts = v.Ts, Label = v.Label,
            Snapshot = v.Snapshot is { } snapshot ? Normalize(snapshot) : null,
        }).ToList();

    private static JsonElement Normalize(JsonElement snapshot)
    {
        if (snapshot.ValueKind != JsonValueKind.Object) return snapshot.Clone();
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            foreach (var property in snapshot.EnumerateObject())
            {
                writer.WritePropertyName(property.Name);
                if (property.Name == "cabinets")
                    WriteArray(writer, property.Value, CabinetFields);
                else
                    property.Value.WriteTo(writer); // Includes calc and arbitrary extension data, unchanged.
            }
            writer.WriteEndObject();
        }
        using var document = JsonDocument.Parse(buffer.ToArray());
        return document.RootElement.Clone();
    }

    private static void WriteArray(Utf8JsonWriter writer, JsonElement value,
        IReadOnlyDictionary<string, string> fields)
    {
        if (value.ValueKind != JsonValueKind.Array)
        {
            value.WriteTo(writer); // Preserve null and unrecognized legacy shapes.
            return;
        }
        writer.WriteStartArray();
        foreach (var element in value.EnumerateArray()) WriteObject(writer, element, fields);
        writer.WriteEndArray();
    }

    private static void WriteObject(Utf8JsonWriter writer, JsonElement value,
        IReadOnlyDictionary<string, string> fields)
    {
        if (value.ValueKind != JsonValueKind.Object)
        {
            value.WriteTo(writer);
            return;
        }
        writer.WriteStartObject();
        foreach (var property in value.EnumerateObject())
        {
            var name = fields.TryGetValue(property.Name, out var canonical) ? canonical : property.Name;
            // Preserve both values if a mixed snapshot already has the canonical spelling.
            if (name != property.Name && value.TryGetProperty(name, out _)) name = property.Name;
            writer.WritePropertyName(name);
            if (ReferenceEquals(fields, CabinetFields) && name == "items")
                WriteArray(writer, property.Value, ItemFields);
            else if (ReferenceEquals(fields, CabinetFields) && name == "segments")
                WriteArray(writer, property.Value, SegmentFields);
            else
                property.Value.WriteTo(writer);
        }
        writer.WriteEndObject();
    }

    private static IReadOnlyDictionary<string, string> Fields(params string[] names) =>
        names.ToDictionary(name => name, JsonNamingPolicy.CamelCase.ConvertName, StringComparer.Ordinal);
}
