namespace TkpApi;

/// <summary>
/// DTO для запроса теплового расчёта шкафа.
/// </summary>
public record ThermalCalcRequest(
    Cabinet Cabinet,
    List<Equipment> Catalog
);

/// <summary>
/// DTO для запроса создания пустого шкафа.
/// </summary>
public record ConfigureEmptyRequest(
    string Brand,
    int H,
    int W,
    int D,
    int Ip,
    string Mount
);

/// <summary>
/// DTO для запроса создания преднаполненного шкафа.
/// </summary>
public record ConfigurePreassembledRequest(
    string Brand,
    int H,
    int W,
    int D,
    int Ip,
    List<LineItem> Items
);

/// <summary>
/// DTO для запроса создания шкафной сборки.
/// </summary>
public record AssembleRequest(
    string Name,
    List<Cabinet> Cabinets
);