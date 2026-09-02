using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace TkpApi;

/* ============================================================
   JSON-КОНВЕРТЕРЫ: контракт дат с фронтендом.

   Фронтенд (src/types.ts: Project.createdAt/updatedAt,
   ProjectVersion.ts) хранит даты как unix-миллисекунды (number).
   Без конвертера System.Text.Json падает при десериализации
   числа в DateTime — сервер отвечал «HTTP 400 Bad Request» на
   POST/PUT /api/projects (проект создавался локально, но не
   долетал до БД). Конвертер читает и unix-мс, и ISO-строку
   (совместимость), а пишет unix-мс — ровно то, что ждёт клиент.
   ============================================================ */

public sealed class UnixMsDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType switch
        {
            JsonTokenType.Number => DateTimeOffset.FromUnixTimeMilliseconds(reader.GetInt64()).UtcDateTime,
            JsonTokenType.String => DateTime.Parse(
                reader.GetString() ?? "",
                CultureInfo.InvariantCulture,
                DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal),
            _ => throw new JsonException($"Ожидалась дата (unix-мс или ISO-строка), получено: {reader.TokenType}"),
        };

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        var kind = value.Kind == DateTimeKind.Unspecified ? DateTimeKind.Utc : value.Kind;
        writer.WriteNumberValue(new DateTimeOffset(DateTime.SpecifyKind(value, kind)).ToUnixTimeMilliseconds());
    }
}
