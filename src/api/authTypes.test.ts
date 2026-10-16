import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { restApi, type AuthUser, type RegisterResponse } from "./client";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe("AUTH-TYPES-001: auth-v2 response shapes", () => {
  it("models login expiry as unix milliseconds and preserves the full user DTO", async () => {
    const user: AuthUser = {
      id: "user-1", email: "engineer@example.test", fullName: "Тестовый инженер",
      position: "Инженер", phone: "+70000000000", roles: ["engineer"],
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      token: "signed-jwt", expiresAt: 1790148600000, user,
    })));

    const response = await restApi("http://api.test").login(user.email, "password1");

    expectTypeOf(response.expiresAt).toEqualTypeOf<number>();
    expect(response.expiresAt).toBe(1790148600000);
    expect(response.user).toEqual(user);
  });

  it("models register as the short auth-v2 DTO and sends the accepted request shape", async () => {
    const fixture: RegisterResponse = {
      id: "user-2", email: "engineer@example.test", fullName: "Тестовый инженер", role: "engineer",
    };
    let requestBody: unknown;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json(fixture);
    }));

    const response = await restApi("http://api.test").register(
      fixture.email, "password1", fixture.fullName, fixture.role,
    );

    expectTypeOf(response).toEqualTypeOf<RegisterResponse>();
    expect(response).toEqual(fixture);
    expect(response).not.toHaveProperty("roles");
    expect(requestBody).toEqual({
      email: fixture.email, password: "password1", fullName: fixture.fullName,
      position: "", role: fixture.role,
    });
  });
});
