namespace TkpApi.Services;

/// <summary>
/// Прототип предварительной компоновки шкафных сборок; требуется инженерная проверка.
/// Поддерживает соединения "стенка к стенке" и "дверь к задней стенке".
/// </summary>
public class CabinetAssemblyService
{
    private const string PreliminaryAssessment =
        "Предварительная компоновка; соответствие нормативным требованиям не проверено. " +
        "Требуется инженерная проверка. Габариты оценены по названию или значениям по умолчанию.";

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
            ConnectionStandard: PreliminaryAssessment
        );
    }

    /// <summary>
    /// Создаёт сборку шкафов "передняя дверь к задней стенке".
    /// Число корпусов не является нормативной проверкой; результат предварительный.
    /// </summary>
    public CabinetConnection CreateFrontToBackAssembly(
        string assemblyName, List<Cabinet> cabinets)
    {
        if (cabinets.Count < 2)
            throw new ArgumentException("Для сборки нужно минимум 2 шкафа");

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
            ConnectionStandard: PreliminaryAssessment
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
