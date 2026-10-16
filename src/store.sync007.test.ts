import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipment } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const existing: Equipment = {
  id: "eq-existing", sku: "EX-1", name: "Old name", brand: "Old brand",
  category: "Контакторы и реле", direction: "uni", unit: "шт", purchase: 100,
  attrs: "before",
};
const neighbor: Equipment = {
  id: "eq-neighbor", sku: "KEEP-1", name: "Untouched", brand: "QA",
  category: "Контакторы и реле", direction: "nku", unit: "компл", purchase: 999,
  attrs: "must stay exact", ratedCurrent: 25,
};
const imported = [
  { sku: "ex-1", name: "Updated name", brand: "New brand", category: "Контакторы и реле", direction: "asu" as const, unit: "шт", purchase: 200, attrs: "after" },
  { sku: "NEW-1", name: "New row", brand: "QA", category: "ПЛК и модули", direction: "asu" as const, unit: "шт", purchase: 300 },
];
const csv = "артикул;наименование\nEX-1;Updated name\nNEW-1;New row";
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

describe("SYNC-007: transactional catalog import", () => {
  it.each([
    ["network failure", () => Promise.reject(new TypeError("network down"))],
    ["HTTP 400", () => Promise.resolve(Response.json({ detail: "bad csv" }, { status: 400 }))],
    ["HTTP 500", () => Promise.resolve(Response.json({ detail: "server error" }, { status: 500 }))],
  ])("rolls back the whole catalog and rejects on %s", async (_label, reply) => {
    vi.stubGlobal("fetch", vi.fn(reply));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [existing, neighbor], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await expect(useStore.getState().importEquipment(imported, csv)).rejects.toBeTruthy();

    expect(useStore.getState().catalog).toEqual([existing, neighbor]);
  });

  it("commits existing-SKU update and new row only after remote success", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(csv);
      return Response.json({ added: 1, updated: 1, skipped: 0 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [existing, neighbor], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test", apiOnline: false }, toasts: [],
    });

    await expect(useStore.getState().importEquipment(imported, csv)).resolves.toBe(1);

    const catalog = useStore.getState().catalog;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(catalog.find((item) => item.sku.toLowerCase() === "ex-1")).toEqual({ ...existing, ...imported[0], id: existing.id });
    expect(catalog.find((item) => item.sku === "NEW-1")).toEqual(expect.objectContaining(imported[1]));
    expect(catalog.find((item) => item.id === neighbor.id)).toEqual(neighbor);
    expect(useStore.getState().settings.apiOnline).toBe(true);
  });

  it("commits the same merge locally without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [existing, neighbor], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "" }, toasts: [],
    });

    await expect(useStore.getState().importEquipment(imported, csv)).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().catalog.find((item) => item.id === neighbor.id)).toEqual(neighbor);
    expect(useStore.getState().catalog).toHaveLength(3);
  });
});
