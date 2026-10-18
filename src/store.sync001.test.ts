import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "./types";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const project = (id = "prj-source"): Project => ({
  id, number: "ТКП-1", title: "SYNC", client: "QA", contact: "",
  direction: "nku", status: "draft", createdAt: 1, updatedAt: 1,
  markup: 15, workMarkup: 25, discount: 0, vatRate: 20, showWorkLines: true,
  tzzPct: 1, thirdParty: 0, extraCosts: 0, unforeseenPct: 2, tripCosts: 0,
  transportPct: 0, smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0,
  validDays: 30, notes: "", versions: [], cabinets: [],
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

describe("SYNC-001: duplicate project outbox recovery", () => {
  it("preserves the duplicate payload and upsert across a failed create and hydration", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method === "POST" || method === "PUT") throw new TypeError("network down");
      if (url.endsWith("/api/projects") || url.endsWith("/api/catalog") || url.endsWith("/api/catalog/deleted"))
        return Response.json([]);
      if (url.endsWith("/api/settings")) return Response.json({});
      if (url.endsWith("/api/rates"))
        return Response.json({ design: 1, production: 1, software: 1, smr: 1, pnr: 1 });
      throw new Error(`unexpected request: ${method} ${url}`);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [project()], outbox: [], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    const duplicateId = useStore.getState().duplicateProject("prj-source");
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: duplicateId }),
    ]));
    const duplicateBeforeHydration = useStore.getState().projects.find((item) => item.id === duplicateId);

    await useStore.getState().hydrateFromApi();
    await vi.waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));

    expect(useStore.getState().projects.find((item) => item.id === duplicateId)).toEqual(duplicateBeforeHydration);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: duplicateId }),
    ]);
  });

  it("replays a pending duplicate with PUT then POST and clears it only once", async () => {
    const calls: Array<{ method: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, body: typeof init?.body === "string" ? init.body : undefined });
      if (method === "PUT") return Response.json({ detail: "missing" }, { status: 404 });
      return Response.json(project("prj-copy"), { status: 201 });
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const copy = project("prj-copy");
    useStore.setState({
      projects: [copy],
      outbox: [{ kind: "project.upsert", id: copy.id, ts: 1 }],
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    await useStore.getState().flushOutbox();
    expect(calls.map((call) => call.method)).toEqual(["PUT", "POST"]);
    expect(JSON.parse(calls[0].body ?? "null")).toEqual(copy);
    expect(JSON.parse(calls[1].body ?? "null")).toEqual(copy);
    expect(useStore.getState().outbox).toEqual([]);

    await useStore.getState().flushOutbox();
    expect(calls).toHaveLength(2);
  });

  it.each([
    ["success", 201],
    ["HTTP error", 409],
  ])("removes the optimistic duplicate operation after %s", async (_label, status) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      status === 201 ? project("server-copy") : { detail: "conflict" },
      { status },
    )));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ projects: [project()], outbox: [], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    const duplicateId = useStore.getState().duplicateProject("prj-source");
    expect(duplicateId).not.toBe("");
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));
  });

  it("keeps an upsert whose local project payload is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    const pending = { kind: "project.upsert" as const, id: "prj-missing", ts: 1 };
    useStore.setState({ projects: [], outbox: [pending], settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" }, toasts: [] });

    await useStore.getState().flushOutbox();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([pending]);
  });
});
