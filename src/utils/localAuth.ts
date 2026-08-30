import type { AuthUser } from "../api/client";
import { genId } from "../utils";
import type { Role } from "./roles";

/* ============================================================
   ЛОКАЛЬНАЯ АУТЕНТИФИКАЦИЯ (режим без C#-бэкенда).
   Пользователи и роли хранятся в localStorage["tkp-users"].
   Контракты повторяют серверные /api/auth/*, поэтому store.ts
   переключает режимы одной точкой (apiBaseUrl).

   Ограничение режима (честно, для коммерческой версии):
   пароли хранятся как SHA-256-хэши — это не замена серверной
   ASP.NET Identity (bcrypt, lockout, политики паролей). Для
   боевой эксплуатации — только серверный режим.
   ============================================================ */

const LS_USERS = "tkp-users";
const LS_SESSION = "tkp-session";

export interface LocalUser extends AuthUser {
  passwordHash: string;
  createdAt: number;
}

export const ADMIN_SEED = { email: "admin@tkp.local", password: "Admin#12345" };

/* SHA-256 доступен в любом современном браузере (crypto.subtle). */
export async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(`tkp::${pw}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readUsers(): LocalUser[] {
  try {
    const raw = localStorage.getItem(LS_USERS);
    return raw ? (JSON.parse(raw) as LocalUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: LocalUser[]) {
  localStorage.setItem(LS_USERS, JSON.stringify(users));
}

const toAuthUser = (u: LocalUser): AuthUser => ({
  id: u.id, email: u.email, fullName: u.fullName, position: u.position, roles: u.roles,
});

/** При первом запуске создаёт администратора (идемпотентно, как серверный сид). */
export async function ensureLocalAdmin(): Promise<void> {
  const users = readUsers();
  if (users.some((u) => u.email.toLowerCase() === ADMIN_SEED.email)) return;
  users.push({
    id: genId("usr"),
    email: ADMIN_SEED.email,
    fullName: "Администратор",
    position: "локальный режим",
    roles: ["admin"],
    passwordHash: await hashPassword(ADMIN_SEED.password),
    createdAt: Date.now(),
  });
  writeUsers(users);
}

export async function localRegister(
  email: string, password: string, fullName: string, role: Role
): Promise<AuthUser> {
  const users = readUsers();
  const mail = email.trim().toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === mail))
    throw new Error("Пользователь с таким e-mail уже существует");
  /* политика один в один с серверной (Identity в AuthExtensions.cs): 6+ символов и цифра */
  if (password.length < 6 || !/\d/.test(password))
    throw new Error("Пароль — минимум 6 символов и хотя бы одна цифра");
  const u: LocalUser = {
    id: genId("usr"), email: mail, fullName: fullName.trim(), position: "локальный режим",
    roles: [role], passwordHash: await hashPassword(password), createdAt: Date.now(),
  };
  writeUsers([...users, u]);
  return toAuthUser(u);
}

export async function localLogin(email: string, password: string): Promise<AuthUser> {
  const users = readUsers();
  const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  if (!u || u.passwordHash !== (await hashPassword(password)))
    throw new Error("Неверный e-mail или пароль");
  localStorage.setItem(LS_SESSION, u.id);
  return toAuthUser(u);
}

/** Восстановление сессии по сохранённому id (аналог /api/auth/me). */
export function localMe(): AuthUser | null {
  const id = localStorage.getItem(LS_SESSION);
  if (!id) return null;
  const u = readUsers().find((x) => x.id === id);
  return u ? toAuthUser(u) : null;
}

export function localLogout(): void {
  localStorage.removeItem(LS_SESSION);
}

export async function localListUsers(): Promise<AuthUser[]> {
  await ensureLocalAdmin();
  return readUsers().map(toAuthUser).sort((a, b) => a.email.localeCompare(b.email, "ru"));
}

export async function localSetUserRole(id: string, role: Role): Promise<void> {
  const users = readUsers();
  const u = users.find((x) => x.id === id);
  if (!u) throw new Error("Пользователь не найден");
  /* та же защита, что на сервере (Rights.LastAdminDeny): последнего админа
     разжаловать нельзя — иначе локальная система останется без управления */
  const admins = users.filter((x) => x.roles.includes("admin")).length;
  if (u.roles.includes("admin") && role !== "admin" && admins <= 1)
    throw new Error(
      "Нельзя снять роль администратора с последнего администратора — сначала назначьте админом кого-то ещё"
    );
  u.roles = [role];
  writeUsers(users);
}
