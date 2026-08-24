import { describe, it, expect } from "vitest";
import type { Cabinet, Equipment, LineItem, Project } from "../types";
import { validateProject, validateCabinet, summarize, type ValidateCtx } from "./rules";

/* ============================================================
   ТЕСТЫ ДВИЖКА СОВМЕСТИМОСТИ (rules.ts).
   Фикстуры строят минимальные Equipment/Cabinet/Project —
   только те поля, что реально читает движок.
   ============================================================ */

const eq = (p: Partial<Equipment> & { id: string }): Equipment => ({
  sku: "SKU", name: "Позиция", brand: "B", category: "Прочее", direction: "nku",
  unit: "шт", purchase: 0, price: 0, ...p,
});

const item = (e: Equipment, qty = 1): LineItem => ({
  id: `li-${e.id}`, eqId: e.id, sku: e.sku, name: e.name, brand: e.brand,
  unit: e.unit, qty, price: e.price, purchase: e.purchase,
});

const cab = (items: LineItem[], id = "cab-1"): Cabinet => ({
  id, kind: "ЩР", name: "Тестовый шкаф", hours: 0, designHours: 0, softwareHours: 0, items,
});

const project = (cabinets: Cabinet[]): Project =>
  ({ cabinets, direction: "nku" } as unknown as Project);

const ctx = (catalog: Equipment[], cabinets: Cabinet[]): ValidateCtx => ({
  catalog,
  project: project(cabinets),
});

/* ---------------- фикстуры оборудования ---------------- */

const bus63 = eq({ id: "bus63", sku: "PS-63 3P", name: "Шина соединительная 3P, 63 А", category: "Шины и клеммы", ratedCurrent: 63 });
const bus250 = eq({ id: "bus250", sku: "ШМТ 40×4", name: "Шина медная 40×4", category: "Шины и клеммы", ratedCurrent: 250 });
const brk100 = eq({ id: "brk100", sku: "NSX100", name: "Автомат 100 А", category: "Автоматические выключатели", ratedCurrent: 100 });
const brk80 = eq({ id: "brk80", sku: "ВА47-100 C80", name: "Автомат 80 А", category: "Автоматические выключатели", ratedCurrent: 80 });
const brk40 = eq({ id: "brk40", sku: "iK60 C40", name: "Автомат 40 А", category: "Автоматические выключатели", ratedCurrent: 40 });
const brk16 = eq({ id: "brk16", sku: "iK60 C16", name: "Автомат 16 А", category: "Автоматические выключатели", ratedCurrent: 16 });
const uzip = eq({ id: "uzip", sku: "OVR T2", name: "УЗИП тип 2", category: "УЗИП и защита" });
const plc = eq({ id: "plc", sku: "ПЛК110", name: "Контроллер ПЛК110", category: "ПЛК и модули" });
const psu = eq({ id: "psu", sku: "DRP-120", name: "Блок питания 24 В", category: "Блоки питания" });
const hmi = eq({ id: "hmi", sku: "СП310", name: "Панель оператора", category: "Панели оператора" });
const heat = eq({ id: "heat", sku: "TMC 30", name: "Кабель греющий", category: "Греющий кабель" });
const thermo = eq({ id: "thermo", sku: "РТД-16", name: "Терморегулятор", category: "Управление обогревом" });

const hasId = (issues: ReturnType<typeof validateProject>, id: string) =>
  issues.some((i) => i.id.includes(id));

describe("правило: отходящий автомат мощнее шины", () => {
  it("даёт ошибку, когда отходящий аппарат превышает номинал шины", () => {
    const c = cab([item(brk100), item(brk80), item(bus63)]);
    const issues = validateCabinet(c, ctx([brk100, brk80, bus63], [c]));
    expect(issues.some((i) => i.severity === "error")).toBe(true);
    expect(hasId(issues, "brk-bus")).toBe(true);
  });

  it("не ругается, когда отходящие аппараты в пределах шины", () => {
    const c = cab([item(brk100), item(brk40), item(bus63)]);
    const issues = validateCabinet(c, ctx([brk100, brk40, bus63], [c]));
    expect(issues.some((i) => i.severity === "error")).toBe(false);
  });

  it("мощная шина снимает ошибку", () => {
    const c = cab([item(brk100), item(brk80), item(bus250)]);
    const issues = validateCabinet(c, ctx([brk100, brk80, bus250], [c]));
    expect(issues.some((i) => i.severity === "error")).toBe(false);
  });
});

describe("правило: много автоматов без соединительной шины", () => {
  it("подсказывает добавить шину при 3+ автоматах", () => {
    const c = cab([item(brk100), item(brk40), item(brk16)]);
    const issues = validateCabinet(c, ctx([brk100, brk40, brk16], [c]));
    expect(hasId(issues, "no-bus")).toBe(true);
  });

  it("молчит, когда шина есть", () => {
    const c = cab([item(brk100), item(brk40), item(brk16), item(bus63)]);
    const issues = validateCabinet(c, ctx([brk100, brk40, brk16, bus63], [c]));
    expect(hasId(issues, "no-bus")).toBe(false);
  });
});

describe("правило: УЗИП без вводного аппарата", () => {
  it("предупреждает, если УЗИП стоит один", () => {
    const c = cab([item(uzip)]);
    const issues = validateCabinet(c, ctx([uzip], [c]));
    expect(hasId(issues, "uzip")).toBe(true);
  });

  it("молчит, если перед УЗИП есть автомат", () => {
    const c = cab([item(uzip), item(brk100)]);
    const issues = validateCabinet(c, ctx([uzip, brk100], [c]));
    expect(hasId(issues, "uzip")).toBe(false);
  });
});

describe("правило: ПЛК без блока питания", () => {
  it("предупреждает о ПЛК без БП", () => {
    const c = cab([item(plc)]);
    const issues = validateCabinet(c, ctx([plc], [c]));
    expect(hasId(issues, "plc-psu")).toBe(true);
  });

  it("молчит, когда БП добавлен", () => {
    const c = cab([item(plc), item(psu)]);
    const issues = validateCabinet(c, ctx([plc, psu], [c]));
    expect(hasId(issues, "plc-psu")).toBe(false);
  });
});

describe("правило: панель оператора без ПЛК", () => {
  it("предупреждает, если панели нет пары во всём проекте", () => {
    const c = cab([item(hmi), item(psu)]);
    const issues = validateProject(ctx([hmi, psu], [c]));
    expect(hasId(issues, "hmi-plc")).toBe(true);
  });

  it("молчит, когда ПЛК есть в соседнем шкафу", () => {
    const c1 = cab([item(hmi), item(psu)], "cab-1");
    const c2 = cab([item(plc), item(psu)], "cab-2");
    const issues = validateProject(ctx([hmi, psu, plc], [c1, c2]));
    expect(hasId(issues, "hmi-plc")).toBe(false);
  });
});

describe("правило: греющий кабель без терморегулятора", () => {
  it("предупреждает о кабеле без регулирования", () => {
    const c = cab([item(heat)]);
    const issues = validateProject(ctx([heat], [c]));
    expect(hasId(issues, "heat-thermo")).toBe(true);
  });

  it("молчит, когда терморегулятор есть", () => {
    const c = cab([item(heat), item(thermo)]);
    const issues = validateProject(ctx([heat, thermo], [c]));
    expect(hasId(issues, "heat-thermo")).toBe(false);
  });
});

describe("пустой шкаф и сводка", () => {
  it("помечает пустой шкаф подсказкой", () => {
    const c = cab([]);
    const issues = validateCabinet(c, ctx([], [c]));
    expect(hasId(issues, "empty")).toBe(true);
  });

  it("summarize верно считает уровни", () => {
    const c1 = cab([item(brk100), item(brk80), item(bus63)]); // ошибка
    const c2 = cab([item(uzip)]); // предупреждение
    const issues = validateProject(ctx([brk100, brk80, bus63, uzip], [c1, c2]));
    const sum = summarize(issues);
    expect(sum.error).toBeGreaterThanOrEqual(1);
    expect(sum.warn).toBeGreaterThanOrEqual(1);
    expect(sum.total).toBe(sum.error + sum.warn + sum.info);
  });
});
