import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { restApi, setToken, type AuthUser, type RegisterResponse } from "./client";

const storage = new Map<string, string>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("auth-v2 REST client wire contract", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.restoreAllMocks();
  });

  it("maps numeric login expiry and keeps its bearer for /auth/me", async () => {
    const user: AuthUser = {
      id: "u-admin",
      email: "admin@example.test",
      fullName: "Admin",
      position: "Lead",
      phone: "+70000000000",
      roles: ["admin"],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ token: "jwt-login", expiresAt: 1_800_000_000, user }))
      .mockResolvedValueOnce(json(user));
    vi.stubGlobal("fetch", fetchMock);

    const api = restApi("https://api.example.test/");
    const login = await api.login("admin@example.test", "Password1");
    expectTypeOf(login.expiresAt).toEqualTypeOf<number>();
    expect(login).toEqual({ token: "jwt-login", expiresAt: 1_800_000_000, user });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.test/api/auth/login");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      email: "admin@example.test",
      password: "Password1",
    });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBeUndefined();

    setToken(login.token);
    await api.me();
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.test/api/auth/me");
    expect((fetchMock.mock.calls[1][1]?.headers as Record<string, string>).Authorization).toBe("Bearer jwt-login");
  });

  it("maps the compact register response and preserves bearer for register then users", async () => {
    const registered: RegisterResponse = {
      id: "u-engineer",
      email: "engineer@example.test",
      fullName: "Engineer",
      role: "engineer",
    };
    const listed: AuthUser = {
      ...registered,
      position: "",
      roles: [registered.role],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(registered))
      .mockResolvedValueOnce(json([listed]));
    vi.stubGlobal("fetch", fetchMock);
    setToken("jwt-admin");

    const api = restApi("https://api.example.test");
    const result = await api.register(
      "engineer@example.test",
      "Engineer1",
      "Engineer",
      "engineer",
    );
    expectTypeOf(result).toEqualTypeOf<RegisterResponse>();
    expect(result).toEqual(registered);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      email: "engineer@example.test",
      password: "Engineer1",
      fullName: "Engineer",
      position: "",
      role: "engineer",
    });

    const users = await api.users();
    expect(users).toEqual([listed]);
    for (const call of fetchMock.mock.calls) {
      expect((call[1]?.headers as Record<string, string>).Authorization).toBe("Bearer jwt-admin");
    }
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.test/api/auth/users");
  });
});
