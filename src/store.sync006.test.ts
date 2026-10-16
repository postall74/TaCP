import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeletedEquipment, Equipment } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const activeOther: Equipment = {
  id: "eq-active", sku: "ACTIVE", name: "Active other", brand: "QA",
  category: "Контакторы и реле", direction: "uni", unit: "шт", purchase: 50,
};
const tombstone: DeletedEquipment = {
  id: "eq-restore", sku: "RESTORE", name: "Restore target", brand: "QA",
  category: "Контакторы и реле", direction: "nku", unit: "компл", purchase: 321,
  attrs: "all fields", ratedCurrent: 63, deletedAt: 123456789, deletedBy: "owner@qa.test",
};
const otherTombstone: DeletedEquipment = {
  id: "eq-trash-other", sku: "TRASH", name: "Trash other", brand: "QA",
  category: "Контакторы и реле", direction: "uni", unit: "шт", purchase: 75,
  deletedAt: 987654321, deletedBy: "other@qa.test",
};

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

const admin = { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] };

describe("SYNC-006: restore equipment rollback", () => {
  it.each([
    ["network failure", () => Promise.reject(new TypeError("network down"))],
    ["HTTP 409", () => Promise.resolve(Response.json({ detail: "conflict" }, { status: 409 }))],
    ["HTTP 500", () => Promise.resolve(Response.json({ detail: "server error" }, { status: 500 }))],
  ])("restores the exact tombstone after %s and rejects", async (_label, reply) => {
    vi.stubGlobal("fetch", vi.fn(reply));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [activeOther], deletedCatalog: [tombstone, otherTombstone], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await expect(useStore.getState().restoreEquipment(tombstone.id)).rejects.toBeTruthy();

    expect(useStore.getState().catalog).toEqual([activeOther]);
    expect(useStore.getState().deletedCatalog).toEqual([tombstone, otherTombstone]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
  });

  it("keeps the optimistic restore after remote success and leaves other rows unchanged", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [activeOther], deletedCatalog: [tombstone, otherTombstone], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await useStore.getState().restoreEquipment(tombstone.id);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useStore.getState().catalog).toEqual([
      activeOther,
      { ...tombstone, deletedAt: undefined, deletedBy: undefined },
    ]);
    expect(useStore.getState().deletedCatalog).toEqual([otherTombstone]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(true);
  });

  it("restores locally without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [activeOther], deletedCatalog: [tombstone, otherTombstone], user: admin,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "" }, toasts: [],
    });

    await useStore.getState().restoreEquipment(tombstone.id);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().catalog.map((item) => item.id)).toEqual([activeOther.id, tombstone.id]);
    expect(useStore.getState().deletedCatalog).toEqual([otherTombstone]);
  });

  it.each([
    ["unknown ID", admin, "unknown"],
    ["insufficient permissions", { ...admin, roles: ["engineer"] }, tombstone.id],
  ])("does not mutate rows for %s", async (_label, user, id) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      catalog: [activeOther], deletedCatalog: [tombstone, otherTombstone], user,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [],
    });

    await useStore.getState().restoreEquipment(id);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().catalog).toEqual([activeOther]);
    expect(useStore.getState().deletedCatalog).toEqual([tombstone, otherTombstone]);
    const toasts = useStore.getState().toasts;
    expect(toasts[toasts.length - 1]?.kind).toBe("err");
  });
});
