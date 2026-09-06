namespace TkpApi;

/* ============================================================
   РАСЧЁТНЫЙ ДВИЖОК (серверное зеркало фронтового calcProject).
   НОВАЯ МОДЕЛЬ ЦЕН: единственная цена позиции — закупочная (Purchase).
   Наценка применяется ОДИН раз: цена_продажи = закупка × (1 + Markup/100).

   Шкаф:
     eqBase (=eqCost) = Σ Purchase×Qty            — база наценки = себестоимость
     markupSum        = eqBase × Markup/100
     laborCost        = Σ часы_роли × ставка_роли — ФОТ (себестоимость работ)
     laborSell        = laborCost × (1 + WorkMarkup/100)
     total            = eqBase + markupSum + laborSell

   Проект:
     Себестоимость = eqCost + ТЗР% + сторонние + ФОТ + доп.затраты
                     + непредвиденные% + командировки + СМР + ПНР.
     Продажа = шкафы + СМР_sell + ПНР_sell + доставка% → скидка% → НДС%.
   ============================================================ */

public record CabinetCalc(
    Cabinet Cab,
    decimal EqBase,      // база наценки = Σ закупка×кол-во (в новой модели равна EqCost)
    decimal EqCost,      // Σ закупка×кол-во — себестоимость оборудования
    decimal MarkupSum,   // наценка на оборудование
    decimal LaborCost,   // ФОТ по ролям (себестоимость работ)
    decimal LaborSell,   // работы к продаже
    decimal Total,       // продажная стоимость шкафа
    int PosCount);

public record ProjectCalc(
    List<CabinetCalc> Cabs,
    decimal EqBase,
    decimal EqCost,
    decimal MarkupSum,
    decimal LaborCost,
    decimal LaborSell,
    decimal LaborHours,     // Σ чел·ч (сборка + проектирование + ПО)
    decimal CabinetsSell,   // Σ продажных стоимостей шкафов
    decimal TzzSum,         // транспортно-заготовительные
    decimal PlannedCost,    // плановая себестоимость с непредвиденными
    decimal UnforeseenSum,
    decimal TotalCost,      // полная себестоимость (+командировки, СМР, ПНР)
    decimal TransportSum,   // доставка до заказчика
    decimal SellBase,
    decimal DiscountSum,
    decimal AfterDiscount,
    decimal VatSum,
    decimal Total,          // ИТОГО к оплате
    decimal Profit,
    decimal MarginPct,      // рентабельность продаж, %
    decimal MarkupPct,      // наценка к себестоимости, %
    int PosCount);

public static class CalcEngine
{
    public static ProjectCalc Calc(Project p, Rates r)
    {
        var cabs = p.Cabinets.Select(cab =>
        {
            var eqCost = cab.Items.Sum(i => i.Purchase * i.Qty); // себестоимость = закупочная
            var eqBase = eqCost;                                 // наценка один раз: база наценки = закупка
            var markupSum = eqBase * (p.Markup / 100m);
            var laborCost = cab.Hours * r.Production
                          + cab.DesignHours * r.Design
                          + cab.SoftwareHours * r.Software;
            var laborSell = laborCost * (1m + p.WorkMarkup / 100m);
            return new CabinetCalc(cab, eqBase, eqCost, markupSum, laborCost, laborSell,
                                   eqBase + markupSum + laborSell, cab.Items.Count);
        }).ToList();

        var eqBase = cabs.Sum(c => c.EqBase);
        var eqCost = cabs.Sum(c => c.EqCost);
        var markupSum = cabs.Sum(c => c.MarkupSum);
        var laborCost = cabs.Sum(c => c.LaborCost);
        var laborSell = cabs.Sum(c => c.LaborSell);
        var laborHours = p.Cabinets.Sum(c => c.Hours + c.DesignHours + c.SoftwareHours);
        var cabinetsSell = cabs.Sum(c => c.Total);

        var tzzSum = eqCost * (p.TzzPct / 100m);
        var unforeseenBase = eqCost + tzzSum + p.ThirdParty + laborCost + p.ExtraCosts;
        var unforeseenSum = unforeseenBase * (p.UnforeseenPct / 100m);
        var plannedCost = unforeseenBase + unforeseenSum;
        var totalCost = plannedCost + p.TripCosts + p.SmrCost + p.PnrCost;

        var transportSum = eqBase * (p.TransportPct / 100m);
        var sellBase = cabinetsSell + p.SmrSell + p.PnrSell + transportSum;
        var discountSum = sellBase * (p.Discount / 100m);
        var afterDiscount = sellBase - discountSum;
        var vatSum = afterDiscount * (p.VatRate / 100m);
        var total = afterDiscount + vatSum;
        var profit = afterDiscount - totalCost;
        var marginPct = afterDiscount > 0 ? profit / afterDiscount * 100m : 0m;
        var markupPct = totalCost > 0 ? profit / totalCost * 100m : 0m;

        return new ProjectCalc(cabs, eqBase, eqCost, markupSum, laborCost, laborSell,
                               laborHours, cabinetsSell, tzzSum, plannedCost, unforeseenSum,
                               totalCost, transportSum, sellBase, discountSum, afterDiscount,
                               vatSum, total, profit, marginPct, markupPct, cabs.Sum(c => c.PosCount));
    }
}
