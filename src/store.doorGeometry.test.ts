import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CabinetDoorGeometry, Project } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const geometry: CabinetDoorGeometry = {
  schema: "cabinet-door-geometry-v1", units: "mm", view: "outside-front",
  leaves: [{ door: 0, originXmm: 0, originYmm: 0, widthMm: 800, heightMm: 1800,
    placement: { leftMm: 50, topMm: 100, widthMm: 700, heightMm: 1600 } }],
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
    localStorage: storage, clearTimeout, setTimeout, setInterval: vi.fn(() => 1),
    location: { origin: "http://ui.test", protocol: "http:" },
  });
});

describe("DOOR-004/005: confirmed geometry lifecycle", () => {
  it("confirms geometry before an immediately requested version snapshot", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); calls.push(url);
      if (url.endsWith("/door-geometry")) return Response.json(geometry);
      if (url.includes("/versions?")) return Response.json([{ id: "ver-1", ts: 2, label: "geometry",
        snapshot: { cabinets: [{ ...project().cabinets[0], doorGeometry: geometry }], calc: { eqBase: 0, total: 0 } } }]);
      return Response.json(init?.body ? JSON.parse(String(init.body)) : project());
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [project()], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    const save = useStore.getState().saveCabinetDoorGeometry("prj-1", "cab-1", geometry);
    const version = useStore.getState().saveVersion("prj-1", "geometry");
    expect(await save).toBe(true);
    expect(await version).toBe(true);
    expect(calls.findIndex((url) => url.includes("/versions?"))).toBeGreaterThan(calls.findIndex((url) => url.endsWith("/door-geometry")));
    expect(useStore.getState().projects[0].versions[0].cabinets[0].doorGeometry).toEqual(geometry);
  });

  it("keeps the last confirmed cabinet after a rejected geometry write", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail: "invalid" }, { status: 400 })));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [project()], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });
    expect(await useStore.getState().saveCabinetDoorGeometry("prj-1", "cab-1", geometry)).toBe(false);
    expect(useStore.getState().projects[0].cabinets[0].doorGeometry).toBeUndefined();
  });

  it("clears geometry explicitly when restoring a legacy snapshot", async () => {
    const current = project();
    current.cabinets[0].doorGeometry = geometry;
    current.versions = [{ id: "legacy", ts: 1, label: "legacy", cabinets: [project().cabinets[0]], calc: { eqBase: 0, total: 0 } }];
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); const method = init?.method ?? "GET"; calls.push({ url, method });
      if (method === "DELETE") return new Response(null, { status: 204 });
      return Response.json(current);
    }));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [current], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    expect(await useStore.getState().restoreVersion("prj-1", "legacy")).toBe(true);
    expect(calls.some((call) => call.method === "DELETE" && call.url.endsWith("/door-geometry"))).toBe(true);
    expect(useStore.getState().projects[0].cabinets[0].doorGeometry).toBeUndefined();
  });
});
