import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};
const confirmed = { design: 100, production: 200, software: 300, smr: 400, pnr: 500 };
const requested = { design: 110, production: 220, software: 330, smr: 440, pnr: 550 };
const returned = { design: 111, production: 222, software: 333, smr: 444, pnr: 555 };
const admin = { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] };

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

describe("SYNC-010: confirmed rates", () => {
  it("sends exactly one rates PUT and applies exactly the returned rates", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", body: JSON.parse(String(init?.body)) });
      return Response.json(returned);
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const settings = { ...DEFAULT_SETTINGS, companyName: "Keep", theme: "dark" as const, rates: confirmed, apiBaseUrl: "http://api.test", apiOnline: false };
    useStore.setState({ settings, user: admin, toasts: [] });

    await expect(useStore.getState().saveRates(requested)).resolves.toBe(true);

    expect(calls).toEqual([{ url: "http://api.test/api/rates", method: "PUT", body: requested }]);
    expect(useStore.getState().settings).toEqual({ ...settings, rates: returned });
  });

  it.each([
    ["network", () => Promise.reject(new TypeError("network down"))],
    ["HTTP 400", () => Promise.resolve(Response.json({ detail: "bad" }, { status: 400 }))],
    ["HTTP 403", () => Promise.resolve(Response.json({ detail: "forbidden" }, { status: 403 }))],
    ["HTTP 500", () => Promise.resolve(Response.json({ detail: "server" }, { status: 500 }))],
  ])("keeps all confirmed settings after %s", async (_label, reply) => {
    const fetchMock = vi.fn(reply);
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const settings = { ...DEFAULT_SETTINGS, companyName: "Keep", theme: "dark" as const, rates: confirmed, apiBaseUrl: "http://api.test", apiOnline: true };
    useStore.setState({ settings, user: admin, toasts: [] });

    await expect(useStore.getState().saveRates(requested)).rejects.toBeTruthy();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useStore.getState().settings).toEqual(settings);
  });

  it.each(["manager", "engineer"])("rejects a direct store call from %s", async (role) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const settings = { ...DEFAULT_SETTINGS, rates: confirmed, apiBaseUrl: "http://api.test" };
    useStore.setState({ settings, user: { ...admin, id: role, roles: [role] }, toasts: [] });

    await expect(useStore.getState().saveRates(requested)).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual(settings);
    expect(useStore.getState().toasts[0]?.kind).toBe("err");
  });

  it.each(["light", "dark"] as const)("saves locally without API and preserves other settings in %s theme", async (theme) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const settings = { ...DEFAULT_SETTINGS, companyName: "Keep", theme, rates: confirmed, apiBaseUrl: "", apiOnline: null };
    useStore.setState({ settings, user: admin, toasts: [] });

    await expect(useStore.getState().saveRates(requested)).resolves.toBe(true);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual({ ...settings, rates: requested });
  });
});
