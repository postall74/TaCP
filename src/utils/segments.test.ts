import { describe, it, expect } from "vitest";
import type { CabinetSegment } from "../types";
import {
  buildSegmentLines, mergeSegmentItems, partitionPrice, segmentKit,
  FORM_META, SEGMENT_PRESETS, DEFAULT_CABINET_HEIGHT,
} from "./segments";
import { genId } from "../utils";

/* ============================================================
   ТЕСТЫ СЕКЦИОНИРОВАНИЯ (segments.ts): перегородки, комплекты,
   слияние с составом шкафа, метаданные форм разделения.
   ============================================================ */

const seg = (kind: CabinetSegment["kind"], partitions = 1, name = "Отсек"): CabinetSegment =>
  ({ id: genId("seg"), kind, name, partitions });

describe("partitionPrice", () => {
  it("растёт с высотой шкафа", () => {
    expect(partitionPrice(2200)).toBeGreaterThan(partitionPrice(1800));
    expect(partitionPrice(1800)).toBeGreaterThan(partitionPrice(600));
  });

  it("нижняя граница — 400 мм (навесные шкафы не дают отрицательных цен)", () => {
    expect(partitionPrice(100)).toBe(partitionPrice(400));
  });

  it("цена кратна 10 ₽", () => {
    expect(partitionPrice(1800) % 10).toBe(0);
  });
});

describe("buildSegmentLines", () => {
  it("суммирует перегородки всех отсеков одной параметрической позицией", () => {
    const b = buildSegmentLines([seg("input", 1), seg("control", 2), seg("busbar", 1)], 1800);
    const part = b.lines.find((l) => l.eqId === "seg-partition");
    expect(part?.qty).toBe(4);
    expect(b.partitionQty).toBe(4);
    expect(part?.purchase).toBe(partitionPrice(1800));
  });

  it("отсеки без перегородок дают только комплекты", () => {
    const b = buildSegmentLines([seg("input", 0)], 1800);
    expect(b.lines.some((l) => l.eqId === "seg-partition")).toBe(false);
    expect(b.lines.length).toBeGreaterThan(0); // DIN-рейка + нулевая шина
  });

  it("комплекты берутся из справочника (снапшоты с ценами)", () => {
    for (const p of SEGMENT_PRESETS) {
      const kit = segmentKit(p.kind);
      for (const it of kit) {
        expect(it.purchase).toBeGreaterThan(0);
        expect(it.qty).toBeGreaterThan(0);
        expect(it.name.length).toBeGreaterThan(0);
      }
    }
  });

  it("одинаковые eqId из разных отсеков дедуплицируются", () => {
    const b = buildSegmentLines([seg("input", 1), seg("feeders", 1)], 1800); // обе дают din-rail
    const rails = b.lines.filter((l) => l.eqId === "din-rail");
    expect(rails.length).toBe(1);
    expect(rails[0].qty).toBe(2);
  });

  it("часы сборки: 0,5 ч на перегородку", () => {
    expect(buildSegmentLines([seg("input", 1), seg("busbar", 2)], 1800).hours).toBe(1.5);
    expect(buildSegmentLines([], 1800).hours).toBe(0);
  });

  it("перегородки ограничены 4 шт на отсек", () => {
    const b = buildSegmentLines([seg("control", 9)], 1800);
    expect(b.partitionQty).toBe(4);
  });
});

describe("mergeSegmentItems", () => {
  const base = buildSegmentLines([seg("input", 1)], DEFAULT_CABINET_HEIGHT).lines;

  it("новые позиции добавляются, существующие — суммируются", () => {
    const again = buildSegmentLines([seg("feeders", 1)], DEFAULT_CABINET_HEIGHT).lines;
    const merged = mergeSegmentItems(base, again);
    const rails = merged.filter((l) => l.eqId === "din-rail");
    expect(rails.length).toBe(1);
    expect(rails[0].qty).toBe(2);
    expect(merged.length).toBeGreaterThan(base.length); // гребёнка PS-63 добавлена
  });

  it("не мутирует исходный массив", () => {
    const before = base.map((l) => l.qty).join(",");
    mergeSegmentItems(base, buildSegmentLines([seg("input", 2)], DEFAULT_CABINET_HEIGHT).lines);
    expect(base.map((l) => l.qty).join(",")).toBe(before);
  });
});

describe("FORM_META", () => {
  it("формы 2+ требуют шинный отсек, формы 3+ — минимум 2 функциональных отсека", () => {
    expect(FORM_META["1"].needBusbar).toBe(false);
    for (const f of ["2a", "2b", "3a", "3b", "4a", "4b"] as const) expect(FORM_META[f].needBusbar).toBe(true);
    expect(FORM_META["3a"].minSegments).toBeGreaterThanOrEqual(2);
    expect(FORM_META["4b"].minSegments).toBeGreaterThanOrEqual(FORM_META["3a"].minSegments);
  });
});
