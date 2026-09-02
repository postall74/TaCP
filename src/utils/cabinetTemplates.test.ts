import { describe, it, expect } from "vitest";
import type { CabinetTemplate } from "../types";
import {
  baseKit, kitTotal, templateTotal, autoAssemblyHours, suggestOrderCode,
  templateDocLine, traverseCount, doorCount,
} from "./cabinetTemplates";

const tpl = (p: Partial<CabinetTemplate>): CabinetTemplate => ({
  id: "t1", orderCode: "ШН-2000.800.600-IP54", name: "Шкаф напольный распределительный",
  direction: "nku", brand: "ПРОВЕНТО", mount: "floor", h: 2000, w: 800, d: 600, ip: 54,
  kit: baseKit("floor", 2000, 800, 600), fillItems: [], assemblyHours: 5,
  createdAt: 0, updatedAt: 0, ...p,
});

describe("baseKit — напольный шкаф", () => {
  const kit = baseKit("floor", 2000, 800, 600);

  it("содержит весь типовой комплект поставки", () => {
    const keys = kit.map((k) => k.key);
    for (const k of ["frame", "cable", "trav", "door", "rear", "mount", "key", "ped", "side"])
      expect(keys).toContain(k);
  });

  it("рама, задняя и монтажная панели, цоколь — по одной; кабельные вводы и боковые — по две", () => {
    const q = (k: string) => kit.find((x) => x.key === k)?.qty ?? 0;
    expect(q("frame")).toBe(1);
    expect(q("rear")).toBe(1);
    expect(q("mount")).toBe(1);
    expect(q("ped")).toBe(1);
    expect(q("cable")).toBe(2);
    expect(q("side")).toBe(2);
  });

  it("траверс больше у высокого шкафа, дверей две при ширине ≥ 1000", () => {
    expect(traverseCount(1800)).toBe(2);
    expect(traverseCount(2200)).toBeGreaterThan(traverseCount(1800));
    expect(doorCount(800)).toBe(1);
    expect(doorCount(1200)).toBe(2);
    expect(baseKit("floor", 2000, 1200, 600).find((k) => k.key === "door")?.qty).toBe(2);
  });

  it("цена растёт с габаритом", () => {
    expect(kitTotal(baseKit("floor", 2200, 1200, 800))).toBeGreaterThan(kitTotal(baseKit("floor", 1800, 600, 400)) * 1.5);
  });
});

describe("baseKit — навесной шкаф", () => {
  const kit = baseKit("wall", 600, 400, 200);

  it("нет цоколя и рам — корпус, дверь, монтажная панель, ключи, кронштейны", () => {
    const keys = kit.map((k) => k.key);
    expect(keys).not.toContain("ped");
    expect(keys).not.toContain("frame");
    for (const k of ["corpus", "door", "mount", "key", "bracket"]) expect(keys).toContain(k);
  });
});

describe("часы сборки и шифры", () => {
  it("часы напольного больше навесного и растут с габаритом", () => {
    expect(autoAssemblyHours("floor", 2000, 800)).toBeGreaterThan(autoAssemblyHours("wall", 600, 400));
    expect(autoAssemblyHours("floor", 2200, 1200)).toBeGreaterThan(autoAssemblyHours("floor", 1800, 600));
  });

  it("заказной шифр: ШН для напольных, ЩН для навесных, суффикс -П для преднаполненных", () => {
    expect(suggestOrderCode(tpl({}))).toBe("ШН-2000.800.600-IP54");
    expect(suggestOrderCode(tpl({ mount: "wall", h: 600, w: 400, d: 200, ip: 66 }))).toBe("ЩН-600.400.200-IP66");
    const withFill = tpl({ fillItems: [{ id: "f1", eqId: "brk-c16", sku: "ВА47", name: "АВ", brand: "IEK", unit: "шт", qty: 2, purchase: 100 }] });
    expect(suggestOrderCode(withFill).endsWith("-П")).toBe(true);
  });
});

describe("строка для ТКП", () => {
  it("содержит наименование, габариты, IP и комплект поставки", () => {
    const line = templateDocLine(tpl({}));
    expect(line).toContain("Шкаф напольный распределительный габаритами 2000×800×600");
    expect(line).toContain("соответствие степени защиты IP54");
    expect(line).toContain("Комплект поставки:");
    expect(line).toContain("Рама с потолочной панелью");
    expect(line).toContain("Траверса монтажная — 3 шт"); // h=2000 → 2 + ceil(200/500)
    expect(line).toContain("Цоколь 100 мм");
  });

  it("итог шаблона = комплект + преднаполнение", () => {
    const t = tpl({ fillItems: [{ id: "f", eqId: "x", sku: "X", name: "X", brand: "-", unit: "шт", qty: 3, purchase: 1000 }] });
    expect(templateTotal(t)).toBe(kitTotal(t.kit) + 3000);
  });
});
