import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "./types";

const toast = vi.fn();
const saveCompanySettings = vi.fn();
const resetCompanySettings = vi.fn();
const setters = Array.from({ length: 6 }, () => vi.fn());
let stateCall = 0;
let role = "manager";
let theme: "light" | "dark" = "light";
let settings: Settings;
let draft: Settings;

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: <T,>(initial: T) => {
    const index = stateCall++;
    const value = index === 2 ? true : index === 5 ? draft : initial;
    return [value, setters[index]];
  },
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useLocation: () => ({ pathname: "/" }),
  useNavigate: () => vi.fn(),
}));
vi.mock("./store", () => ({
  useStore: (selector: (state: unknown) => unknown) => selector({
    projects: [], settings,
    user: { id: role, email: `${role}@qa.test`, fullName: "QA", position: "", roles: [role] },
    logout: vi.fn(), initAuth: vi.fn(), autoDetectApi: vi.fn(async () => undefined), hydrateFromApi: vi.fn(),
    createProject: vi.fn(), updateSettings: vi.fn(), saveCompanySettings, resetCompanySettings,
    checkApi: vi.fn(), outbox: [], toast,
  }),
}));

type Node = { type?: unknown; props?: { children?: unknown; footer?: unknown; onClick?: () => void; canEdit?: boolean } };
const find = (node: unknown, predicate: (node: Node) => boolean): Node | undefined => {
  if (!node || typeof node !== "object") return undefined;
  const element = node as Node;
  if (predicate(element)) return element;
  for (const child of [element.props?.children, element.props?.footer].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return undefined;
};

const renderSettings = async () => {
  stateCall = 0;
  const { default: App } = await import("./App");
  const app = App() as Node;
  const modalElement = find(app, (node) => typeof node.type === "function" && (node.type as { name?: string }).name === "SettingsModal");
  expect(modalElement).toBeDefined();
  const rendered = (modalElement!.type as (props: unknown) => Node)(modalElement!.props);
  return { modalElement, rendered };
};

beforeEach(() => {
  role = "manager";
  theme = "light";
  settings = {
    companyName: "Confirmed", tagline: "QA", address: "Address", phone: "1", email: "qa@test",
    requisites: "Req", manager: "Manager", executor: "Engineer", theme,
    rates: { design: 1, production: 1, software: 1, smr: 1, pnr: 1 },
    apiBaseUrl: "http://api.test", apiOnline: true,
  };
  draft = { ...settings, companyName: "Draft company", phone: "draft phone" };
  stateCall = 0;
  toast.mockReset();
  saveCompanySettings.mockReset();
  resetCompanySettings.mockReset();
  setters.forEach((setter) => setter.mockReset());
});

describe("SYNC-009: settings UI confirmation", () => {
  it.each(["light", "dark"] as const)("keeps the %s form and draft open after save rejection", async (selectedTheme) => {
    theme = selectedTheme;
    settings = { ...settings, theme };
    draft = { ...draft, theme };
    role = "manager";
    saveCompanySettings.mockRejectedValueOnce(new Error("save rejected"));
    const { rendered } = await renderSettings();
    const save = find(rendered, (node) => typeof node.props?.onClick === "function" && JSON.stringify(node.props.children).includes("Сохранить"));
    expect(save).toBeDefined();

    save!.props!.onClick!();
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith("save rejected", "err"));

    expect(saveCompanySettings).toHaveBeenCalledWith(draft);
    expect(setters[2]).not.toHaveBeenCalledWith(false);
    expect(setters[5]).not.toHaveBeenCalled();
    expect(toast.mock.calls.some((call) => call[1] !== "err")).toBe(false);
  });

  it("renders engineer settings read-only with the permission explanation", async () => {
    role = "engineer";
    const { modalElement, rendered } = await renderSettings();

    expect(modalElement!.props!.canEdit).toBe(false);
    expect(JSON.stringify(rendered)).toContain("Реквизиты доступны только для чтения");
    expect(JSON.stringify(rendered)).not.toContain("Сохранить");
    expect(JSON.stringify(rendered)).not.toContain("Сбросить");
  });
});
