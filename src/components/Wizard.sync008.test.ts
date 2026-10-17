import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../types";

const toast = vi.fn();
const upsertEquipment = vi.fn();
const addCabinetsBulk = vi.fn(async () => true);
const updateProject = vi.fn();
const onClose = vi.fn();
let mode: "kit" | "manual" = "kit";
let stateCall = 0;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = stateCall++;
    let value = typeof initial === "function" ? (initial as () => T)() : initial;
    if (index === 0) value = 13 as T;
    if (index === 2) {
      const draft = value as Record<string, unknown>;
      value = {
        ...draft,
        cabMode: mode,
        customDim: mode === "kit",
        customName: mode === "kit" ? "Custom kit" : "",
        manualName: mode === "manual" ? "Manual cabinet" : "",
      } as T;
    }
    return [value, vi.fn()];
  },
}));
vi.mock("../store", () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({
    catalog: [],
    settings: { rates: { design: 1, production: 1, software: 1, smr: 1, pnr: 1 } },
    addCabinetsBulk, updateProject, upsertEquipment, toast,
  }),
}));

type Node = { props?: { children?: unknown; onClick?: () => Promise<void> } };
const findApply = (node: unknown): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const element = node as Node;
  if (typeof element.props?.onClick === "function" && JSON.stringify(element.props.children).includes("Добавить в проект")) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = findApply(child);
    if (found) return found;
  }
  return undefined;
};

const project: Project = {
  id: "prj-1", number: "ТКП-1", title: "Wizard", client: "QA", contact: "",
  direction: "nku", status: "draft", createdAt: 1, updatedAt: 1, cabinets: [],
  markup: 15, workMarkup: 25, discount: 0, vatRate: 20, showWorkLines: true,
  tzzPct: 1, thirdParty: 0, extraCosts: 0, unforeseenPct: 2, tripCosts: 0,
  smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0, transportPct: 0,
  validDays: 30, notes: "", versions: [],
};

beforeEach(() => {
  stateCall = 0;
  toast.mockReset();
  upsertEquipment.mockReset().mockRejectedValue(new Error("catalog unavailable"));
  addCabinetsBulk.mockClear();
  updateProject.mockClear();
  onClose.mockClear();
});

describe.each(["kit", "manual"] as const)("SYNC-008: Wizard %s catalog call", (selectedMode) => {
  it("handles catalog rejection and still applies the cabinet", async () => {
    mode = selectedMode;
    const { default: Wizard } = await import("./Wizard");
    const apply = findApply(Wizard({ project, onClose }));
    expect(apply).toBeDefined();

    await apply!.props!.onClick!();
    await Promise.resolve();

    expect(upsertEquipment).toHaveBeenCalledOnce();
    expect(toast.mock.calls.some((call) => call[1] === "err" && String(call[0]).includes("catalog unavailable"))).toBe(true);
    expect(addCabinetsBulk).toHaveBeenCalledOnce();
    expect(updateProject).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
