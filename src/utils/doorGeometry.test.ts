import { describe, expect, it } from "vitest";
import type { CabinetDoorGeometry, CabinetDoorLayout } from "../types";
import {
  cloneDoorGeometry,
  doorElementCenterMm,
  formatDoorMm,
  isDoorGeometryV1,
  validateDoorGeometry,
} from "./doorGeometry";

const geometry = (): CabinetDoorGeometry => ({
  schema: "cabinet-door-geometry-v1",
  units: "mm",
  view: "outside-front",
  leaves: [
    { door: 0, originXmm: 0, originYmm: 0, widthMm: 800, heightMm: 1800,
      placement: { leftMm: 50, topMm: 100, widthMm: 700, heightMm: 1600 } },
    { door: 1, originXmm: 800, originYmm: 0, widthMm: 800, heightMm: 1800,
      placement: { leftMm: 50, topMm: 100, widthMm: 700, heightMm: 1600 } },
  ],
});

const layout = (doorCount: 1 | 2 = 2): CabinetDoorLayout => ({
  schema: "cabinet-door-layout-v1", doorCount, labelSide: "below", elements: [],
});

describe("DOOR-004/005: physical geometry contract", () => {
  it.each([
    [0, 0, 50, 100],
    [500, 500, 400, 900],
    [1000, 1000, 750, 1700],
  ])("maps normalized (%i,%i) to millimetres", (x, y, expectedX, expectedY) => {
    expect(doorElementCenterMm(geometry().leaves[0], { x, y })).toEqual({ x: expectedX, y: expectedY });
  });

  it("includes the second leaf origin and formats one decimal with a comma", () => {
    expect(doorElementCenterMm(geometry().leaves[1], { x: 500, y: 500 })).toEqual({ x: 1200, y: 900 });
    expect(formatDoorMm(1200)).toBe("1200,0");
    expect(formatDoorMm(1.25)).toBe("1,3");
  });

  it("accepts exact one/two-leaf boundaries and rejects contract violations", () => {
    const one: CabinetDoorGeometry = {
      schema: "cabinet-door-geometry-v1", units: "mm", view: "outside-front",
      leaves: [{ door: 0, originXmm: 0, originYmm: 0, widthMm: 1, heightMm: 1,
        placement: { leftMm: 0, topMm: 0, widthMm: 1, heightMm: 1 } }],
    };
    expect(validateDoorGeometry(one, layout(1))).toBeNull();
    expect(validateDoorGeometry(geometry(), layout())).toBeNull();

    const overlap = geometry();
    overlap.leaves[1].originXmm = 799;
    expect(validateDoorGeometry(overlap, layout())).toMatch(/перекрываться/);
    const outside = geometry();
    outside.leaves[0].placement.widthMm = 751;
    expect(validateDoorGeometry(outside, layout())).toMatch(/целиком/);
    expect(validateDoorGeometry(geometry(), layout(1))).toMatch(/не совпадает/);
  });

  it("recognizes only the v1 envelope and clones nested placement data", () => {
    const original = geometry();
    expect(isDoorGeometryV1(original)).toBe(true);
    expect(isDoorGeometryV1({ ...original, schema: "cabinet-door-geometry-v2" })).toBe(false);
    const cloned = cloneDoorGeometry(original);
    cloned.leaves[0].placement.leftMm = 99;
    expect(original.leaves[0].placement.leftMm).toBe(50);
  });
});
