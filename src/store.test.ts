import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  projects: vi.fn(),
  catalog: vi.fn(),
  company: vi.fn(),
  rates: vi.fn(),
  deletedEquipment: vi.fn(),
  createProject: vi.fn(),
  putProject: vi.fn(),
}));

const MockApiError = vi.hoisted(() => class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
});

vi.mock("./api/client", () => ({
  ApiError: MockApiError,
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  restApi: vi.fn(() => api),
}));

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
});

const { useStore } = await import("./store");
const initialState = useStore.getInitialState();

const projectInput = {
  title: "Исходный проект",
  client: "Заказчик",
  contact: "",
  direction: "nku" as const,
  templateKey: null,
  markup: 20,
  validDays: 30,
};

function prepareDuplicate() {
  const sourceId = useStore.getState().createProject(projectInput);
  const settings = useStore.getState().settings;
  useStore.setState({
    settings: { ...settings, apiBaseUrl: "https://api.example.test" },
    outbox: [],
  });
  return sourceId;
}

describe("SYNC-001: duplicate project outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it("keeps a failed duplicate queued, flushes it, and retains it after hydration", async () => {
    const sourceId = prepareDuplicate();
    api.createProject.mockRejectedValueOnce(new TypeError("network unavailable"));

    const duplicateId = useStore.getState().duplicateProject(sourceId);
    const copy = useStore.getState().projects.find((project) => project.id === duplicateId);

    expect(copy).toBeDefined();
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: duplicateId }),
    ]);
    await vi.waitFor(() => expect(api.createProject).toHaveBeenCalledTimes(1));
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: duplicateId }),
    ]);

    api.createProject.mockClear();
    api.putProject.mockRejectedValueOnce(new MockApiError(404, "not found"));
    api.createProject.mockResolvedValueOnce(copy);
    await useStore.getState().flushOutbox();

    expect(api.putProject).toHaveBeenCalledWith(copy);
    expect(api.createProject).toHaveBeenCalledWith(copy);
    expect(useStore.getState().outbox).toEqual([]);

    const settings = useStore.getState().settings;
    api.projects.mockResolvedValueOnce([copy]);
    api.catalog.mockResolvedValueOnce([]);
    api.deletedEquipment.mockResolvedValueOnce([]);
    api.company.mockResolvedValueOnce({
      companyName: settings.companyName,
      tagline: settings.tagline,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      requisites: settings.requisites,
      manager: settings.manager,
      executor: settings.executor,
    });
    api.rates.mockResolvedValueOnce(settings.rates);
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().projects.some((project) => project.id === duplicateId)).toBe(true);
  });

  it("removes the queued duplicate after a successful create", async () => {
    const sourceId = prepareDuplicate();
    api.createProject.mockResolvedValueOnce({});

    const duplicateId = useStore.getState().duplicateProject(sourceId);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: duplicateId }),
    ]);

    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));
  });

  it.each([400, 500])("removes an HTTP %s failure from the queue without retrying it", async (status) => {
    const sourceId = prepareDuplicate();
    api.createProject.mockRejectedValueOnce(new MockApiError(status, "server error"));

    useStore.getState().duplicateProject(sourceId);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    await useStore.getState().flushOutbox();
    expect(api.createProject).toHaveBeenCalledTimes(1);
    expect(api.putProject).not.toHaveBeenCalled();
  });
});
