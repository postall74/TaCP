import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Rates, Settings } from "../types";

const confirmed: Rates = { design: 100, production: 200, software: 300, smr: 400, pnr: 500 };
const draft: Rates = { design: 110, production: 220, software: 330, smr: 440, pnr: 550 };
const toast = vi.fn();
const saveRates = vi.fn();
const setters = [vi.fn(), vi.fn()];
let stateCall = 0;
let role = "admin";
let theme: "light" | "dark" = "light";
let settings: Settings;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = stateCall++;
    const defaultValue = typeof initial === "function" ? (initial as () => T)() : initial;
    return [index === 0 ? draft : defaultValue, setters[index]];
  },
}));
vi.mock("../store", () => ({
  DEFAULT_SETTINGS: {
    rates: { design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 },
  },
  useStore: (selector: (state: unknown) => unknown) => selector({
    settings,
    user: { id: role, email: `${role}@qa.test`, fullName: "QA", position: "", roles: [role] },
    saveRates,
    toast,
  }),
}));

type Node = { type?: unknown; props?: { children?: unknown; onClick?: () => void; onChange?: (value: number) => void } };
const find = (node: unknown, predicate: (node: Node) => boolean): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const element = node as Node;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
};

const render = async () => {
  stateCall = 0;
  const { default: RatesPage } = await import("./RatesPage");
  return RatesPage() as Node;
};

beforeEach(() => {
  role = "admin";
  theme = "light";
  settings = {
    companyName: "Keep", tagline: "QA", address: "A", phone: "1", email: "qa@test",
    requisites: "R", manager: "M", executor: "E", theme, rates: confirmed,
    apiBaseUrl: "http://api.test", apiOnline: true,
  };
  stateCall = 0;
  toast.mockReset();
  saveRates.mockReset();
  setters.forEach((setter) => setter.mockReset());
});

describe("SYNC-010: RatesPage confirmation UI", () => {
  it("keeps input changes in draft without calling the API", async () => {
    const page = await render();
    const input = find(page, (node) => typeof node.props?.onChange === "function");
    expect(input).toBeDefined();

    input!.props!.onChange!(777);

    expect(setters[0]).toHaveBeenCalledOnce();
    expect(saveRates).not.toHaveBeenCalled();
    expect(settings.rates).toEqual(confirmed);
  });

  it.each(["light", "dark"] as const)("shows success only after awaited save in %s theme", async (selectedTheme) => {
    theme = selectedTheme;
    settings = { ...settings, theme };
    let resolveSave!: (value: boolean) => void;
    saveRates.mockReturnValueOnce(new Promise<boolean>((resolve) => { resolveSave = resolve; }));
    const page = await render();
    const save = find(page, (node) => typeof node.props?.onClick === "function" && JSON.stringify(node.props.children).includes("Сохранить"));
    expect(save).toBeDefined();

    save!.props!.onClick!();
    expect(saveRates).toHaveBeenCalledWith(draft);
    expect(toast).not.toHaveBeenCalled();
    resolveSave(true);
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Ставки сохранены"));
  });

  it("keeps draft and emits no success after rejection", async () => {
    saveRates.mockRejectedValueOnce(new Error("rates rejected"));
    const page = await render();
    const save = find(page, (node) => typeof node.props?.onClick === "function" && JSON.stringify(node.props.children).includes("Сохранить"));

    save!.props!.onClick!();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("rates rejected", "err"));

    expect(setters[0]).not.toHaveBeenCalled();
    expect(toast.mock.calls.some((call) => call[1] !== "err")).toBe(false);
    expect(settings.rates).toEqual(confirmed);
  });

  it("reset uses the same awaited save path and changes no non-rate setting", async () => {
    saveRates.mockResolvedValueOnce(true);
    const before = { ...settings };
    const page = await render();
    const reset = find(page, (node) => typeof node.props?.onClick === "function" && JSON.stringify(node.props.children).includes("Типовые ставки"));

    reset!.props!.onClick!();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("Ставки сброшены к типовым"));

    expect(setters[0]).toHaveBeenCalledWith({ design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 });
    expect(saveRates).toHaveBeenCalledWith({ design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 });
    expect(settings).toEqual(before);
  });

  it.each(["manager", "engineer"])("renders %s read-only with explanation and no controls", async (selectedRole) => {
    role = selectedRole;
    const page = await render();
    const text = JSON.stringify(page);

    expect(text).toContain("Ставки доступны только для чтения");
    expect(text).not.toContain("Сохранить");
    expect(text).not.toContain("Типовые ставки");
    expect(saveRates).not.toHaveBeenCalled();
  });
});
