import { describe, it, expect } from "vitest";
import {
  buildKit, kitTotal, kitAssemblyHours, kitLabel, findKitSystem,
  KIT_SYSTEMS, type KitInput,
} from "./kit";

/* ============================================================
   ТЕСТЫ КОНФИГУРАТОРА СОСТАВНЫХ ШКАФОВ (kit.ts).
   Главное поведение: состав одиночного шкафа и пересчёт
   «стена к стене» (панели = ряд+1, стыки = ряд−1, цоколи = ряд).
   ============================================================ */

const input = (p: Partial<KitInput>): KitInput => ({
  systemId: "cqe", h: 1800, w: 600, d: 400, doors: 1,
  wallRow: false, rowSize: 1, pedestal: false, ...p,
});

const qty = (lines: ReturnType<typeof buildKit>, keyPart: string) =>
  lines.find((l) => l.key.includes(keyPart))?.qty ?? 0;

describe("buildKit — одиночный напольный шкаф CQE", () => {
  const lines = buildKit(input({}));

  it("собирает полный состав: каркас, крыша, основание, траверсы, панели, монтаж, дверь", () => {
    expect(qty(lines, "frame-1800")).toBe(1);
    expect(qty(lines, "roof-600")).toBe(1);
    expect(qty(lines, "base-600")).toBe(1);
    expect(qty(lines, "trav-600")).toBe(2); // верх+низ
    expect(qty(lines, "side-1800-400")).toBe(2); // левая+правая
    expect(qty(lines, "mount-600-1800")).toBe(1);
    expect(qty(lines, "door-600-1800")).toBe(1);
    expect(qty(lines, "ped")).toBe(0);
    expect(qty(lines, "joint")).toBe(0);
  });

  it("все позиции имеют положительную закупочную цену и количество", () => {
    expect(lines.length).toBe(7);
    for (const l of lines) {
      expect(l.purchase).toBeGreaterThan(0);
      expect(l.qty).toBeGreaterThan(0);
      expect(l.sku.length).toBeGreaterThan(0);
    }
  });

  it("ограничивает число дверей максимумом системы (CQE — 2)", () => {
    expect(qty(buildKit(input({ doors: 5 })), "door")).toBe(2);
    expect(qty(buildKit(input({ doors: 0 })), "door")).toBe(1);
  });
});

describe("buildKit — «стена к стене» (ряд из 3 шкафов)", () => {
  const lines = buildKit(input({ wallRow: true, rowSize: 3, pedestal: true }));

  it("боковых панелей = ряд+1, а не 2×ряд", () => {
    expect(qty(lines, "side")).toBe(4);
  });

  it("стыковых комплектов = ряд−1", () => {
    expect(qty(lines, "joint")).toBe(2);
  });

  it("цоколей — по числу шкафов ряда", () => {
    expect(qty(lines, "ped")).toBe(3);
  });

  it("ряд из одного шкафа не даёт стыков и лишних панелей", () => {
    const solo = buildKit(input({ wallRow: true, rowSize: 1 }));
    expect(qty(solo, "joint")).toBe(0);
    expect(qty(solo, "side")).toBe(2);
  });
});

describe("buildKit — навесной CQE N", () => {
  const wall = buildKit(input({ systemId: "cqen", h: 600, w: 400, d: 200, pedestal: true }));

  it("нет крыши/основания/траверс/цоколя — только корпус, панели, монтаж, дверь", () => {
    expect(wall.find((l) => l.group === "frame")?.qty).toBe(1);
    expect(qty(wall, "roof")).toBe(0);
    expect(qty(wall, "base")).toBe(0);
    expect(qty(wall, "trav")).toBe(0);
    expect(qty(wall, "ped")).toBe(0); // цоколи для навесных не имеют смысла
    expect(wall.length).toBe(4);
  });

  it("всегда одна дверь (maxDoors = 1)", () => {
    expect(qty(buildKit(input({ systemId: "cqen", h: 600, w: 400, d: 200, doors: 2 })), "door")).toBe(1);
  });

  it("цена растёт с площадью: 800×1000 дороже 300×400", () => {
    const small = buildKit(input({ systemId: "cqen", h: 400, w: 300, d: 150 }));
    const big = buildKit(input({ systemId: "cqen", h: 1000, w: 800, d: 300 }));
    expect(kitTotal(big)).toBeGreaterThan(kitTotal(small) * 2);
  });
});

describe("kitTotal / kitAssemblyHours / kitLabel", () => {
  it("итог = сумма qty×цена", () => {
    const lines = buildKit(input({ wallRow: true, rowSize: 2, pedestal: true }));
    const manual = lines.reduce((s, l) => s + l.qty * l.purchase, 0);
    expect(kitTotal(lines)).toBe(manual);
  });

  it("часы сборки ряда больше часов одиночного шкафа", () => {
    const solo = kitAssemblyHours(input({}));
    const row = kitAssemblyHours(input({ wallRow: true, rowSize: 3, pedestal: true }));
    expect(row).toBeGreaterThan(solo);
    expect(row).toBeGreaterThan(0);
  });

  it("метка корпуса содержит систему, габарит и IP", () => {
    expect(kitLabel(input({ h: 2000, w: 800, d: 600 }))).toBe("CQE 2000×800×600, IP54");
    expect(kitLabel(input({ systemId: "cqen", h: 600, w: 400, d: 200 }))).toBe("CQE N 600×400×200, IP66");
  });

  it("неизвестная система откатывается на CQE (не падает)", () => {
    expect(findKitSystem("nope").id).toBe("cqe");
    expect(() => buildKit(input({ systemId: "nope" }))).not.toThrow();
  });

  it("детерминированность: одинаковый вход — одинаковый выход", () => {
    const a = buildKit(input({ wallRow: true, rowSize: 4, pedestal: true }));
    const b = buildKit(input({ wallRow: true, rowSize: 4, pedestal: true }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("системы", () => {
  it("объявлены обе системы с непустыми сетками типоразмеров", () => {
    expect(KIT_SYSTEMS.length).toBe(2);
    for (const s of KIT_SYSTEMS) {
      expect(s.heights.length).toBeGreaterThan(1);
      expect(s.widths.length).toBeGreaterThan(1);
      expect(s.depths.length).toBeGreaterThan(1);
    }
  });
});
