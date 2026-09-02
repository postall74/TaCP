import type { CabinetTemplate, DeletedEquipment, Equipment, Project, Rates, Settings } from "../types";

/* ============================================================
   REST-КЛИЕНТ для C#-бэкенда (backend/TkpApi, ASP.NET Core).
   Контракты повторяют Models.cs один в один. Пока apiBaseUrl пуст,
   store.ts работает в локальном режиме — этот модуль не вызывается.
   ============================================================ */

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

/* ---------------- JWT-токен (localStorage) ---------------- */
const TOKEN_KEY = "tkp-jwt";
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY);

/** Профиль пользователя — DTO из /api/auth/login и /api/auth/me. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  position: string;
  /** Контактный телефон; у старых локальных записей может отсутствовать. */
  phone?: string;
  roles: string[];
}

/** Правка профиля (своего — PUT /api/auth/me, чужого — PUT /api/auth/users/{id}). */
export interface ProfilePatch {
  fullName?: string;
  position?: string;
  phone?: string;
}

/** Причина ошибки из тела ответа: { errors: [] } (регистрация), { detail } / { title }
    (RFC 7807 — отказы матрицы прав), массив строк, plain-text. Иначе — статус. */
async function errorOf(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status} ${res.statusText}`;
  let text: string;
  try {
    text = await res.text();
  } catch {
    return fallback;
  }
  if (!text) return fallback;
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body?.errors)) return body.errors.join("; ") || fallback;
    if (typeof body?.detail === "string" && body.detail) return body.detail;
    if (typeof body?.title === "string" && body.title) return body.title;
    if (Array.isArray(body)) return body.filter((x: unknown) => typeof x === "string").join("; ") || fallback;
  } catch {
    if (text.length <= 160) return text; // сервер вернул plain-text причину
  }
  return fallback;
}

async function req<T>(base: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const token = getToken();
  try {
    const res = await fetch(base.replace(/\/+$/, "") + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ApiError(res.status, await errorOf(res));
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Реквизиты компании — серверное DTO (CompanySettings в Models.cs). */
export interface CompanyDto {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  requisites: string;
  manager: string;
  executor: string;
}

export const toCompany = (s: Settings): CompanyDto => ({
  companyName: s.companyName,
  tagline: s.tagline,
  address: s.address,
  phone: s.phone,
  email: s.email,
  requisites: s.requisites,
  manager: s.manager,
  executor: s.executor,
});

/** Клиент API: по одному методу на эндпоинт Program.cs. */
export const restApi = (base: string) => ({
  /* проверка доступности: ОТКРЫТЫЙ эндпоинт (без авторизации) — иначе
     «Проверить» всегда давал 401 до входа. См. Program.cs: /api/health */
  ping: () => req<{ status: string }>(base, "/api/health", undefined, 3000),

  /* аутентификация (JWT) */
  login: (email: string, password: string) =>
    req<{ token: string; expiresAt: string; user: AuthUser }>(base, "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string, fullName: string, role: string) =>
    req<AuthUser>(base, "/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, fullName, position: "", role }),
    }),
  me: () => req<AuthUser>(base, "/api/auth/me"),
  /* свой профиль: смена телефона/ФИО доступна каждому сотруднику */
  updateProfile: (p: ProfilePatch) =>
    req<AuthUser>(base, "/api/auth/me", { method: "PUT", body: JSON.stringify(p) }),
  /* правка профиля любого пользователя — админ на странице «Пользователи» */
  putUser: (id: string, p: ProfilePatch) =>
    req<AuthUser>(base, `/api/auth/users/${id}`, { method: "PUT", body: JSON.stringify(p) }),

  /* пользователи (только админ) */
  users: () => req<AuthUser[]>(base, "/api/auth/users"),
  setUserRole: (id: string, role: string) =>
    req<AuthUser>(base, `/api/auth/users/${id}/role`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    }),

  /* проекты */
  projects: () => req<Project[]>(base, "/api/projects"),
  createProject: (p: Project) => req<Project>(base, "/api/projects", { method: "POST", body: JSON.stringify(p) }),
  putProject: (p: Project) => req<Project>(base, `/api/projects/${p.id}`, { method: "PUT", body: JSON.stringify(p) }),
  deleteProject: (id: string) => req<void>(base, `/api/projects/${id}`, { method: "DELETE" }),
  addCabinetsBulk: (pid: string, cabs: Project["cabinets"]) =>
    req<Project["cabinets"]>(base, `/api/projects/${pid}/cabinets`, { method: "POST", body: JSON.stringify(cabs) }),
  saveVersionRemote: (pid: string, label: string) =>
    req<unknown>(base, `/api/projects/${pid}/versions?label=${encodeURIComponent(label)}`, { method: "POST" }),

  /* справочник */
  catalog: () => req<Equipment[]>(base, "/api/catalog"),
  createEquipment: (e: Equipment) => req<Equipment>(base, "/api/catalog", { method: "POST", body: JSON.stringify(e) }),
  putEquipment: (e: Equipment) => req<Equipment>(base, `/api/catalog/${e.id}`, { method: "PUT", body: JSON.stringify(e) }),
  deleteEquipment: (id: string) => req<void>(base, `/api/catalog/${id}`, { method: "DELETE" }),
  /* «корзина» справочника: удалённые позиции (хранятся 90 дней) */
  deletedEquipment: () => req<DeletedEquipment[]>(base, "/api/catalog/deleted"),

  /* шаблоны шкафов (конфигуратор, Б.1) */
  templates: () => req<CabinetTemplate[]>(base, "/api/cabinet-templates"),
  putTemplate: (t: CabinetTemplate) =>
    req<CabinetTemplate>(base, `/api/cabinet-templates/${t.id}`, { method: "PUT", body: JSON.stringify(t) }),
  deleteTemplate: (id: string) => req<void>(base, `/api/cabinet-templates/${id}`, { method: "DELETE" }),
  importCsv: (csv: string) =>
    req<{ added: number; updated: number; skipped: number }>(base, "/api/catalog/import", {
      method: "POST",
      body: csv,
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    }),

  /* тарифы и реквизиты */
  rates: () => req<Rates>(base, "/api/rates"),
  putRates: (r: Rates) => req<Rates>(base, "/api/rates", { method: "PUT", body: JSON.stringify(r) }),
  company: () => req<CompanyDto>(base, "/api/settings"),
  putCompany: (c: CompanyDto) => req<CompanyDto>(base, "/api/settings", { method: "PUT", body: JSON.stringify(c) }),
});

export type RestApi = ReturnType<typeof restApi>;
