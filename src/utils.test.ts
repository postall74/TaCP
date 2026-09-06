import { describe, it, expect } from "vitest";
import type { Project, Rates } from "./types";
import { calcProject, parseCatalogCsv, exportCatalogCsv, plural, fmtMoney } from "./utils";

/* ============================================================
   ТЕСТЫ РАСЧЁТНОГО ЯДРА И УТИЛИТ (utils.ts).
   НОВАЯ МОДЕЛЬ ЦЕН: у позиций только purchase (закупочная);
   наценка проекта применяется к ней один раз.
   ============================================================ */

const RATES: Rates = { design: 1000, production: 1000, software: 2000, smr: 1000, pnr: 1000 };

/** Проект с «чистой» экономикой: все проценты и суммы в нуле.
    Каждый тест переопределяет только то, что проверяет. */
const baseProject = (over: Partial<Project> = {}): Project =>
  ({
    id: "p1", number: "ТКП-1", title: "Тест", client: "", contact: "", direction: "nku",
    status: "draft", createdAt: 0, updatedAt: 0,
    markup: 0, workMarkup: 0, discount: 0, vatRate: 0, showWorkLines: true,
    tzzPct: 0, thirdParty: 0, extraCosts: 0, unforeseenPct: 0, tripCosts: 0, transportPct: 0,
    smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0, validDays: 30, notes: "", versions: [],
    cabinets: [
      {
        id: "c1", kind: "ЩР", name: "Шкаф 1", hours: 0, designHours: 0, softwareHours: 0,
        items: [
          { id: "i1", eqId: "e1", sku: "A", name: "Поз. А", brand: "B", unit: "шт", qty: 2, purchase: 1000 },
          { id: "i2", eqId: "e2", sku: "B", name: "Поз. Б", brand: "B", unit: "шт", qty: 1, purchase: 500 },
        ],
      },
    ],
    ...over,
  }) as Project;

describe("calcProject: базовые суммы", () => {
  it("база наценки равна закупочной стоимости (наценка применяется один раз)", () => {
    const c = calcProject(baseProject(), RATES);
    expect(c.eqBase).toBe(2500); // 2×1000 + 1×500 — закупочные цены
    expect(c.eqCost).toBe(2500); // в новой модели eqBase === eqCost
    expect(c.posCount).toBe(2);
  });

  it("наценка на оборудование", () => {
    const c = calcProject(baseProject({ markup: 20 }), RATES);
    expect(c.markupSum).toBeCloseTo(500); // 20% от 2500
    expect(c.cabinetsSell).toBeCloseTo(3000);
  });

  it("трудозатраты по ролям и наценка на работы", () => {
    const p = baseProject({ workMarkup: 25 });
    p.cabinets[0].hours = 10; // сборка × production=1000
    p.cabinets[0].designHours = 2; // × design=1000
    p.cabinets[0].softwareHours = 1; // × software=2000
    const c = calcProject(p, RATES);
    expect(c.laborCost).toBe(10 * 1000 + 2 * 1000 + 1 * 2000); // 14000
    expect(c.laborSell).toBeCloseTo(14000 * 1.25); // 17500
    expect(c.laborHours).toBe(13);
  });
});

describe("calcProject: скидки, НДС, маржа", () => {
  it("скидка применяется к базе продажи, НДС — после скидки", () => {
    const c = calcProject(baseProject({ discount: 10, vatRate: 20 }), RATES);
    expect(c.sellBase).toBeCloseTo(2500);
    expect(c.discountSum).toBeCloseTo(250);
    expect(c.afterDiscount).toBeCloseTo(2250);
    expect(c.vatSum).toBeCloseTo(450);
    expect(c.total).toBeCloseTo(2700);
  });

  it("нулевой НДС не добавляет сумму", () => {
    const c = calcProject(baseProject({ vatRate: 0 }), RATES);
    expect(c.vatSum).toBe(0);
    expect(c.total).toBeCloseTo(c.afterDiscount);
  });

  it("прибыль, рентабельность и наценка к себестоимости", () => {
    const c = calcProject(baseProject({ markup: 50 }), RATES);
    // продажа 3750, себестоимость 2500 → прибыль 1250
    expect(c.profit).toBeCloseTo(1250);
    expect(c.marginPct).toBeCloseTo((1250 / 3750) * 100, 5);
    expect(c.markupPct).toBeCloseTo((1250 / 2500) * 100, 5);
  });

  it("ТЗР и непредвиденные входят в плановую себестоимость", () => {
    const c = calcProject(baseProject({ tzzPct: 1, unforeseenPct: 2 }), RATES);
    expect(c.tzzSum).toBeCloseTo(25); // 1% от 2500
    const base = 2500 + 25; // + сторонние/ФОТ/доп = 0
    expect(c.unforeseenSum).toBeCloseTo(base * 0.02);
    expect(c.plannedCost).toBeCloseTo(base * 1.02);
  });
});

describe("CSV: импорт прайсов (8 колонок, только закупка)", () => {
  const CSV = [
    "артикул;наименование;бренд;категория;направление;ед;закупка;характеристики",
    "KM1-40;Контактор 40А;IEK;Контакторы и реле;нку;шт;1450;AC-3",
    "PLC-200;Контроллер;ОВЕН;ПЛК и модули;асу;шт;29800;",
    "битая строка без полей",
  ].join("\n");

  it("разбирает валидные строки, пропускает заголовок и мусор", () => {
    const r = parseCatalogCsv(CSV);
    expect(r.items).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.items[0].sku).toBe("KM1-40");
    expect(r.items[0].purchase).toBe(1450);
    expect(r.items[1].direction).toBe("asu");
  });

  it("русские названия направлений мапятся в enum", () => {
    const r = parseCatalogCsv("a;b;c;d;обогрев;м;1;\n");
    expect(r.items[0].direction).toBe("heat");
  });

  it("экспорт-импорт дают согласованный результат", () => {
    const items = parseCatalogCsv(CSV).items;
    const withId = items.map((i, n) => ({ ...i, id: `x${n}` }));
    const out = exportCatalogCsv(withId);
    const r2 = parseCatalogCsv(out);
    expect(r2.items.map((i) => i.sku)).toEqual(withId.map((i) => i.sku));
    expect(r2.items.map((i) => i.purchase)).toEqual(withId.map((i) => i.purchase));
  });
});

describe("форматирование", () => {
  it("plural выбирает правильную форму", () => {
    expect(plural(1, "шкаф", "шкафа", "шкафов")).toBe("шкаф");
    expect(plural(2, "шкаф", "шкафа", "шкафов")).toBe("шкафа");
    expect(plural(5, "шкаф", "шкафа", "шкафов")).toBe("шкафов");
    expect(plural(11, "шкаф", "шкафа", "шкафов")).toBe("шкафов");
    expect(plural(21, "шкаф", "шкафа", "шкафов")).toBe("шкаф");
  });

  it("fmtMoney добавляет символ валюты", () => {
    expect(fmtMoney(1234)).toContain("₽");
    expect(fmtMoney(1234)).toContain("1");
  });
});
