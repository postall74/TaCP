import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeletedEquipment, Equipment } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const equipment = (id: string, name: string): Equipment => ({
  id, sku: `SKU-${id}`, name, brand: "QA", category: "Контакторы и реле",
  direction: "uni", unit: "шт", purchase: 100,
});

const target = equipment("eq-delete", "Delete me");
const other = equipment("eq-other", "Keep me");

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

describe("SYNC-004: equipment delete recovery", () => {
  it("keeps the tombstone through stale hydration, retries once, and merges the server tombstone without duplicates", async () => {
    let deleteAttempt = 0;
    let deleteSucceeded = false;
    const serverTombstone: DeletedEquipment = { ...target, deletedAt: 200, deletedBy: "server@qa.test" };

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "DELETE" && url.endsWith("/api/catalog/eq-delete")) {
        deleteAttempt += 1;
        if (deleteAttempt === 1) throw new TypeError("network down");
        deleteSucceeded = true;
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/api/projects")) return Response.json([]);
      if (url.endsWith("/api/catalog")) return Response.json(deleteSucceeded ? [other] : [target, other]);
      if (url.endsWith("/api/catalog/deleted")) return Response.json(deleteSucceeded ? [serverTombstone] : []);
      if (url.endsWith("/api/settings")) return Response.json({});
      if (url.endsWith("/api/rates"))
        return Response.json({ design: 1, production: 1, software: 1, smr: 1, pnr: 1 });
      throw new Error(`unexpected request: ${method} ${url}`);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [target, other],
      deletedCatalog: [],
      outbox: [{ kind: "equipment.upsert", eqId: target.id, ts: 1 }],
      user: { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] },
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    useStore.getState().deleteEquipment(target.id);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.delete", eqId: target.id }),
    ]));
    expect(useStore.getState().catalog).toEqual([other]);
    expect(useStore.getState().deletedCatalog).toEqual([
      expect.objectContaining({ id: target.id, name: target.name }),
    ]);

    await useStore.getState().hydrateFromApi();
    expect(useStore.getState().catalog).toEqual([other]);
    expect(useStore.getState().deletedCatalog).toHaveLength(1);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));
    expect(deleteAttempt).toBe(2);

    await useStore.getState().hydrateFromApi();
    expect(useStore.getState().catalog).toEqual([other]);
    expect(useStore.getState().deletedCatalog).toEqual([serverTombstone]);
  });

  it.each([409, 500])("dequeues an equipment delete after HTTP %i without marking sync successful", async (status) => {
    const fetchMock = vi.fn(async () => Response.json({ detail: "server response" }, { status }));
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const tombstone: DeletedEquipment = { ...target, deletedAt: 100, deletedBy: "qa@test" };
    useStore.setState({
      catalog: [other],
      deletedCatalog: [tombstone],
      outbox: [{ kind: "equipment.delete", eqId: target.id, ts: 1 }],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test", apiOnline: false },
      toasts: [],
    });

    await useStore.getState().flushOutbox();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useStore.getState().outbox).toEqual([]);
    expect(useStore.getState().catalog).toEqual([other]);
    expect(useStore.getState().deletedCatalog).toEqual([tombstone]);
    expect(useStore.getState().settings.apiOnline).toBe(false);
  });
});
