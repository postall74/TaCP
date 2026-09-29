// @ts-expect-error The project intentionally has no @types/node; Vitest runs this test in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calcProject, type CalcFields, type ProjCalc } from "./utils";
import type { Cabinet, Rates } from "./types";

type FixtureCabinet = Pick<Cabinet, "hours" | "designHours" | "softwareHours"> & {
  items: Array<{ qty: number; purchase: number }>;
};
type Expected = Omit<ProjCalc, "cabs">;
type Scenario = { id: string; rates: Rates; project: CalcFields; cabinets: FixtureCabinet[]; expected: Expected };
type Fixture = { version: string; comparisonTolerance: number; scenarios: Scenario[] };

const fixture = JSON.parse(
  readFileSync(new URL("../qa/fixtures/calc-v1.json", import.meta.url), "utf8"),
) as Fixture;

function cabinet(source: FixtureCabinet, cabinetIndex: number): Cabinet {
  return {
    id: `cab-${cabinetIndex}`,
    kind: "fixture",
    name: `Fixture cabinet ${cabinetIndex}`,
    hours: source.hours,
    designHours: source.designHours,
    softwareHours: source.softwareHours,
    items: source.items.map((item, itemIndex) => ({
      id: `item-${cabinetIndex}-${itemIndex}`,
      eqId: "fixture",
      sku: "fixture",
      name: "Fixture item",
      brand: "fixture",
      unit: "pcs",
      ...item,
    })),
  };
}

describe(`shared calculation fixture ${fixture.version}`, () => {
  for (const scenario of fixture.scenarios) {
    it(scenario.id, () => {
      const actual = calcProject(
        { ...scenario.project, cabinets: scenario.cabinets.map(cabinet) },
        scenario.rates,
      );

      for (const [field, expected] of Object.entries(scenario.expected)) {
        const value = actual[field as keyof Expected];
        if (field === "posCount") expect(value).toBe(expected);
        else expect(Math.abs(value - expected)).toBeLessThanOrEqual(fixture.comparisonTolerance);
      }
    });
  }
});


