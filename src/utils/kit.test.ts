import { describe, it, expect } from "vitest";
import {
  buildKit, kitTotal, kitAssemblyHours, kitLabel, kitLinesToItems,
  findKitSystem, nearestDims, hasExactDims, KIT_SYSTEMS, type KitInput,
} from "./kit";

/* ============================================================
   ТЕСТЫ КОНФИГУРАТОРА СОСТАВНЫХ ШКАФОВ (kit.ts).
   Системы: CQE N напольный (IP54) и навесной (IP66) — DKC,
   PROVENTO ШРС (EKF). Главное поведение: состав одиночного шкафа
   и пересчёт составного ряда «стена к стене»
   (панели = N+1, стыки = N−1, цоколи = N).
   ============================================================ */

const input = (p: Partial<KitInput>): KitInput => ({
  systemId: "cqen-floor", h: 1800, w: 600, d: 400, doors: 1,
  joined: 1, pedestal: false, extraTraverses: 0, ...p,
});

const qty = (lines: ReturnType<typeof buildKit>, keyPart: string) =>
  lines.find((l) => l.key.includes(keyPart))?.qty ?? 0;

describe("buildKit — одиночный напольный CQE N", () => {
  const lines = buildKit(input({}));

  it("собирает полный состав: каркас, крыша, основание, траверсы, панели, монтаж, дверь", () => {
    expect(qty(lines, "frame-1800")).toBe(1);
    expect(qty(lines, "roof")).toBe(1);
    expect(qty(lines, "base")).toBe(1);
    expect(qty(lines, "trav-600")).toBe(2); // верх+низ
    expect(qty(lines, "side-1800-400")).toBe(2); // левая+правая
    expect(qty(lines, "mount")).toBe(1);
    expect(qty(lines, "door")).toBe(1);
    expect(qty(lines, "ped")).toBe(0);
    expect(qty(lines, "joint")).toBe(0);
  });

  it("все позиции имеют положительную закупочную цену", () => {
    expect(lines.length).toBe(7);
    for (const l of lines) {
      expect(l.purchase).toBeGreaterThan(0);
      expect(l.qty).toBeGreaterThan(0);
    }
  });

  it("дополнительные траверсы — отдельной строкой", () => {
    const l = buildKit(input({ extraTraverses: 4 }));
    expect(qty(l, "trav-x-600")).toBe(4);
    expect(qty(l, "trav-600")).toBe(2);
  });
});

describe("buildKit — составной ряд «стена к стене»", () => {
  const lines = buildKit(input({ joined: 3, pedestal: true }));

  it("боковых панелей = N+1, а не 2×N", () => {
    expect(qty(lines, "side")).toBe(4);
  });

  it("стыковых комплектов = N−1", () => {
    expect(qty(lines, "joint")).toBe(2);
  });

  it("цоколей — по числу корпусов ряда", () => {
    expect(qty(lines, "ped")).toBe(3);
  });

  it("каркасов, крыш, оснований и монтажных панелей — по числу корпусов", () => {
    expect(qty(lines, "frame-1800")).toBe(3);
    expect(qty(lines, "roof")).toBe(3);
    expect(qty(lines, "base")).toBe(3);
    expect(qty(lines, "mount")).toBe(3);
  });

  it("дверей — по числу корпусов × двери на корпус", () => {
    expect(qty(lines, "door")).toBe(3);
    expect(qty(buildKit(input({ joined: 2, doors: 2 })), "door")).toBe(4);
  });

  it("составной из одного корпуса не даёт стыков и лишних панелей", () => {
    const solo = buildKit(input({ joined: 1 }));
    expect(qty(solo, "joint")).toBe(0);
    expect(qty(solo, "side")).toBe(2);
  });
});

describe("buildKit — навесной CQE N", () => {
  const wall = buildKit(input({ systemId: "cqen-wall", h: 600, w: 400, d: 200, pedestal: true }));

  it("нет крыши/основания/траверс/цоколя — корпус, панели, монтаж, дверь", () => {
    expect(wall.find((l) => l.group === "frame")?.qty).toBe(1);
    expect(wall.filter((l) => l.key.includes("roof")).length).toBe(0);
    expect(wall.filter((l) => l.key.includes("base")).length).toBe(0);
    expect(wall.filter((l) => l.key.includes("trav")).length).toBe(0);
    expect(wall.filter((l) => l.key.includes("ped")).length).toBe(0);
    expect(wall.length).toBe(4);
  });

  it("навесной ряд из 2 корпусов даёт стык и 3 боковые панели", () => {
    const w2 = buildKit(input({ systemId: "cqen-wall", h: 600, w: 400, d: 200, joined: 2 }));
    expect(qty(w2, "joint")).toBe(1);
    expect(qty(w2, "side")).toBe(3);
  });
});

describe("buildKit — PROVENTO", () => {
  it("дешевле CQE N при том же габарите (коэффициент серии)", () => {
    const cqe = kitTotal(buildKit(input({})));
    const prov = kitTotal(buildKit(input({ systemId: "provento" })));
    expect(prov).toBeLessThan(cqe);
    expect(prov).toBeGreaterThan(0);
  });
});

describe("габариты: точные и ближайшие", () => {
  const sys = findKitSystem("cqen-floor");

  it("hasExactDims находит типовой и отклоняет нестандартный", () => {
    expect(hasExactDims(sys, 1800, 600, 400)).toBe(true);
    expect(hasExactDims(sys, 1900, 650, 450)).toBe(false);
  });

  it("nearestDims возвращает ближайший типоразмер", () => {
    const n = nearestDims(sys, 1900, 650, 450);
    expect([1800, 2000]).toContain(n.h);
    expect([600, 800]).toContain(n.w);
    expect([400, 600]).toContain(n.d);
  });
});

describe("kitTotal / kitAssemblyHours / kitLabel / kitLinesToItems", () => {
  it("итог = сумма qty×цена", () => {
    const lines = buildKit(input({ joined: 2, pedestal: true }));
    expect(kitTotal(lines)).toBe(lines.reduce((s, l) => s + l.qty * l.purchase, 0));
  });

  it("часы сборки ряда больше часов одиночного шкафа", () => {
    const solo = kitAssemblyHours(input({}));
    const row = kitAssemblyHours(input({ joined: 3, pedestal: true }));
    expect(row).toBeGreaterThan(solo);
  });

  it("метка содержит систему, габарит, IP и пометку составного", () => {
    expect(kitLabel(input({ h: 2000, w: 800, d: 600 }))).toBe("CQE N 2000×800×600, IP54");
    expect(kitLabel(input({ joined: 2 }))).toContain("составной, 2 корп.");
  });

  it("позиции — снапшоты с уникальными id и положительными ценами", () => {
    const items = kitLinesToItems(buildKit(input({ joined: 2 })));
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of items) expect(it.purchase).toBeGreaterThan(0);
  });

  it("неизвестная система откатывается на CQE N напольный", () => {
    expect(findKitSystem("nope").id).toBe("cqen-floor");
    expect(() => buildKit(input({ systemId: "nope" }))).not.toThrow();
  });
});

describe("системы", () => {
  it("объявлены CQE N (напольный и навесной) и PROVENTO", () => {
    expect(KIT_SYSTEMS.map((s) => s.id)).toEqual(["cqen-floor", "cqen-wall", "provento"]);
    for (const s of KIT_SYSTEMS) {
      expect(s.heights.length).toBeGreaterThan(1);
      expect(s.widths.length).toBeGreaterThan(1);
      expect(s.depths.length).toBeGreaterThan(1);
    }
  });
});
