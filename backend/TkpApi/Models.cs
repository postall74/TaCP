using System.Text.Json;
using Microsoft.AspNetCore.Identity;

namespace TkpApi;

/* ============================================================
   ДОМЕННАЯ МОДЕЛЬ (зеркало src/types.ts фронтенда).
   EF Core мапит эти классы в таблицы PostgreSQL (TkpDbContext).
   Идентификаторы — строки: фронтенд генерирует их сам,
   поэтому контракты JSON совпадают без преобразований.
   ============================================================ */

public enum Direction { Nku, Asu, Heat, Uni }
public enum ProjectStatus { Draft, Calc, Sent, Won, Lost }

/* ---------------- Пользователи и роли (ASP.NET Identity) ---------------- */

/// <summary>Роли приложения. Хранятся в Identity-таблицах (AspNetUserRoles).</summary>
public static class Roles
{
    public const string Admin = "admin";      // всё + управление пользователями
    public const string Manager = "manager";  // коммерция: наценки, скидки, документы, экспорт
    public const string Engineer = "engineer";// техника: структура, шкаф, подбор, справочник
}

/// <summary>Пользователь системы (aspnetusers). Наследует IdentityUser: логин, хэш пароля и т.д.</summary>
public class AppUser : IdentityUser
{
    /// <summary>ФИО для вывода в документы («Исполнитель», «Менеджер»).</summary>
    public string FullName { get; set; } = "";
    /// <summary>Должность.</summary>
    public string Position { get; set; } = "";
}

/* ---------------- Справочник и проекты ---------------- */

/// <summary>Справочник оборудования (equipment_catalog).
/// ВАЖНО (новая модель цен): хранится ТОЛЬКО закупочная цена Purchase.
/// Цена продажи вычисляется один раз: Purchase × (1 + проект.Markup/100).</summary>
public class Equipment
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Category { get; set; } = "";
    public Direction Direction { get; set; } = Direction.Uni;
    public string Unit { get; set; } = "шт";
    public decimal Purchase { get; set; }   // закупочная цена — единственная цена в справочнике
    public decimal RatedCurrent { get; set; } // номинальный ток, А (для правил совместимости)
    public string? Attrs { get; set; }
}

/// <summary>Позиция шкафа. Цена продажи НЕ хранится — вычисляется от Purchase.</summary>
public class LineItem
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string? EqId { get; set; }
    public string Sku { get; set; } = "";
    public string Name { get; set; } = "";
    public string Brand { get; set; } = "";
    public string Unit { get; set; } = "шт";
    public decimal Qty { get; set; }
    public decimal Purchase { get; set; }   // закупочная цена (снимок на момент добавления)
}

/// <summary>Шкаф / секция / линейка (project_cabinets).</summary>
public class Cabinet
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Kind { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Hours { get; set; }
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

    /// <summary>Автор проекта (Id пользователя). Заполняется из JWT при создании.</summary>
    public string? OwnerId { get; set; }

    public decimal Markup { get; set; } = 15;          // % наценки к ЗАКУПОЧНОЙ цене (применяется один раз)
    public decimal WorkMarkup { get; set; } = 25;
    public decimal Discount { get; set; }
    public decimal VatRate { get; set; } = 20;
    public bool ShowWorkLines { get; set; } = true;

    public decimal TzzPct { get; set; } = 1;
    public decimal ThirdParty { get; set; }
    public decimal ExtraCosts { get; set; }
    public decimal UnforeseenPct { get; set; } = 2;
    public decimal TripCosts { get; set; }
    public decimal TransportPct { get; set; }

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
    public JsonElement? Snapshot { get; set; }
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
    public string Manager { get; set; } = "";
    public string Executor { get; set; } = "";
}
