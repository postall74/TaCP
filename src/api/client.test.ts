import { afterEach, describe, expect, it, vi } from "vitest";
import { restApi } from "./client";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

afterEach(() => {
  vi.unstubAllGlobals();
  storage.clear();
});

describe("DOOR-003: frontend/backend wire contract", () => {
  it("PUT sends exact normalized layout without tone:null", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (_url, init) =>
      new Response(init?.body, { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });

    const layout = {
      schema: "cabinet-door-layout-v1" as const,
      doorCount: 2 as const,
      labelSide: "below" as const,
      elements: [
        { id: "lamp-0", kind: "lamp" as const, tone: "green" as const, label: "Сеть 1", door: 0, x: 250, y: 180 },
        { id: "stop-0", kind: "emergency-stop" as const, label: "", door: 1, x: 500, y: 700 },
      ],
    };

    await restApi("http://api.test").putCabinetDoorLayout("prj-1", "cab-1", layout);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/projects/prj-1/cabinets/cab-1/door-layout");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual(layout);
    expect(String(init?.body)).not.toContain('"tone":null');
  });

  it("DELETE uses the addressed clear endpoint without a body", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });

    await restApi("http://api.test/").deleteCabinetDoorLayout("prj-1", "cab-1");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/projects/prj-1/cabinets/cab-1/door-layout");
    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
  });
});
