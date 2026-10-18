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

const hydrationResponse = (url: string) => {
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

describe("SYNC-005: project delete supersedes pending upsert", () => {
  it("repairs a legacy persisted upsert/delete pair without PUT or POST", async () => {
    const mutationMethods: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") mutationMethods.push(method);
      if (method === "DELETE") return new Response(null, { status: 204 });
      return hydrationResponse(url);
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
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    expect(mutationMethods).toEqual(["DELETE"]);
    expect(useStore.getState().projects).toEqual([]);
  });

  it("reconnects after a failed real update and delete without replaying the obsolete upsert", async () => {
    const mutationMethodsAfterDelete: string[] = [];
    let deleteStarted = false;
    let deleteAttempts = 0;
    let successfulDeletes = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (deleteStarted && method !== "GET") mutationMethodsAfterDelete.push(method);
      if (method === "PUT") throw new TypeError("update network failure");
      if (method === "DELETE") {
        deleteAttempts += 1;
        if (deleteAttempts === 1) throw new TypeError("delete network failure");
        successfulDeletes += 1;
        return new Response(null, { status: 204 });
      }
      return hydrationResponse(url);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      projects: [project()],
      outbox: [],
      user: { id: "admin", email: "admin@qa.test", fullName: "QA", position: "", roles: ["admin"] },
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    useStore.getState().updateProject("prj-delete", { title: "Offline edit" });
    await new Promise((resolve) => setTimeout(resolve, 750));
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: "prj-delete" }),
    ]));

    deleteStarted = true;
    expect(useStore.getState().deleteProject("prj-delete")).toBe(true);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.delete", id: "prj-delete" }),
    ]));

    await useStore.getState().hydrateFromApi();
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    expect(mutationMethodsAfterDelete).toEqual(["DELETE", "DELETE"]);
    expect(successfulDeletes).toBe(1);
    expect(useStore.getState().projects).toEqual([]);
  });

  it("still preserves an ordinary payload-less upsert when no later delete exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const pending = { kind: "project.upsert" as const, id: "prj-missing", ts: 1 };
    useStore.setState({
      projects: [], outbox: [pending],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test", apiOnline: false },
      toasts: [],
    });

    await useStore.getState().flushOutbox();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([pending]);
    expect(useStore.getState().settings.apiOnline).toBe(false);
  });
});
