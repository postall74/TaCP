import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import {
  ADMIN_SEED,
  ensureLocalAdmin,
  localDeleteUser,
  localListUsers,
  localLogin,
  localMe,
  localRegister,
} from "./localAuth";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

async function expectStatus(run: () => void, status: number) {
  try {
    run();
    throw new Error("expected ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
  }
}

describe("ADMIN-003 local user deletion", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  it("deletes another user without losing the admin session", async () => {
    await ensureLocalAdmin();
    const actor = await localLogin(ADMIN_SEED.email, ADMIN_SEED.password);
    const target = await localRegister("delete@example.test", "Delete1!", "Delete", "engineer");

    localDeleteUser(target.id);

    expect((await localListUsers()).map((user) => user.id)).not.toContain(target.id);
    expect(localMe()?.id).toBe(actor.id);
  });

  it("returns the contract statuses without writes", async () => {
    await ensureLocalAdmin();
    const admin = (await localListUsers()).find((user) => user.roles.includes("admin"))!;
    const manager = await localRegister("manager@example.test", "Manager1!", "Manager", "manager");
    const target = await localRegister("target@example.test", "Target1!", "Target", "engineer");

    await expectStatus(() => localDeleteUser(target.id), 401);
    await localLogin(manager.email, "Manager1!");
    await expectStatus(() => localDeleteUser(target.id), 403);
    await localLogin(ADMIN_SEED.email, ADMIN_SEED.password);
    await expectStatus(() => localDeleteUser("missing"), 404);
    await expectStatus(() => localDeleteUser(admin.id), 409);

    expect((await localListUsers()).map((user) => user.id)).toEqual(expect.arrayContaining([admin.id, manager.id, target.id]));
  });

  it("permits deleting another admin when an admin remains", async () => {
    await ensureLocalAdmin();
    await localLogin(ADMIN_SEED.email, ADMIN_SEED.password);
    const other = await localRegister("admin2@example.test", "Admin22!", "Admin 2", "admin");
    localDeleteUser(other.id);
    expect((await localListUsers()).some((user) => user.id === other.id)).toBe(false);
    expect(localMe()?.email).toBe(ADMIN_SEED.email);
  });
});
