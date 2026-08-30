import type { AuthUser } from "../api/client";

/* ============================================================
   МАТРИЦА ПРАВ: роль → разрешённые действия.
   Единый источник правды для UI (кнопки гаснут) и store.ts
   (мутации блокируются с тостом). Зеркало на сервере —
   backend/TkpApi/Rights.cs (те же действия, приоритет ролей и
   тексты отказов; отказ — 403 + причина) поверх политик
   AdminOnly/Staff из AuthExtensions.cs.

   Инженер  — собирает и считает ТКП, ведёт справочник;
   Менеджер — воронка: отправляет, выигрывает/проигрывает, удаляет;
   Админ    — всё + пользователи, тарифы, реквизиты.
   Локальный режим (user=null) — права администратора (однопользовательская разработка).
   ============================================================ */

export type Role = "admin" | "manager" | "engineer";

export type Perm =
  | "project.create"   // создавать ТКП
  | "project.edit"     // менять структуру, состав, параметры
  | "project.delete"   // удалять ТКП (в т.ч. архивные)
  | "project.duplicate"// дублировать
  | "status.workflow"  // черновик → на расчёте → отправлено
  | "status.decide"    // отправлено → выиграно/проиграно (и обратно)
  | "catalog.edit"     // CRUD справочника + импорт прайсов
  | "rates.edit"       // тарифы нормо-часов
  | "settings.edit"    // реквизиты компании
  | "users.manage";    // страница пользователей

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  engineer: "Инженер",
};

const ADMIN: Perm[] = [
  "project.create", "project.edit", "project.delete", "project.duplicate",
  "status.workflow", "status.decide",
  "catalog.edit", "rates.edit", "settings.edit", "users.manage",
];
const MANAGER: Perm[] = [
  "project.create", "project.edit", "project.delete", "project.duplicate",
  "status.workflow", "status.decide",
  "catalog.edit",
];
const ENGINEER: Perm[] = [
  "project.create", "project.edit", "project.duplicate",
  "status.workflow",
  "catalog.edit",
];

const MATRIX: Record<Role, Perm[]> = { admin: ADMIN, manager: MANAGER, engineer: ENGINEER };

/** Текущая роль: из профиля, иначе admin (локальный режим без сервера). */
export const currentRole = (user: AuthUser | null): Role => {
  if (!user) return "admin";
  const r = user.roles?.map((x) => x.toLowerCase());
  if (r?.includes("admin")) return "admin";
  if (r?.includes("manager")) return "manager";
  return "engineer";
};

export const can = (user: AuthUser | null, perm: Perm): boolean =>
  MATRIX[currentRole(user)].includes(perm);

/** Человекочитаемое объяснение отказа — для тостов и подсказок. */
export const denyReason = (user: AuthUser | null, perm: Perm): string => {
  const role = ROLE_LABEL[currentRole(user)];
  switch (perm) {
    case "project.delete":
      return `Удаление ТКП доступно менеджеру и администратору (вы — ${role})`;
    case "status.decide":
      return `Решение «выиграно/проиграно» принимает менеджер или администратор (вы — ${role})`;
    case "rates.edit":
    case "settings.edit":
    case "users.manage":
      return `Раздел доступен только администратору (вы — ${role})`;
    default:
      return `Недостаточно прав (вы — ${role})`;
  }
};

/** Может ли роль менять статус НА указанный (для подписей кнопок). */
export const canMoveTo = (
  user: AuthUser | null,
  to: "calc" | "sent" | "won" | "lost" | "draft"
): boolean => (to === "won" || to === "lost" ? can(user, "status.decide") : can(user, "status.workflow"));
