import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};
const rates = { design: 11, production: 22, software: 33, smr: 44, pnr: 55 };
const admin = { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] };
const manager = { ...admin, id: "manager", roles: ["manager"] };

beforeEach(() => {
  vi.resetModules();
  memory.clear();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    clearTimeout,
    setTimeout,
    setInterval: vi.fn(() => 1),
    location: { origin: "http://ui.test", protocol: "http:" },
  });
});

describe("SYNC-009: confirmed company settings", () => {
  it.each([admin, manager])("sends one settings PUT and applies company fields for $roles", async (user) => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) });
      return Response.json(JSON.parse(String(init?.body)));
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const current = { ...DEFAULT_SETTINGS, theme: "dark" as const, rates, apiBaseUrl: "http://old.test", apiOnline: false };
    const next = { ...current, companyName: "Confirmed", phone: "+7 000", apiBaseUrl: "http://new.test" };
    useStore.setState({ settings: current, user, toasts: [] });

    await expect(useStore.getState().saveCompanySettings(next)).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://new.test/api/settings");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).not.toContain("/api/rates");
    expect(calls[0].body).toEqual({
      companyName: next.companyName, tagline: next.tagline, address: next.address,
      phone: next.phone, email: next.email, requisites: next.requisites,
      manager: next.manager, executor: next.executor,
    });
    expect(useStore.getState().settings).toEqual(next);
  });

  it.each([
    ["network", () => Promise.reject(new TypeError("network down"))],
    ["HTTP 400", () => Promise.resolve(Response.json({ detail: "bad" }, { status: 400 }))],
    ["HTTP 403", () => Promise.resolve(Response.json({ detail: "forbidden" }, { status: 403 }))],
    ["HTTP 500", () => Promise.resolve(Response.json({ detail: "server" }, { status: 500 }))],
  ])("keeps confirmed settings after %s", async (_label, reply) => {
    const fetchMock = vi.fn(reply);
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const current = { ...DEFAULT_SETTINGS, companyName: "Confirmed old", theme: "dark" as const, rates, apiBaseUrl: "http://api.test", apiOnline: true };
    const draft = { ...current, companyName: "Unsaved draft", phone: "draft" };
    useStore.setState({ settings: current, user: manager, toasts: [] });

    await expect(useStore.getState().saveCompanySettings(draft)).rejects.toBeTruthy();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useStore.getState().settings).toEqual(current);
  });

  it("reset sends only default CompanyDto and preserves connection, theme, rates and online state", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      return Response.json(JSON.parse(String(init?.body)));
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const current = {
      ...DEFAULT_SETTINGS, companyName: "Custom", phone: "Custom",
      theme: "dark" as const, rates, apiBaseUrl: "http://api.test", apiOnline: false,
    };
    useStore.setState({ settings: current, user: admin, toasts: [] });

    await expect(useStore.getState().resetCompanySettings()).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://api.test/api/settings");
    expect(calls[0].body).toEqual({
      companyName: DEFAULT_SETTINGS.companyName, tagline: DEFAULT_SETTINGS.tagline,
      address: DEFAULT_SETTINGS.address, phone: DEFAULT_SETTINGS.phone,
      email: DEFAULT_SETTINGS.email, requisites: DEFAULT_SETTINGS.requisites,
      manager: DEFAULT_SETTINGS.manager, executor: DEFAULT_SETTINGS.executor,
    });
    expect(useStore.getState().settings).toEqual({
      ...DEFAULT_SETTINGS, theme: "dark", rates, apiBaseUrl: "http://api.test", apiOnline: false,
    });
  });

  it("rejects direct save and reset for an engineer", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const current = { ...DEFAULT_SETTINGS, companyName: "Protected", apiBaseUrl: "http://api.test" };
    useStore.setState({
      settings: current,
      user: { ...admin, id: "engineer", roles: ["engineer"] },
      toasts: [],
    });

    await expect(useStore.getState().saveCompanySettings({ ...current, companyName: "Hack" })).resolves.toBe(false);
    await expect(useStore.getState().resetCompanySettings()).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual(current);
    expect(useStore.getState().toasts.filter((toast) => toast.kind === "err")).toHaveLength(2);
  });

  it.each(["light", "dark"] as const)("keeps local save/reset behavior in %s theme", async (theme) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const current = { ...DEFAULT_SETTINGS, companyName: "Old", theme, rates, apiBaseUrl: "", apiOnline: null };
    const saved = { ...current, companyName: "Local saved", phone: "123" };
    useStore.setState({ settings: current, user: manager, toasts: [] });

    await expect(useStore.getState().saveCompanySettings(saved)).resolves.toBe(true);
    expect(useStore.getState().settings.companyName).toBe("Local saved");
    await expect(useStore.getState().resetCompanySettings()).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual({ ...DEFAULT_SETTINGS, theme, rates, apiBaseUrl: "", apiOnline: null });
  });
});
