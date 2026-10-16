import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipment } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const equipment = (id: string, name: string, purchase: number): Equipment => ({
  id,
  sku: `SKU-${id}`,
  name,
  brand: "QA",
  category: "Контакторы и реле",
  direction: "uni",
  unit: "шт",
  purchase,
  attrs: "local payload",
});

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

describe("SYNC-002: equipment upsert recovery", () => {
  it("keeps a failed local payload over a conflicting remote row and flushes that exact payload", async () => {
    const local = equipment("eq-shared", "Local edit", 1234);
    const remoteConflict = equipment("eq-shared", "Stale remote", 10);
    const remoteOnly = equipment("eq-remote", "Remote only", 20);
    const putBodies: Equipment[] = [];
    let putAttempt = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "PUT" && url.endsWith("/api/catalog/eq-shared")) {
        putBodies.push(JSON.parse(String(init?.body)) as Equipment);
        putAttempt += 1;
        if (putAttempt === 1) throw new TypeError("network down");
        return Response.json(local);
      }
      if (url.endsWith("/api/projects")) return Response.json([]);
      if (url.endsWith("/api/catalog")) return Response.json([remoteConflict, remoteOnly]);
      if (url.endsWith("/api/catalog/deleted")) return Response.json([]);
      if (url.endsWith("/api/settings")) return Response.json({});
      if (url.endsWith("/api/rates"))
        return Response.json({ design: 1, production: 1, software: 1, smr: 1, pnr: 1 });
      throw new Error(`unexpected request: ${method} ${url}`);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ catalog: [], outbox: [], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    useStore.getState().upsertEquipment(local);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: local.id }),
    ]));

    await useStore.getState().hydrateFromApi();
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    expect(putBodies).toEqual([local, local]);
    expect(useStore.getState().catalog).toEqual([local, remoteOnly]);
    expect(useStore.getState().settings.apiOnline).toBe(true);
  });

  it("drops a pending operation after HTTP 409 without replacing its local payload", async () => {
    const local = equipment("eq-conflict", "Local conflict", 777);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "duplicate" }, { status: 409 })));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [local],
      outbox: [{ kind: "equipment.upsert", eqId: local.id, ts: 1 }],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test", apiOnline: false },
      toasts: [],
    });

    await useStore.getState().flushOutbox();

    expect(useStore.getState().outbox).toEqual([]);
    expect(useStore.getState().catalog).toEqual([local]);
    expect(useStore.getState().settings.apiOnline).toBe(false);
  });

  it("does not PUT, dequeue, or mark sync successful when the payload is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const pending = { kind: "equipment.upsert" as const, eqId: "eq-missing", ts: 1 };
    useStore.setState({
      catalog: [],
      outbox: [pending],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test", apiOnline: false },
      toasts: [],
    });

    await useStore.getState().flushOutbox();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([pending]);
    expect(useStore.getState().settings.apiOnline).toBe(false);
  });
});
