import { describe, expect, it } from "vitest";
import {
  cloneDoorLayout,
  defaultDoorPlacement,
  emptyDoorLayout,
  isDoorLayoutV1,
  normalizeDoorElement,
} from "./doorLayout";

describe("DOOR-003: cabinet-door-layout-v1 frontend contract", () => {
  it("creates the exact v1 envelope", () => {
    expect(emptyDoorLayout()).toEqual({
      schema: "cabinet-door-layout-v1",
      doorCount: 1,
      labelSide: "below",
      elements: [],
    });
  });

  it("normalizes coordinates, door and full Unicode label boundaries", () => {
    const normalized = normalizeDoorElement({
      id: "button-0",
      kind: "button",
      tone: "red",
      label: "я".repeat(121),
      door: 8,
      x: -12.8,
      y: 1000.6,
    }, 2);

    expect(normalized).toEqual({
      id: "button-0",
      kind: "button",
      tone: undefined,
      label: "я".repeat(120),
      door: 1,
      x: 0,
      y: 1000,
    });
    expect(JSON.stringify(normalized)).not.toContain("tone");
  });

  it("assigns deterministic normalized positions across one and two doors", () => {
    expect(defaultDoorPlacement(0, 1)).toEqual({ door: 0, x: 150, y: 130 });
    expect(defaultDoorPlacement(23, 2).door).toBe(0);
    expect(defaultDoorPlacement(24, 2)).toMatchObject({ door: 1, x: 150, y: 130 });
    expect(defaultDoorPlacement(24, 1).door).toBe(0);
  });

  it("keeps a cloned layout detached and rejects future schemas as v1", () => {
    const source = {
      ...emptyDoorLayout(),
      elements: [{ id: "lamp-0", kind: "lamp" as const, tone: "green" as const, label: "Сеть", door: 0, x: 250, y: 180 }],
    };
    const clone = cloneDoorLayout(source);
    clone.elements[0].label = "Изменено";

    expect(source.elements[0].label).toBe("Сеть");
    expect(isDoorLayoutV1(source)).toBe(true);
    expect(isDoorLayoutV1({ ...source, schema: "cabinet-door-layout-v2" })).toBe(false);
  });
});
