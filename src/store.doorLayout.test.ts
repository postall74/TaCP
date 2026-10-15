import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CabinetDoorLayout, Project } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const layout: CabinetDoorLayout = {
  schema: "cabinet-door-layout-v1",
  doorCount: 2,
  labelSide: "below",
  elements: [{ id: "lamp-0", kind: "lamp", tone: "green", label: "Сеть 1", door: 1, x: 250, y: 180 }],
};

const project = (): Project => ({
  id: "prj-1", number: "ТКП-1", title: "Door", client: "QA", contact: "",
  direction: "nku", status: "draft", createdAt: 1, updatedAt: 1,
  markup: 15, workMarkup: 25, discount: 0, vatRate: 20, showWorkLines: true,
  tzzPct: 1, thirdParty: 0, extraCosts: 0, unforeseenPct: 2, tripCosts: 0,
  transportPct: 0, smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0,
  validDays: 30, notes: "", versions: [],
  cabinets: [{ id: "cab-1", kind: "ШУ", name: "Шкаф", hours: 0, designHours: 0, softwareHours: 0, items: [] }],
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

describe("DOOR-003: store ordering and failure semantics", () => {
  it("serializes layout confirmation before an immediately requested version snapshot", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, method, body });
      if (url.endsWith("/door-layout"))
        return Response.json(layout);
      if (url.includes("/versions?"))
        return Response.json([{ id: "ver-1", ts: 2, label: "after drag", snapshot: { cabinets: [{ ...project().cabinets[0], doorLayout: layout }], calc: { eqBase: 0, total: 0 } } }]);
      return Response.json(body ? JSON.parse(body) : project());
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [project()], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    const layoutSave = useStore.getState().saveCabinetDoorLayout("prj-1", "cab-1", layout);
    const versionSave = useStore.getState().saveVersion("prj-1", "after drag");
    expect(await layoutSave).toBe(true);
    expect(await versionSave).toBe(true);

    const addressedIndex = calls.findIndex((call) => call.url.endsWith("/door-layout"));
    const versionIndex = calls.findIndex((call) => call.url.includes("/versions?"));
    expect(addressedIndex).toBeGreaterThanOrEqual(0);
    expect(versionIndex).toBeGreaterThan(addressedIndex);
    expect(calls.slice(0, versionIndex).some((call) => call.url.endsWith("/api/projects/prj-1"))).toBe(true);
    expect(useStore.getState().projects[0].versions[0].cabinets[0].doorLayout).toEqual(layout);
  });

  it("keeps the last confirmed cabinet and returns false on a 409 save", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/door-layout"))
        return Response.json({ detail: "future schema" }, { status: 409 });
      return Response.json(init?.body ? JSON.parse(String(init.body)) : project());
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [project()], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    expect(await useStore.getState().saveCabinetDoorLayout("prj-1", "cab-1", layout)).toBe(false);
    expect(useStore.getState().projects[0].cabinets[0].doorLayout).toBeUndefined();
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
  });
});
