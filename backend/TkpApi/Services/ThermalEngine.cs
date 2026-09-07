namespace TkpApi.Services;

/// <summary>
/// Сервис расчёта тепловыделений и подбора системы микроклимата.
/// Учитывает климатическое исполнение и место установки шкафа.
/// </summary>
public class ThermalEngine
{
    // Тепловыделение типового оборудования (Вт)
    private static readonly Dictionary<string, double> HeatDissipation = new()
    {
        ["Автоматический выключатель"] = 3.5,      // на полюс
        ["Контактор"] = 8.0,
        ["Тепловое реле"] = 5.0,
        ["Преобразователь частоты"] = 45.0,        // на 1 кВт мощности
        ["Блок питания 24В"] = 15.0,
        ["ПЛК"] = 12.0,
        ["Панель оператора"] = 25.0,
        ["Датчик"] = 0.5,
        ["Реле"] = 2.0,
        ["Частотник"] = 50.0,
        ["Светильник LED"] = 8.0
    };

    /// <summary>
    /// Рассчитывает суммарное тепловыделение шкафа.
    /// </summary>
    public double CalculateHeatDissipation(Cabinet cabinet, List<Equipment> catalog)
    {
        double total = 0;
        
        foreach (var item in cabinet.Items)
        {
            var eq = catalog.FirstOrDefault(e => e.Id == item.EqId);
            if (eq == null) continue;

            // Определяем тепловыделение по категории
            var heat = GetHeatForCategory(eq.Category, eq, item.Qty);
            total += heat;
        }

        return total;
    }

    private double GetHeatForCategory(string category, Equipment eq, int qty)
    {
        // Специальные случаи
        if (category.Contains("Преобразователь частоты"))
        {
            // Примерно 3% от мощности двигателя
            var powerKw = ParsePowerFromAttrs(eq.Attrs);
            return powerKw * 30 * qty; // 30 Вт на 1 кВт
        }

        if (category.Contains("Автоматический выключатель"))
        {
            var poles = ParsePolesFromAttrs(eq.Attrs);
            return 3.5 * poles * qty;
        }

        // Стандартные значения
        foreach (var kvp in HeatDissipation)
        {
            if (category.Contains(kvp.Key))
                return kvp.Value * qty;
        }

        return 5.0 * qty; // Значение по умолчанию
    }

    private int ParsePolesFromAttrs(string? attrs)
    {
        if (string.IsNullOrEmpty(attrs)) return 3;
        var match = System.Text.RegularExpressions.Regex.Match(attrs, @"(\d)[PР]");
        return match.Success ? int.Parse(match.Groups[1].Value) : 3;
    }

    private double ParsePowerFromAttrs(string? attrs)
    {
        if (string.IsNullOrEmpty(attrs)) return 1.0;
        var match = System.Text.RegularExpressions.Regex.Match(attrs, @"(\d+\.?\d*)\s*к?Вт");
        return match.Success ? double.Parse(match.Groups[1].Value) : 1.0;
    }

    /// <summary>
    /// Подбирает систему микроклимата на основе теплового профиля.
    /// </summary>
    public ThermalRecommendation RecommendClimateSystem(ThermalProfile profile)
    {
        var heatW = profile.TotalHeatDissipation;
        var tempRise = heatW / 5.5; // °C на 1 Вт (упрощённая формула)
        
        var maxInternalTemp = profile.AmbientTempMax + tempRise;
        var minInternalTemp = profile.AmbientTempMin;

        // Нужен обогреватель?
        bool needsHeater = minInternalTemp < profile.TargetTempMin;
        int heaterPower = needsHeater 
            ? (int)Math.Ceiling((profile.TargetTempMin - minInternalTemp) * 50) // 50 Вт на 1°C
            : 0;

        // Нужен вентилятор?
        bool needsFan = maxInternalTemp > profile.TargetTempMax && heatW < 500;
        int fanCount = needsFan ? (int)Math.Ceiling(heatW / 200.0) : 0;

        // Нужен кондиционер?
        bool needsAC = maxInternalTemp > profile.TargetTempMax && heatW >= 500;
        string acPower = needsAC ? $"{Math.Ceiling(heatW / 100) * 100} Вт" : "";

        // Формируем предупреждение
        string warning = "";
        if (needsHeater && heaterPower > 200)
            warning = $"⚠️ Требуется обогреватель мощностью {heaterPower} Вт";
        else if (needsAC)
            warning = $"⚠️ Требуется кондиционер мощностью {acPower}";
        else if (needsFan && fanCount > 2)
            warning = $"⚠️ Требуется {fanCount} вентилятора";

        return new ThermalRecommendation(
            NeedsHeater: needsHeater,
            HeaterPowerWatts: heaterPower,
            NeedsFan: needsFan,
            FanCount: fanCount,
            NeedsAirConditioner: needsAC,
            AirConditionerPower: acPower,
            WarningMessage: warning
        );
    }
}