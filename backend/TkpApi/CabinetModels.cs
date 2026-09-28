namespace TkpApi;

/// <summary>
/// Конфигурация шкафа (пустой или преднаполненный) с заказным шифром.
/// </summary>
public record CabinetConfiguration(
    string Id,
    string Name,                    // "Шкаф напольный распределительный"
    string OrderCode,               // Заказной шифр: "ШНР-2000-800-600-IP54"
    int Height,                     // мм
    int Width,                      // мм
    int Depth,                      // мм
    int IpRating,                   // IP54, IP66
    string MountType,               // "floor" | "wall"
    bool IsPreassembled,            // true = преднаполненный (корпус + АВ микроклимата)
    List<LineItem>? PreinstalledItems,  // Для преднаполненных: АВ освещения, обогрева
    decimal AssemblyHours,          // Часы сборки (включены в стоимость)
    decimal PurchaseCost,           // Закупочная стоимость комплекта
    string Brand,                   // Производитель: "DKC", "EKF", "Provento"
    string Description              // Описание для ТКП
);

/// <summary>
/// Тепловой профиль шкафа для подбора микроклимата.
/// </summary>
public record ThermalProfile(
    string CabinetId,
    double TotalHeatDissipation,    // Суммарное тепловыделение, Вт
    string ClimateClass,            // "УХЛ4", "У1", "Т1"
    string InstallationLocation,    // "indoor", "outdoor", "ventilated"
    double AmbientTempMin,          // Мин. температура окружающей среды, °C
    double AmbientTempMax,          // Макс. температура окружающей среды, °C
    double TargetTempMin,           // Целевая мин. температура внутри шкафа, °C
    double TargetTempMax,           // Целевая макс. температура внутри шкафа, °C
    ThermalRecommendation Recommendation  // Рекомендация по микроклимату
);

/// <summary>
/// Рекомендация по системе микроклимата.
/// </summary>
public record ThermalRecommendation(
    bool NeedsHeater,
    int HeaterPowerWatts,           // Мощность обогревателя, Вт
    bool NeedsFan,
    int FanCount,                   // Количество вентиляторов
    bool NeedsAirConditioner,
    string AirConditionerPower,     // Мощность кондиционера
    string WarningMessage           // Предупреждение для пользователя
);

/// <summary>
/// Тип соединения шкафов в сборку.
/// </summary>
public enum CabinetConnectionType
{
    SideBySide,         // Стенка к стенке (N корпусов в ряд)
    FrontToBack         // Передняя дверь к задней стенке (макс 2 корпуса)
}

/// <summary>
/// Соединение шкафов в сборку.
/// </summary>
public record CabinetConnection(
    string Id,
    string AssemblyName,            // "Шкафная сборка №1"
    CabinetConnectionType Type,
    List<string> CabinetIds,        // ID соединённых шкафов
    int TotalWidth,                 // Общая ширина сборки, мм
    int TotalDepth,                 // Общая глубина сборки, мм
    string ConnectionStandard       // ГОСТ/ТУ: "ГОСТ IEC 61439-2 п.8.4"
);