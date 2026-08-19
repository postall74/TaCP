using System.Text.Json;

namespace TkpApi;

/* ============================================================
   ДОМЕННАЯ МОДЕЛЬ (зеркало src/types.ts фронтенда).
   EF Core мапит эти классы в таблицы PostgreSQL (TkpDbContext).
   Идентификаторы — строки: фронтенд генерирует их сам,
   поэтому контракты JSON совпадают без преобразований.
   ============================================================ */

public enum Direction { Nku, Asu, Heat, Uni }
public enum ProjectStatus { Draft, Calc, Sent, Won, Lost }

/// <summary>Справочник оборудования (equipment_catalog).</summary>
public class Equipment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Category { get; set; } = "";
    public Direction Direction { get; set; } = Direction.Uni;
    public string Unit { get; set; } = "шт";
    public decimal Purchase { get; set; }   // закупочная цена — для себестоимости
    public decimal Price { get; set; }      // цена продажи
    public string? Attrs { get; set; }      // «напольный, IP54», «4-20 мА»…
}

/// <summary>Позиция шкафа со снимком цены на момент добавления (project_items).</summary>
public class LineItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? EqId { get; set; }       // ссылка на справочник (может отсутствовать у импортированных)
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Unit { get; set; } = "шт";
    public decimal Qty { get; set; }
    public decimal Price { get; set; }
    public decimal Purchase { get; set; }
}

/// <summary>Шкаф / секция / линейка (project_cabinets).</summary>
public class Cabinet
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Kind { get; set; } = "";            // ГРЩ, АВР, Шкаф ПЛК, ЗИП…
    public string Name { get; set; } = "";
    public decimal Hours { get; set; }                // сборка, чел·ч
    public decimal DesignHours { get; set; }
    public decimal SoftwareHours { get; set; }
    public string? Note { get; set; }
    public List<LineItem> Items { get; set; } = new();
}

/// <summary>Проект ТКП (projects) — мета-данные + вся экономика.</summary>
public class Project
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Number { get; set; } = "";
    public string Title { get; set; } = "";
    public string Client { get; set; } = "";
    public string Contact { get; set; } = "";
    public Direction Direction { get; set; } = Direction.Nku;
    public ProjectStatus Status { get; set; } = ProjectStatus.Draft;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public decimal Markup { get; set; } = 15;          // % на оборудование
    public decimal WorkMarkup { get; set; } = 25;      // % на работы
    public decimal Discount { get; set; }
    public decimal VatRate { get; set; } = 20;
    public bool ShowWorkLines { get; set; } = true;

    public decimal TzzPct { get; set; } = 1;           // транспортно-заготовительные, %
    public decimal ThirdParty { get; set; }
    public decimal ExtraCosts { get; set; }
    public decimal UnforeseenPct { get; set; } = 2;
    public decimal TripCosts { get; set; }
    public decimal TransportPct { get; set; }          // доставка до заказчика, %

    public decimal SmrCost { get; set; }
    public decimal SmrSell { get; set; }
    public decimal PnrCost { get; set; }
    public decimal PnrSell { get; set; }

    public int ValidDays { get; set; } = 30;
    public string Notes { get; set; } = "";

    public List<Cabinet> Cabinets { get; set; } = new();
    public List<ProjectVersion> Versions { get; set; } = new();
}

/// <summary>Снимок версии ТКП (project_versions, snapshot — jsonb).</summary>
public class ProjectVersion
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public DateTime Ts { get; set; } = DateTime.UtcNow;
    public string Label { get; set; } = "";
    public JsonElement? Snapshot { get; set; }          // cabinets + {eqBase,total}
}

/// <summary>Ставки чел·часов по ролям (rate_cards).</summary>
public class Rates
{
    public decimal Design { get; set; } = 1800;
    public decimal Production { get; set; } = 1800;
    public decimal Software { get; set; } = 2200;
    public decimal Smr { get; set; } = 1800;
    public decimal Pnr { get; set; } = 1800;
}

/// <summary>Реквизиты компании для документов (settings.company jsonb).</summary>
public class CompanySettings
{
    public string CompanyName { get; set; } = "";
    public string Tagline { get; set; } = "";
    public string Address { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Email { get; set; } = "";
    public string Requisites { get; set; } = "";
    public string Manager { get; set; } = "";          // подписант
    public string Executor { get; set; } = "";         // исполнитель
}
