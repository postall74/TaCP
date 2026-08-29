import { describe, it, expect } from "vitest";
import type { AuthUser } from "../api/client";
import { can, currentRole, denyReason } from "./roles";

/* ============================================================
   ТЕСТЫ МАТРИЦЫ ПРАВ (roles.ts) — чистые функции, без localStorage.
   ============================================================ */

const u = (roles: string[]): AuthUser => ({
  id: "u1", email: "x@y.ru", fullName: "Тест", position: "", roles,
});

describe("currentRole", () => {
  it("без профиля — admin (локальный режим)", () => {
    expect(currentRole(null)).toBe("admin");
  });
  it("приоритет: admin > manager > engineer", () => {
    expect(currentRole(u(["admin", "engineer"]))).toBe("admin");
    expect(currentRole(u(["manager"]))).toBe("manager");
    expect(currentRole(u(["engineer"]))).toBe("engineer");
    expect(currentRole(u([]))).toBe("engineer"); // пусто → инженер
    expect(currentRole(u(["неизвестная"]))).toBe("engineer");
  });
});

describe("can: инженер", () => {
  const eng = u(["engineer"]);
  it("может создавать/редактировать/дублировать и вести справочник", () => {
    expect(can(eng, "project.create")).toBe(true);
    expect(can(eng, "project.edit")).toBe(true);
    expect(can(eng, "project.duplicate")).toBe(true);
    expect(can(eng, "status.workflow")).toBe(true);
    expect(can(eng, "catalog.edit")).toBe(true);
  });
  it("не может удалять, решать исход и управлять конфигами", () => {
    expect(can(eng, "project.delete")).toBe(false);
    expect(can(eng, "status.decide")).toBe(false);
    expect(can(eng, "rates.edit")).toBe(false);
    expect(can(eng, "settings.edit")).toBe(false);
    expect(can(eng, "users.manage")).toBe(false);
  });
});

describe("can: менеджер", () => {
  const mgr = u(["manager"]);
  it("удаляет и решает исход, но без конфигов и пользователей", () => {
    expect(can(mgr, "project.delete")).toBe(true);
    expect(can(mgr, "status.decide")).toBe(true);
    expect(can(mgr, "rates.edit")).toBe(false);
    expect(can(mgr, "users.manage")).toBe(false);
  });
});

describe("can: админ", () => {
  const adm = u(["admin"]);
  it("полный доступ", () => {
    (["project.delete", "status.decide", "rates.edit", "settings.edit", "users.manage"] as const)
      .forEach((p) => expect(can(adm, p)).toBe(true));
  });
});

describe("denyReason", () => {
  it("объясняет отказ с указанием роли", () => {
    expect(denyReason(u(["engineer"]), "project.delete")).toContain("Инженер");
    expect(denyReason(u(["manager"]), "users.manage")).toContain("администратор");
  });
});
