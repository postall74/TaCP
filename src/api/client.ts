import type { Equipment, Project, Rates, Settings } from "../types";

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

async function req<T>(base: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(base.replace(/\/+$/, "") + path, {
      headers: { "Content-Type": "application/json" },
      ...init,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`);
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
  /* проверка доступности (лёгкий эндпоинт, короткий таймаут) */
  ping: () => req<Rates>(base, "/api/rates", undefined, 3000),

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
