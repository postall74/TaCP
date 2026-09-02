import type { AuthUser, Role } from "../types";

/* ============================================================
   МАТРИЦА ПРАВ (зеркало серверной Rules в полной версии ТКП·Про).
   user = null (локальный режим) — права администратора.
   ============================================================ */

export type Perm =
  | "catalog.add" | "catalog.edit" | "catalog.delete"
  | "template.edit" | "template.delete";

const ADMIN: Perm[] = ["catalog.add", "catalog.edit", "catalog.delete", "template.edit", "template.delete"];
const MANAGER: Perm[] = ["catalog.add", "catalog.edit", "catalog.delete", "template.edit", "template.delete"];
const ENGINEER: Perm[] = ["catalog.add", "catalog.edit", "template.edit"];

const MATRIX: Record<Role, Perm[]> = { admin: ADMIN, manager: MANAGER, engineer: ENGINEER };

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  engineer: "Инженер",
};

export function currentRole(user: AuthUser | null): Role {
  if (!user) return "admin"; // локальный режим
  if (user.roles.includes("admin")) return "admin";
  if (user.roles.includes("manager")) return "manager";
  return "engineer";
}

export function can(user: AuthUser | null, perm: Perm): boolean {
  return MATRIX[currentRole(user)].includes(perm);
}

export function denyReason(user: AuthUser | null, perm: Perm): string {
  const role = ROLE_LABEL[currentRole(user)];
  switch (perm) {
    case "catalog.delete":
    case "template.delete":
      return `Удаление доступно менеджеру и администратору (вы — ${role})`;
    default:
      return `Недостаточно прав (вы — ${role})`;
  }
}
