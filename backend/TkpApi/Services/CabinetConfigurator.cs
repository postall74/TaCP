namespace TkpApi.Services;

/// <summary>
/// Конфигуратор пустых и преднаполненных шкафов.
/// Генерирует заказные шифры и описания для ТКП.
/// </summary>
public class CabinetConfigurator
{
    /// <summary>
    /// Создаёт конфигурацию пустого шкафа.
    /// </summary>
    public CabinetConfiguration CreateEmptyCabinet(
        string brand, int height, int width, int depth, int ipRating, string mountType)
    {
        var orderCode = GenerateOrderCode(brand, height, width, depth, ipRating, false);
        var description = GenerateDescription(height, width, depth, ipRating, false);
        
        return new CabinetConfiguration(
            Id: Guid.NewGuid().ToString(),
            Name: $"Шкаф {mountType} распределительный",
            OrderCode: orderCode,
            Height: height,
            Width: width,
            Depth: depth,
            IpRating: ipRating,
            MountType: mountType,
            IsPreassembled: false,
            PreinstalledItems: null,
            AssemblyHours: CalculateAssemblyHours(height, width, depth, false),
            PurchaseCost: CalculatePurchaseCost(brand, height, width, depth, ipRating, false),
            Brand: brand,
            Description: description
        );
    }

    /// <summary>
    /// Создаёт конфигурацию преднаполненного шкафа (корпус + АВ микроклимата).
    /// </summary>
    public CabinetConfiguration CreatePreassembledCabinet(
        string brand, int height, int width, int depth, int ipRating,
        List<LineItem> preinstalledItems)
    {
        var orderCode = GenerateOrderCode(brand, height, width, depth, ipRating, true);
        var description = GenerateDescription(height, width, depth, ipRating, true);
        
        return new CabinetConfiguration(
            Id: Guid.NewGuid().ToString(),
            Name: $"Шкаф напольный преднаполненный",
            OrderCode: orderCode,
            Height: height,
            Width: width,
            Depth: depth,
            IpRating: ipRating,
            MountType: "floor",
            IsPreassembled: true,
            PreinstalledItems: preinstalledItems,
            AssemblyHours: CalculateAssemblyHours(height, width, depth, true),
            PurchaseCost: CalculatePurchaseCost(brand, height, width, depth, ipRating, true),
            Brand: brand,
            Description: description
        );
    }

    private string GenerateOrderCode(string brand, int h, int w, int d, int ip, bool preassembled)
    {
        var prefix = brand.ToUpper() switch
        {
            "DKC" => "CQE",
            "EKF" => "PRO",
            "PROVENTO" => "PRV",
            _ => "CAB"
        };
        var suffix = preassembled ? "P" : "E"; // P = preassembled, E = empty
        return $"{prefix}-{h}-{w}-{d}-IP{ip}-{suffix}";
    }

    private string GenerateDescription(int h, int w, int d, int ip, bool preassembled)
    {
        var baseDesc = $"Шкаф напольный распределительный габаритами {h}×{w}×{d} мм, степень защиты IP{ip}.\n";
        baseDesc += "Комплект поставки:\n";
        baseDesc += "• Рама с потолочной панелью\n";
        baseDesc += "• Панели кабельного ввода\n";
        baseDesc += $"• Монтажные траверсы — 2 шт\n";
        baseDesc += "• Дверь\n";
        baseDesc += "• Панель задняя\n";
        baseDesc += "• Панель монтажная\n";
        baseDesc += "• Ключ\n";
        baseDesc += $"• Цоколь 100 мм\n";
        baseDesc += "• Панели боковые — 2 шт";

        if (preassembled)
        {
            baseDesc += "\n\nПреднаполнение:\n";
            baseDesc += "• Автоматические выключатели для распределения питания на микроклимат и освещение";
        }

        return baseDesc;
    }

    private decimal CalculateAssemblyHours(int h, int w, int d, bool preassembled)
    {
        // Базовое время сборки: 3.5 часа для напольного шкафа
        decimal hours = 3.5m;
        
        // Добавляем время за размер
        if (h > 2000) hours += 0.5m;
        if (w > 1000) hours += 0.3m;
        
        // Добавляем время для преднаполненного
        if (preassembled) hours += 1.5m;
        
        return Math.Round(hours * 2) / 2; // Округление до 0.5 часа
    }

    private decimal CalculatePurchaseCost(string brand, int h, int w, int d, int ip, bool preassembled)
    {
        // Базовая стоимость корпуса
        decimal baseCost = brand.ToLower() switch
        {
            "dkc" => 25000,
            "ekf" => 18000,
            "provento" => 22000,
            _ => 20000
        };

        // Добавляем за размер
        var sizeMultiplier = (h / 2000.0m) * (w / 800.0m) * (d / 600.0m);
        baseCost *= sizeMultiplier;

        // Добавляем за IP
        if (ip >= 66) baseCost *= 1.3m;

        // Добавляем для преднаполненного
        if (preassembled) baseCost += 5000;

        return Math.Round(baseCost / 100) * 100; // Округление до 100 рублей
    }
}