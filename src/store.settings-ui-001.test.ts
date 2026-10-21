import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

beforeEach(() => {
  vi.resetModules();
  memory.clear();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, clearTimeout, setTimeout, setInterval: vi.fn(() => 1), location: { origin: "http://ui.test", protocol: "http:" } });
});

const user = (role: string) => ({ id: role, email: `${role}@qa.test`, fullName: role, position: "QA", roles: [role] });

describe("SETTINGS-UI-001: company settings authorization", () => {
  it("rejects a direct engineer company mutation without changing state", async () => {
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ user: user("engineer"), settings: { ...DEFAULT_SETTINGS }, toasts: [] });
    const before = useStore.getState().settings;

    const accepted = useStore.getState().updateSettings({ companyName: "Forbidden", executor: "Forbidden" });

    expect(accepted).toBe(false);
    expect(useStore.getState().settings).toEqual(before);
    const lastToast = useStore.getState().toasts[useStore.getState().toasts.length - 1];
    expect(lastToast).toMatchObject({ kind: "err" });
    expect(lastToast?.text).toContain("Инженер");
  });

  it.each(["manager", "admin"])("allows %s to update company settings", async (role) => {
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ user: user(role), settings: { ...DEFAULT_SETTINGS }, toasts: [] });
    expect(useStore.getState().updateSettings({ companyName: role })).toBe(true);
    expect(useStore.getState().settings.companyName).toBe(role);
  });

  it("keeps local-mode save and reset behavior", async () => {
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ user: null, settings: { ...DEFAULT_SETTINGS }, toasts: [] });
    expect(useStore.getState().updateSettings({ companyName: "Local" })).toBe(true);
    expect(useStore.getState().settings.companyName).toBe("Local");
    expect(useStore.getState().updateSettings(DEFAULT_SETTINGS)).toBe(true);
    expect(useStore.getState().settings.companyName).toBe(DEFAULT_SETTINGS.companyName);
  });

  it("does not block non-company connection settings for engineer", async () => {
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ user: user("engineer"), settings: { ...DEFAULT_SETTINGS }, toasts: [] });
    expect(useStore.getState().updateSettings({ apiBaseUrl: "http://api.qa" })).toBe(true);
    expect(useStore.getState().settings.apiBaseUrl).toBe("http://api.qa");
  });
});
