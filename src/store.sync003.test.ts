import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const project = (): Project => ({
  id: "prj-delete", number: "ТКП-1", title: "Delete me", client: "QA", contact: "",
  direction: "nku", status: "draft", createdAt: 1, updatedAt: 1,
  markup: 15, workMarkup: 25, discount: 0, vatRate: 20, showWorkLines: true,
  tzzPct: 1, thirdParty: 0, extraCosts: 0, unforeseenPct: 2, tripCosts: 0,
  transportPct: 0, smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0,
  validDays: 30, notes: "", versions: [], cabinets: [],
});

const respondToHydration = (url: string) => {
  if (url.endsWith("/api/projects")) return Response.json([project()]);
  if (url.endsWith("/api/catalog") || url.endsWith("/api/catalog/deleted")) return Response.json([]);
  if (url.endsWith("/api/settings")) return Response.json({});
  if (url.endsWith("/api/rates"))
    return Response.json({ design: 1, production: 1, software: 1, smr: 1, pnr: 1 });
  throw new Error(`unexpected GET ${url}`);
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

describe("SYNC-003: pending project deletion during hydration", () => {
  it("does not resurrect a project after a failed DELETE and clears the op after reconnect", async () => {
    let deleteAttempt = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "DELETE") {
        deleteAttempt += 1;
        if (deleteAttempt === 1) throw new TypeError("network down");
        return new Response(null, { status: 204 });
      }
      return respondToHydration(url);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      projects: [project()],
      outbox: [],
      user: { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] },
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    expect(useStore.getState().deleteProject("prj-delete")).toBe(true);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.delete", id: "prj-delete" }),
    ]));

    await useStore.getState().hydrateFromApi();
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    expect(deleteAttempt).toBe(2);
    expect(useStore.getState().projects).toEqual([]);
  });

  it("lets delete win when pending upsert and delete target the same project", async () => {
    const deleteMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "DELETE") return deleteMock();
      return respondToHydration(url);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      projects: [],
      outbox: [
        { kind: "project.upsert", id: "prj-delete", ts: 1 },
        { kind: "project.delete", id: "prj-delete", ts: 2 },
      ],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    await useStore.getState().hydrateFromApi();
    await vi.waitFor(() => expect(deleteMock).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    expect(useStore.getState().projects).toEqual([]);
  });
});
