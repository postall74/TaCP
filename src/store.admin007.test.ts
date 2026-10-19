import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
};

const original = {
  id: "user-1",
  email: "old@example.test",
  fullName: "Old Name",
  position: "Engineer",
  phone: "+70000000000",
  roles: ["engineer"],
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

describe("ADMIN-007: confirmed administrative email update", () => {
  it("sends trimmed email and applies the confirmed server DTO", async () => {
    let sent: Record<string, unknown> | undefined;
    const confirmed = { ...original, email: "new@example.test", fullName: "New Name" };
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return Response.json(confirmed);
    }));

    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      user: original,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    const saved = await useStore.getState().updateUserProfile(original.id, {
      email: "  new@example.test  ", fullName: "New Name",
    });

    expect(sent).toEqual({ email: "new@example.test", fullName: "New Name" });
    expect(saved).toEqual(confirmed);
    expect(useStore.getState().user).toEqual(confirmed);
  });

  it("rejects a legacy 200 response that retains the old email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(original)));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      user: original,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://legacy-api.test" },
      toasts: [],
    });

    await expect(useStore.getState().updateUserProfile(original.id, {
      email: "new@example.test", fullName: "Must not apply",
    })).rejects.toMatchObject({
      status: 409,
      message: "Сервер не подтвердил изменение email. Обновите backend и повторите сохранение.",
    });
    expect(useStore.getState().user).toEqual(original);
    expect(useStore.getState().toasts.some((toast) => toast.kind === "ok")).toBe(false);
  });

  it("keeps confirmed state when the API rejects the update", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(
      { errors: ["Пользователь с таким e-mail уже существует"] }, { status: 400 },
    )));
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({
      user: original,
      settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "http://api.test" },
      toasts: [],
    });

    await expect(useStore.getState().updateUserProfile(original.id, {
      email: "duplicate@example.test", fullName: "Must not apply",
    })).rejects.toMatchObject({ status: 400, message: "Пользователь с таким e-mail уже существует" });
    expect(useStore.getState().user).toEqual(original);
  });

  it("updates the current user from local storage in local mode", async () => {
    memory.set("tkp-users", JSON.stringify([{
      ...original, passwordHash: "unused", createdAt: 1,
    }]));
    memory.set("tkp-session", original.id);
    const { useStore, DEFAULT_SETTINGS } = await import("./store");
    useStore.setState({ user: original, settings: { ...DEFAULT_SETTINGS, apiBaseUrl: "" } });

    const saved = await useStore.getState().updateUserProfile(original.id, {
      email: " local-new@example.test ", fullName: "Local Name",
    });

    expect(saved.email).toBe("local-new@example.test");
    expect(saved.fullName).toBe("Local Name");
    expect(useStore.getState().user).toEqual(saved);
    expect(JSON.parse(memory.get("tkp-users")!)[0].email).toBe("local-new@example.test");
  });
});
