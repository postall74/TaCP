import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  projects: vi.fn(),
  catalog: vi.fn(),
  company: vi.fn(),
  rates: vi.fn(),
  deletedEquipment: vi.fn(),
  createProject: vi.fn(),
  putProject: vi.fn(),
  deleteProject: vi.fn(),
  putEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
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

  it("keeps a failed duplicate through hydration and flushes it after reconnect", async () => {
    const sourceId = prepareDuplicate();
    const source = useStore.getState().projects.find((project) => project.id === sourceId);
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

    const settings = useStore.getState().settings;
    api.projects.mockResolvedValueOnce([source]);
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
    api.putProject.mockRejectedValueOnce(new TypeError("network still unavailable"));
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().projects.some((project) => project.id === duplicateId)).toBe(true);
    await vi.waitFor(() => expect(api.putProject).toHaveBeenCalledWith(copy));
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: duplicateId }),
    ]);

    api.createProject.mockClear();
    api.putProject.mockRejectedValueOnce(new MockApiError(404, "not found"));
    api.createProject.mockResolvedValueOnce(copy);
    await useStore.getState().flushOutbox();

    expect(api.putProject).toHaveBeenLastCalledWith(copy);
    expect(api.createProject).toHaveBeenCalledWith(copy);
    expect(useStore.getState().outbox).toEqual([]);

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

  it("retains a project upsert when its local payload is missing", async () => {
    const settings = useStore.getState().settings;
    useStore.setState({
      projects: [],
      settings: { ...settings, apiBaseUrl: "https://api.example.test" },
      outbox: [{ kind: "project.upsert", id: "missing-project", ts: Date.now() }],
    });

    await useStore.getState().flushOutbox();

    expect(api.putProject).not.toHaveBeenCalled();
    expect(api.createProject).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: "missing-project" }),
    ]);
  });
});

const equipment = {
  ...initialState.catalog[0]!,
  id: "sync-002-equipment",
  sku: "SYNC-002",
  name: "Pending equipment",
};

function prepareEquipment() {
  const settings = useStore.getState().settings;
  useStore.setState({
    settings: { ...settings, apiBaseUrl: "https://api.example.test" },
    outbox: [],
  });
}

function mockHydration(
  catalog: typeof initialState.catalog,
  projects: typeof initialState.projects = [],
  deletedCatalog: typeof initialState.deletedCatalog = [],
) {
  const settings = useStore.getState().settings;
  api.projects.mockResolvedValueOnce(projects);
  api.catalog.mockResolvedValueOnce(catalog);
  api.deletedEquipment.mockResolvedValueOnce(deletedCatalog);
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
}

describe("SYNC-002: equipment outbox hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it("keeps failed equipment through hydration and flushes it after reconnect", async () => {
    prepareEquipment();
    api.putEquipment
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockRejectedValueOnce(new TypeError("network still unavailable"));

    useStore.getState().upsertEquipment(equipment);
    await vi.waitFor(() => expect(api.putEquipment).toHaveBeenCalledTimes(1));
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: equipment.id }),
    ]);

    mockHydration([]);
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().catalog).toContainEqual(equipment);
    await vi.waitFor(() => expect(api.putEquipment).toHaveBeenCalledTimes(2));
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: equipment.id }),
    ]);

    api.putEquipment.mockResolvedValueOnce(equipment);
    await useStore.getState().flushOutbox();

    expect(api.putEquipment).toHaveBeenLastCalledWith(equipment);
    expect(useStore.getState().outbox).toEqual([]);

    mockHydration([equipment]);
    await useStore.getState().hydrateFromApi();
    expect(useStore.getState().catalog).toContainEqual(equipment);
  });

  it("removes the queued equipment after a successful upsert", async () => {
    prepareEquipment();
    api.putEquipment.mockResolvedValueOnce(equipment);

    useStore.getState().upsertEquipment(equipment);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: equipment.id }),
    ]);

    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));
  });

  it.each([400, 500])("removes an HTTP %s failure without retrying it", async (status) => {
    prepareEquipment();
    api.putEquipment.mockRejectedValueOnce(new MockApiError(status, "server error"));

    useStore.getState().upsertEquipment(equipment);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    await useStore.getState().flushOutbox();
    expect(api.putEquipment).toHaveBeenCalledTimes(1);
  });

  it("retains the existing rollback behavior for an HTTP 409 conflict", async () => {
    prepareEquipment();
    api.putEquipment.mockRejectedValueOnce(new MockApiError(409, "duplicate"));

    useStore.getState().upsertEquipment(equipment);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    expect(useStore.getState().catalog.some((item) => item.id === equipment.id)).toBe(false);
    await useStore.getState().flushOutbox();
    expect(api.putEquipment).toHaveBeenCalledTimes(1);
  });

  it("retains an equipment upsert when its local payload is missing", async () => {
    const settings = useStore.getState().settings;
    useStore.setState({
      catalog: [],
      settings: { ...settings, apiBaseUrl: "https://api.example.test" },
      outbox: [{ kind: "equipment.upsert", eqId: equipment.id, ts: Date.now() }],
    });

    await useStore.getState().flushOutbox();

    expect(api.putEquipment).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: equipment.id }),
    ]);
  });
});

function prepareProjectDelete() {
  const id = useStore.getState().createProject(projectInput);
  const project = useStore.getState().projects.find((item) => item.id === id)!;
  const settings = useStore.getState().settings;
  useStore.setState({
    settings: { ...settings, apiBaseUrl: "https://api.example.test" },
    outbox: [],
  });
  return project;
}

describe("SYNC-003: pending project deletion hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it("keeps a pending deletion hidden through hydration and reconnect flush", async () => {
    const project = prepareProjectDelete();
    const otherProject = {
      ...project,
      id: "other-server-project",
      number: "ТКП-OTHER",
      title: "Other server project",
    };
    api.deleteProject
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(undefined);

    expect(useStore.getState().deleteProject(project.id)).toBe(true);
    await vi.waitFor(() => expect(api.deleteProject).toHaveBeenCalledTimes(1));
    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.delete", id: project.id }),
    ]);

    mockHydration(initialState.catalog, [project, otherProject]);
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);
    expect(useStore.getState().projects).toContainEqual(otherProject);
    await vi.waitFor(() => expect(api.deleteProject).toHaveBeenCalledTimes(2));
    expect(useStore.getState().outbox).toEqual([]);
    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);

    mockHydration(initialState.catalog, [otherProject]);
    await useStore.getState().hydrateFromApi();
    expect(useStore.getState().projects).toEqual([otherProject]);
  });

  it("keeps an ordinary successful deletion hidden and clears its queue", async () => {
    const project = prepareProjectDelete();
    api.deleteProject.mockResolvedValueOnce(undefined);

    expect(useStore.getState().deleteProject(project.id)).toBe(true);
    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));
    expect(api.deleteProject).toHaveBeenCalledTimes(1);
  });

  it.each([400, 500])("preserves HTTP %s handling without retrying deletion", async (status) => {
    const project = prepareProjectDelete();
    api.deleteProject.mockRejectedValueOnce(new MockApiError(status, "server error"));

    expect(useStore.getState().deleteProject(project.id)).toBe(true);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    await useStore.getState().flushOutbox();
    expect(api.deleteProject).toHaveBeenCalledTimes(1);
    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);
  });
});

const deletableEquipment = initialState.catalog[0]!;
const otherActiveEquipment = initialState.catalog[1]!;
const otherDeletedEquipment = {
  ...initialState.catalog[2]!,
  deletedAt: Date.now() - 60_000,
  deletedBy: "server@example.test",
};

function prepareEquipmentDelete() {
  const settings = useStore.getState().settings;
  useStore.setState({
    settings: { ...settings, apiBaseUrl: "https://api.example.test" },
    outbox: [],
  });
}

describe("SYNC-004: pending equipment deletion hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it("keeps a pending deletion out of active catalog and preserves its tombstone", async () => {
    prepareEquipmentDelete();
    api.deleteEquipment
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(undefined);

    useStore.getState().deleteEquipment(deletableEquipment.id);
    await vi.waitFor(() => expect(api.deleteEquipment).toHaveBeenCalledTimes(1));
    const localTombstone = useStore.getState().deletedCatalog.find((item) => item.id === deletableEquipment.id)!;
    expect(useStore.getState().catalog.some((item) => item.id === deletableEquipment.id)).toBe(false);
    expect(localTombstone).toBeDefined();
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.delete", eqId: deletableEquipment.id }),
    ]);

    mockHydration([deletableEquipment, otherActiveEquipment], [], [otherDeletedEquipment]);
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().catalog.some((item) => item.id === deletableEquipment.id)).toBe(false);
    expect(useStore.getState().catalog).toContainEqual(otherActiveEquipment);
    expect(useStore.getState().deletedCatalog).toContainEqual(localTombstone);
    expect(useStore.getState().deletedCatalog).toContainEqual(otherDeletedEquipment);
    await vi.waitFor(() => expect(api.deleteEquipment).toHaveBeenCalledTimes(2));
    expect(useStore.getState().outbox).toEqual([]);

    const serverTombstone = {
      ...localTombstone,
      deletedAt: localTombstone.deletedAt + 1,
      deletedBy: "server@example.test",
    };
    mockHydration([otherActiveEquipment], [], [serverTombstone, otherDeletedEquipment]);
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().catalog.some((item) => item.id === deletableEquipment.id)).toBe(false);
    expect(useStore.getState().deletedCatalog.filter((item) => item.id === deletableEquipment.id)).toEqual([
      serverTombstone,
    ]);
  });

  it("lets a pending delete supersede an upsert for the same equipment", async () => {
    prepareEquipment();
    api.putEquipment.mockRejectedValueOnce(new TypeError("network unavailable"));
    api.deleteEquipment.mockRejectedValueOnce(new TypeError("network unavailable"));

    useStore.getState().upsertEquipment(equipment);
    await vi.waitFor(() => expect(api.putEquipment).toHaveBeenCalledTimes(1));
    useStore.getState().deleteEquipment(equipment.id);
    await vi.waitFor(() => expect(api.deleteEquipment).toHaveBeenCalledTimes(1));

    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.delete", eqId: equipment.id }),
    ]);
    expect(useStore.getState().catalog.some((item) => item.id === equipment.id)).toBe(false);
  });

  it("keeps an ordinary successful deletion in trash and clears its queue", async () => {
    prepareEquipmentDelete();
    api.deleteEquipment.mockResolvedValueOnce(undefined);

    useStore.getState().deleteEquipment(deletableEquipment.id);
    expect(useStore.getState().catalog.some((item) => item.id === deletableEquipment.id)).toBe(false);
    expect(useStore.getState().deletedCatalog.some((item) => item.id === deletableEquipment.id)).toBe(true);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));
    expect(api.deleteEquipment).toHaveBeenCalledTimes(1);
  });

  it.each([400, 500])("preserves HTTP %s handling without retrying deletion", async (status) => {
    prepareEquipmentDelete();
    api.deleteEquipment.mockRejectedValueOnce(new MockApiError(status, "server error"));

    useStore.getState().deleteEquipment(deletableEquipment.id);
    await vi.waitFor(() => expect(useStore.getState().outbox).toEqual([]));

    await useStore.getState().flushOutbox();
    expect(api.deleteEquipment).toHaveBeenCalledTimes(1);
    expect(useStore.getState().catalog.some((item) => item.id === deletableEquipment.id)).toBe(false);
    expect(useStore.getState().deletedCatalog.some((item) => item.id === deletableEquipment.id)).toBe(true);
  });
});
