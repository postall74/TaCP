import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
  },
  configurable: true,
});
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: globalThis.localStorage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: vi.fn(() => 1),
    location: { origin: "http://qa.test", protocol: "http:" },
  },
  configurable: true,
});

const { useStore, DEFAULT_SETTINGS } = await import("./store");

const cabinet = {
  id: "cab-snapshot",
  kind: "nku",
  name: "Snapshot cabinet",
  hours: 0,
  designHours: 1.25,
  softwareHours: 2.5,
  note: null,
  items: [{
    id: "item-snapshot",
    eqId: null,
    sku: "QA-001",
    name: "Meter",
    brand: "QA",
    unit: "шт",
    qty: 0.125,
    purchase: 1234.5678,
  }],
};

describe("VERSION-001 frontend restore", () => {
  beforeEach(() => {
    memory.clear();
    useStore.setState({
      projects: [],
      catalog: [],
      deletedCatalog: [],
      outbox: [],
      toasts: [],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://qa.test" },
    });
  });

  it("hydrates the server snapshot through normalizeVersion and restores exact cabinet values", async () => {
    const project = {
      id: "project-version-qa",
      number: "QA-001",
      title: "Version QA",
      client: "QA",
      contact: "",
      direction: "nku",
      status: "draft",
      createdAt: 1,
      updatedAt: 2,
      cabinets: [],
      versions: [{
        id: "version-legacy",
        ts: "2026-10-09T10:00:00Z",
        label: "Legacy",
        snapshot: {
          cabinets: [cabinet],
          calc: { eqBase: 154.320975, total: 177.46912125 },
          extension: { KeepCase: "unchanged" },
        },
      }],
    };
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const body = url.endsWith("/api/projects") ? [project]
        : url.endsWith("/api/catalog/deleted") ? []
        : url.endsWith("/api/catalog") ? []
        : url.endsWith("/api/settings") ? {}
        : url.endsWith("/api/rates") ? { design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 }
        : null;
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    await useStore.getState().hydrateFromApi();
    const normalized = useStore.getState().projects[0].versions[0];
    expect(normalized.id).toBe("version-legacy");
    expect(normalized.cabinets[0].items[0]).toMatchObject({
      id: "item-snapshot", name: "Meter", qty: 0.125, purchase: 1234.5678, eqId: null,
    });
    expect(normalized.calc).toEqual({ eqBase: 154.320975, total: 177.46912125 });
    expect(() => useStore.getState().restoreVersion("project-version-qa", "version-legacy")).not.toThrow();
    const restored = useStore.getState().projects[0].cabinets[0];
    expect(restored.id).toBe("cab-snapshot");
    expect(restored.name).toBe("Snapshot cabinet");
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0]).toMatchObject({ id: "item-snapshot", qty: 0.125, purchase: 1234.5678 });
  });
});
