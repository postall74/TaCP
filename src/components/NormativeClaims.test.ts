// @ts-expect-error The project intentionally has no @types/node; Vitest runs this test in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Project } from "../types";
import { validateProject, type ValidateCtx } from "../utils/rules";

type Scenario = {
  id: string;
  project?: { cabinets: [] };
  input?: { uzipKind: string };
  requiredUiText: string[];
};
type Fixture = {
  version: string;
  scenarios: Scenario[];
  forbiddenUiText: string[];
};

const fixture = JSON.parse(
  readFileSync(new URL("../../qa/fixtures/norm-qa-v1.json", import.meta.url), "utf8"),
) as Fixture;

const uiSources = [
  "../App.tsx",
  "./CabinetDraft.tsx",
  "./CabinetDraftsPage.tsx",
  "./DocumentTab.tsx",
  "./StructureTab.tsx",
  "./Wizard.tsx",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

describe("NORM-QA-001: normative claims boundary", () => {
  it("keeps missing input out of a normative green state", () => {
    const scenario = fixture.scenarios.find(({ id }) => id === "missing-input");
    expect(scenario).toBeDefined();

    const project = { cabinets: [], direction: "nku" } as unknown as Project;
    const ctx: ValidateCtx = { catalog: [], project };
    const issues = validateProject(ctx);

    expect(issues).toEqual([]);
    for (const text of scenario!.requiredUiText) expect(uiSources).toContain(text);
    expect(uiSources).toContain("Соответствие нормативным требованиям не подтверждено");
  });

  it("does not turn an input type into a sufficient UZIP selection", () => {
    const scenario = fixture.scenarios.find(({ id }) => id === "wrong-scope-uzip");
    expect(scenario?.input?.uzipKind).toBe("t2");
    for (const text of scenario!.requiredUiText) expect(uiSources).toContain(text);
  });

  it("keeps removed normative and yearless claims out of rendered UI sources", () => {
    for (const text of fixture.forbiddenUiText) expect(uiSources).not.toContain(text);
    expect(uiSources).not.toMatch(/ГОСТ(?!\s*(?:Р\s*)?\d)/u);
  });
});
