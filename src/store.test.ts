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
  putRates: vi.fn(),
  putCompany: vi.fn(),
  deleteEquipment: vi.fn(),
  restoreEquipment: vi.fn(),
  importCsv: vi.fn(),
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
  toCompany: vi.fn((settings) => ({
    companyName: settings.companyName,
    tagline: settings.tagline,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    requisites: settings.requisites,
    manager: settings.manager,
    executor: settings.executor,
  })),
  restApi: vi.fn(() => api),
}));

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
});

const { DEFAULT_COMPANY_SETTINGS, DEFAULT_SETTINGS, useStore } = await import("./store");
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

    await expect(useStore.getState().upsertEquipment(equipment)).resolves.toBe("queued");
    expect(api.putEquipment).toHaveBeenCalledTimes(1);
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

    const request = useStore.getState().upsertEquipment(equipment);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: equipment.id }),
    ]);

    await expect(request).resolves.toBe("synced");
    expect(useStore.getState().outbox).toEqual([]);
  });

  it.each([400, 500])("removes an HTTP %s failure without retrying it", async (status) => {
    prepareEquipment();
    api.putEquipment.mockRejectedValueOnce(new MockApiError(status, "server error"));

    await expect(useStore.getState().upsertEquipment(equipment)).rejects.toBeInstanceOf(MockApiError);
    expect(useStore.getState().outbox).toEqual([]);

    await useStore.getState().flushOutbox();
    expect(api.putEquipment).toHaveBeenCalledTimes(1);
  });

  it("retains the existing rollback behavior for an HTTP 409 conflict", async () => {
    prepareEquipment();
    api.putEquipment.mockRejectedValueOnce(new MockApiError(409, "duplicate"));

    await expect(useStore.getState().upsertEquipment(equipment)).rejects.toBeInstanceOf(MockApiError);
    expect(useStore.getState().outbox).toEqual([]);

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

    await expect(useStore.getState().upsertEquipment(equipment)).resolves.toBe("queued");
    expect(api.putEquipment).toHaveBeenCalledTimes(1);
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

describe("SYNC-005: project deletion supersedes pending upsert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout,
      setTimeout: globalThis.setTimeout,
    });
  });

  it("replaces a failed update with one delete and flushes without PUT or POST", async () => {
    const project = prepareProjectDelete();
    const otherProject = {
      ...project,
      id: "sync-005-other-project",
      number: "ТКП-SYNC-005",
      title: "Other server project",
    };
    api.putProject.mockRejectedValueOnce(new TypeError("network unavailable"));

    useStore.getState().updateProject(project.id, { title: "Unsynced update" });
    await vi.waitFor(() => expect(api.putProject).toHaveBeenCalledTimes(1), { timeout: 1_500 });
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.upsert", id: project.id }),
    ]);

    api.deleteProject.mockRejectedValueOnce(new TypeError("network unavailable"));
    expect(useStore.getState().deleteProject(project.id)).toBe(true);
    await vi.waitFor(() => expect(api.deleteProject).toHaveBeenCalledTimes(1));
    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "project.delete", id: project.id }),
    ]);

    api.putProject.mockClear();
    api.createProject.mockClear();
    api.deleteProject.mockClear();
    api.deleteProject.mockResolvedValueOnce(undefined);
    mockHydration(initialState.catalog, [project, otherProject]);
    await useStore.getState().hydrateFromApi();

    expect(useStore.getState().projects.some((item) => item.id === project.id)).toBe(false);
    expect(useStore.getState().projects).toContainEqual(otherProject);
    await vi.waitFor(() => expect(api.deleteProject).toHaveBeenCalledTimes(1));
    expect(api.putProject).not.toHaveBeenCalled();
    expect(api.createProject).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([]);

    mockHydration(initialState.catalog, [otherProject]);
    await useStore.getState().hydrateFromApi();
    expect(useStore.getState().projects).toEqual([otherProject]);
  });
});

const restoreTarget = {
  ...initialState.catalog[0]!,
  deletedAt: Date.now() - 30_000,
  deletedBy: "admin@example.test",
};
const restoreActiveNeighbor = initialState.catalog[1]!;
const restoreDeletedNeighbor = {
  ...initialState.catalog[2]!,
  deletedAt: Date.now() - 60_000,
  deletedBy: "server@example.test",
};

function prepareRestore(remote: boolean) {
  const settings = useStore.getState().settings;
  useStore.setState({
    catalog: [restoreActiveNeighbor],
    deletedCatalog: [restoreDeletedNeighbor, restoreTarget],
    settings: { ...settings, apiBaseUrl: remote ? "https://api.example.test" : "" },
    outbox: [],
    toasts: [],
  });
}

describe("SYNC-006: catalog restore rollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it.each([
    ["network", new TypeError("network unavailable")],
    ["HTTP 409", new MockApiError(409, "conflict")],
    ["HTTP 500", new MockApiError(500, "server error")],
  ])("rolls back and rejects on %s failure", async (_label, error) => {
    prepareRestore(true);
    api.restoreEquipment.mockRejectedValueOnce(error);

    await expect(useStore.getState().restoreEquipment(restoreTarget.id)).rejects.toBe(error);

    expect(useStore.getState().catalog).toEqual([restoreActiveNeighbor]);
    expect(useStore.getState().deletedCatalog).toEqual([restoreDeletedNeighbor, restoreTarget]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
    expect(api.restoreEquipment).toHaveBeenCalledTimes(1);
  });

  it("moves the item exactly once after a successful remote restore", async () => {
    prepareRestore(true);
    api.restoreEquipment.mockResolvedValueOnce(undefined);

    await useStore.getState().restoreEquipment(restoreTarget.id);

    expect(useStore.getState().catalog).toEqual([
      restoreActiveNeighbor,
      { ...restoreTarget, deletedAt: undefined, deletedBy: undefined },
    ]);
    expect(useStore.getState().catalog.filter((item) => item.id === restoreTarget.id)).toHaveLength(1);
    expect(useStore.getState().deletedCatalog).toEqual([restoreDeletedNeighbor]);
    expect(api.restoreEquipment).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing successful local restore behavior", async () => {
    prepareRestore(false);

    await useStore.getState().restoreEquipment(restoreTarget.id);

    expect(useStore.getState().catalog).toEqual([
      restoreActiveNeighbor,
      { ...restoreTarget, deletedAt: undefined, deletedBy: undefined },
    ]);
    expect(useStore.getState().deletedCatalog).toEqual([restoreDeletedNeighbor]);
    expect(api.restoreEquipment).not.toHaveBeenCalled();
  });
});

const importExisting = initialState.catalog[0]!;
const importNeighbor = initialState.catalog[1]!;
const importItems = [
  {
    ...importExisting,
    name: "Updated by import",
    purchase: importExisting.purchase + 100,
  },
  {
    ...importNeighbor,
    sku: "SYNC-007-NEW",
    name: "New imported equipment",
  },
].map(({ id: _id, ...item }) => item);
const importCsv = "sku;name\nSYNC-007-NEW;New imported equipment";

function prepareImport(remote: boolean) {
  const settings = useStore.getState().settings;
  useStore.setState({
    catalog: [importExisting, importNeighbor],
    settings: { ...settings, apiBaseUrl: remote ? "https://api.example.test" : "" },
    outbox: [],
    toasts: [],
  });
}

describe("SYNC-007: confirmed catalog import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it.each([
    ["network", new TypeError("network unavailable")],
    ["HTTP 400", new MockApiError(400, "invalid CSV")],
    ["HTTP 500", new MockApiError(500, "server error")],
  ])("rolls back and rejects on %s failure", async (_label, error) => {
    prepareImport(true);
    api.importCsv.mockRejectedValueOnce(error);

    await expect(useStore.getState().importEquipment(importItems, importCsv)).rejects.toBe(error);

    expect(useStore.getState().catalog).toEqual([importExisting, importNeighbor]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
    expect(api.importCsv).toHaveBeenCalledWith(importCsv);
  });

  it("applies a successful remote import once and supports a repeat import", async () => {
    prepareImport(true);
    api.importCsv.mockResolvedValue({ added: 1, updated: 1, skipped: 0 });

    await expect(useStore.getState().importEquipment(importItems, importCsv)).resolves.toBe(1);
    expect(useStore.getState().catalog.filter((item) => item.sku === "SYNC-007-NEW")).toHaveLength(1);
    expect(useStore.getState().catalog.find((item) => item.id === importExisting.id)).toEqual(
      expect.objectContaining({ name: "Updated by import", purchase: importExisting.purchase + 100 }),
    );

    await expect(useStore.getState().importEquipment(importItems, importCsv)).resolves.toBe(0);
    expect(useStore.getState().catalog.filter((item) => item.sku === "SYNC-007-NEW")).toHaveLength(1);
    expect(api.importCsv).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing local import behavior and count", async () => {
    prepareImport(false);

    await expect(useStore.getState().importEquipment(importItems, importCsv)).resolves.toBe(1);

    expect(useStore.getState().catalog.filter((item) => item.sku === "SYNC-007-NEW")).toHaveLength(1);
    expect(useStore.getState().catalog.find((item) => item.id === importExisting.id)).toEqual(
      expect.objectContaining({ name: "Updated by import", purchase: importExisting.purchase + 100 }),
    );
    expect(api.importCsv).not.toHaveBeenCalled();
  });
});

const editOriginal = {
  ...initialState.catalog[0]!,
  id: "sync-008-edited",
  sku: "SYNC-008-A",
  name: "Original equipment",
};
const editNeighbor = {
  ...initialState.catalog[1]!,
  id: "sync-008-neighbor",
  sku: "SYNC-008-B",
  name: "Neighbor equipment",
};
const editRejected = {
  ...editOriginal,
  sku: editNeighbor.sku,
  name: "Rejected edit",
  purchase: editOriginal.purchase + 500,
};
const editCreated = {
  ...editOriginal,
  id: "sync-008-created",
  sku: "SYNC-008-C",
};

function prepareEdit(remote: boolean) {
  const settings = useStore.getState().settings;
  useStore.setState({
    catalog: [editOriginal, editNeighbor],
    settings: { ...settings, apiBaseUrl: remote ? "https://api.example.test" : "" },
    outbox: [],
    toasts: [],
  });
}

describe("SYNC-008: confirmed catalog edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it.each([400, 409, 500])("restores the full previous item after HTTP %s", async (status) => {
    prepareEdit(true);
    const error = new MockApiError(status, "server rejected edit");
    api.putEquipment.mockRejectedValueOnce(error);

    await expect(useStore.getState().upsertEquipment(editRejected)).rejects.toBe(error);

    expect(useStore.getState().catalog).toEqual([editOriginal, editNeighbor]);
    expect(useStore.getState().outbox).toEqual([]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
  });

  it("removes a rejected new item", async () => {
    prepareEdit(true);
    const error = new MockApiError(409, "duplicate SKU");
    api.putEquipment.mockRejectedValueOnce(error);

    await expect(useStore.getState().upsertEquipment(editCreated)).rejects.toBe(error);

    expect(useStore.getState().catalog).toEqual([editOriginal, editNeighbor]);
    expect(useStore.getState().outbox).toEqual([]);
  });

  it("keeps a network edit queued and sends it once after reconnect", async () => {
    prepareEdit(true);
    api.putEquipment.mockRejectedValueOnce(new TypeError("network unavailable"));

    await expect(useStore.getState().upsertEquipment(editRejected)).resolves.toBe("queued");

    expect(useStore.getState().catalog).toEqual([editRejected, editNeighbor]);
    expect(useStore.getState().outbox).toEqual([
      expect.objectContaining({ kind: "equipment.upsert", eqId: editRejected.id }),
    ]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);

    api.putEquipment.mockResolvedValueOnce(editRejected);
    await useStore.getState().flushOutbox();

    expect(api.putEquipment).toHaveBeenCalledTimes(2);
    expect(api.putEquipment).toHaveBeenLastCalledWith(editRejected);
    expect(useStore.getState().outbox).toEqual([]);
  });

  it("applies a successful remote edit once", async () => {
    prepareEdit(true);
    api.putEquipment.mockResolvedValueOnce(editRejected);

    await expect(useStore.getState().upsertEquipment(editRejected)).resolves.toBe("synced");

    expect(useStore.getState().catalog).toEqual([editRejected, editNeighbor]);
    expect(useStore.getState().catalog.filter((item) => item.id === editRejected.id)).toHaveLength(1);
    expect(api.putEquipment).toHaveBeenCalledTimes(1);
    expect(useStore.getState().outbox).toEqual([]);
  });

  it("keeps the existing local edit behavior", async () => {
    prepareEdit(false);

    await expect(useStore.getState().upsertEquipment(editRejected)).resolves.toBe("synced");

    expect(useStore.getState().catalog).toEqual([editRejected, editNeighbor]);
    expect(api.putEquipment).not.toHaveBeenCalled();
    expect(useStore.getState().outbox).toEqual([]);
  });
});

const companyManager = {
  id: "sync-009-manager",
  email: "manager@example.test",
  fullName: "Catalog manager",
  position: "Manager",
  phone: "",
  roles: ["manager"],
};
const confirmedCompany = {
  companyName: "Confirmed company",
  tagline: "Confirmed tagline",
  address: "Confirmed address",
  phone: "+7 900 000-00-00",
  email: "confirmed@example.test",
  requisites: "Confirmed requisites",
  manager: "Confirmed manager",
  executor: "Confirmed executor",
};
const changedCompany = {
  companyName: "Changed company",
  tagline: "Changed tagline",
  address: "Changed address",
  phone: "+7 900 111-11-11",
  email: "changed@example.test",
  requisites: "Changed requisites",
  manager: "Changed manager",
  executor: "Changed executor",
};

function prepareCompanySettings(remote: boolean, role: "admin" | "manager" | "engineer" = "manager") {
  const settings = useStore.getState().settings;
  useStore.setState({
    user: {
      ...companyManager,
      id: `sync-009-${role}`,
      email: `${role}@example.test`,
      roles: [role],
    },
    settings: {
      ...settings,
      ...confirmedCompany,
      theme: "dark",
      rates: { ...settings.rates, design: settings.rates.design + 123 },
      apiBaseUrl: remote ? "https://api.example.test" : "",
      apiOnline: remote ? true : null,
    },
    toasts: [],
  });
}

describe("SYNC-009: confirmed company settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it.each(["manager", "admin"] as const)("sends one confirmed request for %s without writing rates", async (role) => {
    prepareCompanySettings(true, role);
    const serverCompany = { ...changedCompany, companyName: "Server-normalized company" };
    api.putCompany.mockResolvedValueOnce(serverCompany);

    await expect(useStore.getState().saveCompanySettings({
      ...changedCompany,
      apiBaseUrl: "https://api.example.test",
    })).resolves.toBeUndefined();

    expect(api.putCompany).toHaveBeenCalledTimes(1);
    expect(api.putCompany).toHaveBeenCalledWith(changedCompany);
    expect(api.putRates).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual(expect.objectContaining(serverCompany));
  });

  it.each([
    ["network", new TypeError("network unavailable")],
    ["HTTP 400", new MockApiError(400, "invalid company")],
    ["HTTP 403", new MockApiError(403, "forbidden")],
    ["HTTP 500", new MockApiError(500, "server error")],
  ])("keeps confirmed company settings after %s failure", async (_label, error) => {
    prepareCompanySettings(true);
    const before = useStore.getState().settings;
    api.putCompany.mockRejectedValueOnce(error);

    await expect(useStore.getState().saveCompanySettings({
      ...changedCompany,
      apiBaseUrl: before.apiBaseUrl,
    })).rejects.toBe(error);

    expect(useStore.getState().settings).toEqual(before);
    expect(api.putCompany).toHaveBeenCalledTimes(1);
    expect(api.putRates).not.toHaveBeenCalled();
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
    expect(useStore.getState().toasts).toHaveLength(1);
    expect(useStore.getState().toasts[0]).toEqual(expect.objectContaining({
      kind: "err",
      text: error instanceof MockApiError
        ? error.message
        : "Не удалось сохранить реквизиты: сервер недоступен",
    }));
    expect(useStore.getState().toasts[0]?.text).not.toContain("изменения сохранены локально");
  });

  it("rejects an engineer edit before any request", async () => {
    prepareCompanySettings(true, "engineer");
    const before = useStore.getState().settings;

    await expect(useStore.getState().saveCompanySettings({
      ...changedCompany,
      apiBaseUrl: before.apiBaseUrl,
    })).rejects.toThrow("Реквизиты компании заполняют менеджер и администратор");

    expect(useStore.getState().settings).toEqual(before);
    expect(api.putCompany).not.toHaveBeenCalled();
    expect(api.putRates).not.toHaveBeenCalled();
    expect(useStore.getState().toasts).toEqual([
      expect.objectContaining({ kind: "err", text: expect.stringContaining("Инженер") }),
    ]);
  });

  it("resets only company fields and preserves connection, theme, and rates", async () => {
    prepareCompanySettings(true);
    const before = useStore.getState().settings;
    api.putCompany.mockResolvedValueOnce(DEFAULT_COMPANY_SETTINGS);

    await useStore.getState().saveCompanySettings({
      ...DEFAULT_COMPANY_SETTINGS,
      apiBaseUrl: before.apiBaseUrl,
    });

    expect(useStore.getState().settings).toEqual({
      ...before,
      ...DEFAULT_COMPANY_SETTINGS,
      apiOnline: true,
    });
    expect(api.putCompany).toHaveBeenCalledWith(DEFAULT_COMPANY_SETTINGS);
    expect(api.putRates).not.toHaveBeenCalled();
  });

  it("keeps local company save behavior without an API request", async () => {
    prepareCompanySettings(false);
    const before = useStore.getState().settings;

    await expect(useStore.getState().saveCompanySettings({
      ...changedCompany,
      apiBaseUrl: "",
    })).resolves.toBeUndefined();

    expect(useStore.getState().settings).toEqual({
      ...before,
      ...changedCompany,
      apiBaseUrl: "",
      apiOnline: null,
    });
    expect(api.putCompany).not.toHaveBeenCalled();
    expect(api.putRates).not.toHaveBeenCalled();
  });
});

const ratesUser = (role: "admin" | "manager" | "engineer") => ({
  id: `sync-010-${role}`,
  email: `${role}@example.test`,
  fullName: `Rates ${role}`,
  position: role,
  phone: "",
  roles: [role],
});

function prepareRates(remote: boolean, role: "admin" | "manager" | "engineer" = "admin") {
  const settings = useStore.getState().settings;
  useStore.setState({
    user: ratesUser(role),
    settings: {
      ...settings,
      companyName: "Rates company",
      theme: "dark",
      rates: { design: 1100, production: 1200, software: 1300, smr: 1400, pnr: 1500 },
      apiBaseUrl: remote ? "https://api.example.test" : "",
      apiOnline: remote ? true : null,
    },
    toasts: [],
  });
}

describe("SYNC-010: confirmed rates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.clear();
    useStore.setState(initialState, true);
  });

  it("sends one request and applies only the returned rates", async () => {
    prepareRates(true);
    const before = useStore.getState().settings;
    const requested = { design: 2100, production: 2200, software: 2300, smr: 2400, pnr: 2500 };
    const confirmed = { ...requested, software: 2350 };
    api.putRates.mockResolvedValueOnce(confirmed);

    await expect(useStore.getState().saveRates(requested)).resolves.toBeUndefined();

    expect(api.putRates).toHaveBeenCalledTimes(1);
    expect(api.putRates).toHaveBeenCalledWith(requested);
    expect(useStore.getState().settings).toEqual({ ...before, rates: confirmed });
  });

  it.each([
    ["network", new TypeError("network unavailable")],
    ["HTTP 400", new MockApiError(400, "invalid rates")],
    ["HTTP 403", new MockApiError(403, "forbidden")],
    ["HTTP 500", new MockApiError(500, "server error")],
  ])("keeps confirmed rates after %s failure", async (_label, error) => {
    prepareRates(true);
    const before = useStore.getState().settings;
    const requested = { ...before.rates, design: before.rates.design + 500 };
    api.putRates.mockRejectedValueOnce(error);

    await expect(useStore.getState().saveRates(requested)).rejects.toBe(error);

    expect(api.putRates).toHaveBeenCalledTimes(1);
    expect(useStore.getState().settings).toEqual(before);
    expect(useStore.getState().toasts).toEqual([
      expect.objectContaining({
        kind: "err",
        text: error instanceof MockApiError
          ? error.message
          : "Не удалось сохранить тарифы: сервер недоступен",
      }),
    ]);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
  });

  it.each(["manager", "engineer"] as const)("rejects a %s edit before any request", async (role) => {
    prepareRates(true, role);
    const before = useStore.getState().settings;

    await expect(useStore.getState().saveRates({ ...before.rates, design: 9999 }))
      .rejects.toThrow("Раздел доступен только администратору");

    expect(api.putRates).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual(before);
    expect(useStore.getState().toasts).toEqual([
      expect.objectContaining({ kind: "err", text: expect.stringContaining(role === "manager" ? "Менеджер" : "Инженер") }),
    ]);
  });

  it("resets only rates through the confirmed server response", async () => {
    prepareRates(true);
    const before = useStore.getState().settings;
    api.putRates.mockResolvedValueOnce(DEFAULT_SETTINGS.rates);

    await useStore.getState().saveRates(DEFAULT_SETTINGS.rates);

    expect(api.putRates).toHaveBeenCalledWith(DEFAULT_SETTINGS.rates);
    expect(useStore.getState().settings).toEqual({ ...before, rates: DEFAULT_SETTINGS.rates });
  });

  it("keeps local rate saving without an API request", async () => {
    prepareRates(false);
    const before = useStore.getState().settings;
    const requested = { ...before.rates, pnr: before.rates.pnr + 600 };

    await expect(useStore.getState().saveRates(requested)).resolves.toBeUndefined();

    expect(api.putRates).not.toHaveBeenCalled();
    expect(useStore.getState().settings).toEqual({ ...before, rates: requested });
  });
});
