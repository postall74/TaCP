using System.Globalization;
using System.Text.RegularExpressions;

namespace TkpApi;

/* ============================================================
   РАЗБОР CSV ПРАЙС-ЛИСТА.

   Класс намеренно расслоён на две части:
   • ЧИСТАЯ (ParseLine / Parse / IsHeader) — не знает о базе данных.
     Именно она покрыта модульными тестами (TkpApi.Tests) и может быть
     перенесена в десктоп/мобильную версию без изменений.
   • С ЗАПИСЬЮ В БД (Import) — тонкая обёртка: сливает разобранные
     строки с существующим справочником (по артикулу).

   Числа разбираются инвариантно: принимаются и «1800», и «1 800,00»,
   и «1800.00» — чтобы переживать выгрузки из Excel с русской локалью.
   ============================================================ */

public static class CatalogCsv
{
    /// <summary>Первая ячейка строки — заголовок «артикул…»?</summary>
    public static bool IsHeader(string line) =>
        Regex.IsMatch(line.Trim().Split(';').FirstOrDefault() ?? "", "артикул|sku", RegexOptions.IgnoreCase);

    /// <summary>
    /// Разбор одной строки формата
    /// «артикул;наименование;бренд;категория;направление;ед;закупка;цена;характеристики».
    /// Возвращает null для заголовка и некорректных строк.
    /// </summary>
    public static Equipment? ParseLine(string line)
    {
        if (IsHeader(line)) return null;
        var c = line.Trim().Split(';');
        if (c.Length < 8) return null;                                   // слишком короткая
        if (!Dec(c[7], out var price)) return null;                      // нет валидной цены
        Dec(c[6], out var purchase);                                     // закупка может отсутствовать
        return new Equipment
        {
            Sku = c[0].Trim(),
            Name = c[1].Trim(),
            Brand = c[2].Trim(),
            Category = c[3].Trim(),
            Direction = ParseDir(c[4]),
            Unit = string.IsNullOrWhiteSpace(c[5]) ? "шт" : c[5].Trim(),
            Purchase = purchase,
            Price = price,
            Attrs = c.Length > 8 && !string.IsNullOrWhiteSpace(c[8]) ? c[8].Trim() : null,
        };
    }

    /// <summary>Разбор всего текста: заголовок и битые строки отбрасываются.</summary>
    public static List<Equipment> Parse(string text) =>
        text.Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(ParseLine)
            .Where(e => e is not null)
            .ToList()!;

    /// <summary>
    /// Слияние с БД: существующие позиции (по артикулу, без учёта регистра)
    /// обновляются, новые добавляются. Возвращает счётчики для отчёта импорта.
    /// </summary>
    public static (int added, int updated, int skipped) Import(TkpDbContext db, string text)
    {
        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var bySku = db.Equipment.ToList().ToDictionary(e => e.Sku.ToLowerInvariant());
        int added = 0, updated = 0, skipped = 0;

        foreach (var line in lines)
        {
            if (IsHeader(line)) continue;               // шапку не считаем за пропуск
            var e = ParseLine(line);
            if (e is null) { skipped++; continue; }     // битые данные — в отчёт

            if (bySku.TryGetValue(e.Sku.ToLowerInvariant(), out var ex))
            {
                ex.Name = e.Name; ex.Brand = e.Brand; ex.Category = e.Category;
                ex.Direction = e.Direction; ex.Unit = e.Unit;
                ex.Purchase = e.Purchase; ex.Price = e.Price; ex.Attrs = e.Attrs;
                updated++;
            }
            else
            {
                db.Equipment.Add(e);
                bySku[e.Sku.ToLowerInvariant()] = e;
                added++;
            }
        }
        return (added, updated, skipped);
    }

    /* ---------------- вспомогательное ---------------- */

    private static bool Dec(string s, out decimal v) =>
        decimal.TryParse(s.Trim().Replace(" ", "").Replace(',', '.'),
                         NumberStyles.Number, CultureInfo.InvariantCulture, out v);

    private static Direction ParseDir(string s) => s.Trim().ToLowerInvariant() switch
    {
        "nku" or "нку" => Direction.Nku,
        "asu" or "асу" => Direction.Asu,
        "heat" or "обогрев" or "электрообогрев" => Direction.Heat,
        _ => Direction.Uni,
    };
}
