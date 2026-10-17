import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipment } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};
const originalA: Equipment = {
  id: "eq-a", sku: "SKU-A", name: "Original A", brand: "Brand A",
  category: "Контакторы и реле", direction: "nku", unit: "шт", purchase: 100,
  attrs: "original fields", ratedCurrent: 16,
};
const existingB: Equipment = {
  id: "eq-b", sku: "SKU-B", name: "Existing B", brand: "Brand B",
  category: "Контакторы и реле", direction: "asu", unit: "компл", purchase: 200,
  attrs: "untouched", ratedCurrent: 25,
};
const editedA: Equipment = {
  ...originalA, sku: "SKU-B", name: "Edited A", brand: "Edited", purchase: 999,
  attrs: "changed", ratedCurrent: 63,
};
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

describe("SYNC-008: confirmed equipment upsert", () => {
  it.each([409, 400, 500])("fully rolls back existing A and preserves B after HTTP %i", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "rejected" }, { status })));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [originalA, existingB], outbox: [], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await expect(useStore.getState().upsertEquipment(editedA)).rejects.toBeTruthy();

    expect(useStore.getState().catalog).toEqual([originalA, existingB]);
    expect(useStore.getState().outbox).toEqual([]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
  });

  it("removes a new optimistic row after HTTP 409", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "duplicate" }, { status: 409 })));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const created = { ...originalA, id: "eq-new", sku: "NEW" };
    useStore.setState({
      catalog: [existingB], outbox: [], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await expect(useStore.getState().upsertEquipment(created)).rejects.toBeTruthy();

    expect(useStore.getState().catalog).toEqual([existingB]);
    expect(useStore.getState().outbox).toEqual([]);
  });

  it("sends a successful remote update exactly once", async () => {
    const bodies: Equipment[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Equipment);
      return Response.json(editedA);
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [originalA, existingB], outbox: [], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await useStore.getState().upsertEquipment(editedA);

    expect(bodies).toEqual([editedA]);
    expect(useStore.getState().catalog).toEqual([editedA, existingB]);
    expect(useStore.getState().outbox).toEqual([]);
  });

  it("keeps optimistic data and outbox on network failure, then reconnect sends and clears it", async () => {
    const bodies: Equipment[] = [];
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Equipment);
      if (!online) throw new TypeError("network down");
      return Response.json(editedA);
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [originalA, existingB], outbox: [], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await expect(useStore.getState().upsertEquipment(editedA)).rejects.toBeTruthy();
    expect(useStore.getState().catalog).toEqual([editedA, existingB]);
    expect(useStore.getState().outbox).toEqual([expect.objectContaining({ kind: "equipment.upsert", eqId: editedA.id })]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);

    online = true;
    await useStore.getState().flushOutbox();

    expect(bodies).toEqual([editedA, editedA]);
    expect(useStore.getState().outbox).toEqual([]);
    expect(useStore.getState().catalog).toEqual([editedA, existingB]);
  });

  it("commits locally without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [originalA, existingB], outbox: [], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "" }, toasts: [],
    });

    await useStore.getState().upsertEquipment(editedA);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().catalog).toEqual([editedA, existingB]);
  });
});
