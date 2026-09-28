namespace TkpApi.Services;

/// <summary>
/// Сервис управления шкафными сборками.
/// Поддерживает соединения "стенка к стенке" и "дверь к задней стенке".
/// </summary>
public class CabinetAssemblyService
{
    /// <summary>
    /// Создаёт сборку шкафов "стенка к стенке".
    /// </summary>
    public CabinetConnection CreateSideBySideAssembly(
        string assemblyName, List<Cabinet> cabinets)
    {
        if (cabinets.Count < 2)
            throw new ArgumentException("Для сборки нужно минимум 2 шкафа");

        // Проверяем что глубина одинаковая
        var depths = cabinets.Select(c => GetDepth(c)).Distinct().ToList();
        if (depths.Count > 1)
            throw new ArgumentException("Все шкафы в сборке должны иметь одинаковую глубину");

        var totalWidth = cabinets.Sum(c => GetWidth(c));
        var depth = depths.First();

        return new CabinetConnection(
            Id: Guid.NewGuid().ToString(),
            AssemblyName: assemblyName,
            Type: CabinetConnectionType.SideBySide,
            CabinetIds: cabinets.Select(c => c.Id).ToList(),
            TotalWidth: totalWidth,
            TotalDepth: depth,
            ConnectionStandard: "ГОСТ IEC 61439-2 п.8.4.2"
        );
    }

    /// <summary>
    /// Создаёт сборку шкафов "передняя дверь к задней стенке".
    /// Согласно ГОСТ IEC 61439-2, максимальное количество корпусов в такой сборке — 2.
    /// </summary>
    public CabinetConnection CreateFrontToBackAssembly(
        string assemblyName, List<Cabinet> cabinets)
    {
        if (cabinets.Count != 2)
            throw new ArgumentException("Сборка 'дверь к задней стенке' допускает только 2 корпуса");

        // Проверяем что ширина одинаковая
        var widths = cabinets.Select(c => GetWidth(c)).Distinct().ToList();
        if (widths.Count > 1)
            throw new ArgumentException("Шкафы должны иметь одинаковую ширину");

        var width = widths.First();
        var totalDepth = cabinets.Sum(c => GetDepth(c));

        return new CabinetConnection(
            Id: Guid.NewGuid().ToString(),
            AssemblyName: assemblyName,
            Type: CabinetConnectionType.FrontToBack,
            CabinetIds: cabinets.Select(c => c.Id).ToList(),
            TotalWidth: width,
            TotalDepth: totalDepth,
            ConnectionStandard: "ГОСТ IEC 61439-2 п.8.4.3"
        );
    }

    private int GetWidth(Cabinet cabinet)
    {
        // Парсим ширину из названия или атрибутов
        var match = System.Text.RegularExpressions.Regex.Match(cabinet.Name, @"\d{3,4}[×xX](\d{3,4})");
        return match.Success ? int.Parse(match.Groups[1].Value) : 800;
    }

    private int GetDepth(Cabinet cabinet)
    {
        var match = System.Text.RegularExpressions.Regex.Match(cabinet.Name, @"\d{3,4}[×xX]\d{3,4}[×xX](\d{3,4})");
        return match.Success ? int.Parse(match.Groups[1].Value) : 600;
    }
}