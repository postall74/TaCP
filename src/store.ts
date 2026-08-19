import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CATALOG } from "./data/catalog";
import { buildTemplateCabinets } from "./data/templates";
import type {
  Cabinet, Direction, Equipment, LineItem, Project, ProjectStatus, ProjectVersion, Rates, Settings,
} from "./types";
import { calcProject, genId } from "./utils";

/* ============================================================
   ХРАНИЛИЩЕ (zustand + persist → localStorage).
   Слой данных сознательно изолирован: при переходе на C#-бэкенд
   (ASP.NET Core + PostgreSQL) эти action'ы превращаются в вызовы
   REST API без изменения компонентов UI (см. DOCS.md, раздел 6).
   ============================================================ */

export type ToastKind = "ok" | "err" | "info";
export interface Toast { id: string; kind: ToastKind; text: string }

const seedNumber = () => {
  const d = new Date();
  const n = Math.floor(Math.random() * 900) + 100;
  return `ТКП-${String(n)}-${d.getFullYear()}`;
};

const DEFAULT_RATES: Rates = { design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 };

export const DEFAULT_SETTINGS: Settings = {
  companyName: "ПКФ «Вектор-Электро»",
  tagline: "Комплектация · сборка НКУ · автоматизация · электрообогрев",
  requisites: "ИНН 7701234567 · КПП 770101001\nОГРН 1157746123456\nр/с 40702810900000012345, АО «Банк Промышленный»",
  manager: "Сабаев А.В., руководитель проектов",
  executor: "Козлов Д.И., инженер-проектировщик",
  phone: "+7 (495) 120-38-40",
  email: "tkp@vektor-electro.ru",
  address: "г. Москва, Электрозаводская ул., 21, стр. 1",
  theme: "light",
  rates: DEFAULT_RATES,
};

/** Заполняет недостающие поля старых сохранённых проектов новой модели. */
const normalizeProject = (p: Project): Project => ({
  ...p,
  markup: p.markup ?? 15,
  workMarkup: p.workMarkup ?? 25,
  discount: p.discount ?? 0,
  vatRate: p.vatRate ?? 20,
  showWorkLines: p.showWorkLines ?? true,
  tzzPct: p.tzzPct ?? 1,
  thirdParty: p.thirdParty ?? 0,
  extraCosts: p.extraCosts ?? 0,
  unforeseenPct: p.unforeseenPct ?? 2,
  tripCosts: p.tripCosts ?? 0,
  transportPct: p.transportPct ?? 0,
  smrCost: p.smrCost ?? 0,
  smrSell: p.smrSell ?? 0,
  pnrCost: p.pnrCost ?? 0,
  pnrSell: p.pnrSell ?? 0,
  validDays: p.validDays ?? 30,
  notes: p.notes ?? "",
  versions: p.versions ?? [],
  cabinets: (p.cabinets ?? []).map((c) => ({
    ...c,
    hours: c.hours ?? 0,
    designHours: c.designHours ?? 0,
    softwareHours: c.softwareHours ?? 0,
    items: c.items ?? [],
  })),
});

interface StoreState {
  projects: Project[];
  catalog: Equipment[];
  settings: Settings;
  toasts: Toast[];

  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  createProject: (data: {
    title: string; client: string; contact: string; direction: Direction;
    templateKey: string | null; markup: number; validDays: number;
  }) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => string;
  setStatus: (id: string, status: ProjectStatus) => void;

  addCabinet: (pid: string, kind: string, name: string) => string;
  addCabinetsBulk: (pid: string, cabs: Cabinet[]) => void; // мастер подбора
  updateCabinet: (pid: string, cid: string, patch: Partial<Cabinet>) => void;
  removeCabinet: (pid: string, cid: string) => void;

  addEquipment: (pid: string, cid: string, eq: Equipment, qty?: number) => "added" | "incremented";
  updateItem: (pid: string, cid: string, iid: string, patch: Partial<LineItem>) => void;
  removeItem: (pid: string, cid: string, iid: string) => void;

  saveVersion: (pid: string, label: string) => void;
  restoreVersion: (pid: string, vid: string) => void;
  deleteVersion: (pid: string, vid: string) => void;

  upsertEquipment: (e: Equipment) => void;
  deleteEquipment: (id: string) => void;
  importEquipment: (items: Omit<Equipment, "id">[]) => number;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      projects: [],
      catalog: CATALOG,
      settings: DEFAULT_SETTINGS,
      toasts: [],

      toast: (text, kind = "ok") => {
        const id = genId("t");
        set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
        setTimeout(() => get().dismissToast(id), 3800);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      createProject: ({ title, client, contact, direction, templateKey, markup, validDays }) => {
        const now = Date.now();
        const id = genId("prj");
        const p: Project = normalizeProject({
          id, number: seedNumber(), title, client, contact, direction,
          status: "draft", createdAt: now, updatedAt: now,
          cabinets: templateKey ? buildTemplateCabinets(templateKey) : [],
          markup, workMarkup: 25, discount: 0, vatRate: 20, showWorkLines: true,
          tzzPct: 1, thirdParty: 0, extraCosts: 0, unforeseenPct: 2, tripCosts: 0, transportPct: 0,
          smrCost: 0, smrSell: 0, pnrCost: 0, pnrSell: 0,
          validDays, notes: "", versions: [],
        });
        set((s) => ({ projects: [p, ...s.projects] }));
        return id;
      },

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
        })),

      deleteProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

      duplicateProject: (id) => {
        const src = get().projects.find((p) => p.id === id);
        if (!src) return "";
        const nid = genId("prj");
        const copy: Project = {
          ...JSON.parse(JSON.stringify(src)),
          id: nid,
          number: seedNumber(),
          title: `${src.title} (копия)`,
          status: "draft",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          versions: [],
        };
        set((s) => ({ projects: [copy, ...s.projects] }));
        return nid;
      },

      setStatus: (id, status) => get().updateProject(id, { status }),

      addCabinet: (pid, kind, name) => {
        const cid = genId("cab");
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid
              ? { ...p, updatedAt: Date.now(), cabinets: [...p.cabinets, { id: cid, kind, name, hours: 0, designHours: 0, softwareHours: 0, items: [] }] }
              : p
          ),
        }));
        return cid;
      },

      addCabinetsBulk: (pid, cabs) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid ? { ...p, updatedAt: Date.now(), cabinets: [...p.cabinets, ...cabs] } : p
          ),
        })),

      updateCabinet: (pid, cid, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid
              ? { ...p, updatedAt: Date.now(), cabinets: p.cabinets.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }
              : p
          ),
        })),

      removeCabinet: (pid, cid) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid ? { ...p, updatedAt: Date.now(), cabinets: p.cabinets.filter((c) => c.id !== cid) } : p
          ),
        })),

      addEquipment: (pid, cid, eq, qty = 1) => {
        let res: "added" | "incremented" = "added";
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== pid) return p;
            return {
              ...p,
              updatedAt: Date.now(),
              cabinets: p.cabinets.map((c) => {
                if (c.id !== cid) return c;
                const ex = c.items.find((i) => i.eqId === eq.id);
                if (ex) {
                  res = "incremented";
                  return { ...c, items: c.items.map((i) => (i.id === ex.id ? { ...i, qty: i.qty + qty } : i)) };
                }
                return {
                  ...c,
                  items: [
                    ...c.items,
                    {
                      id: genId("li"), eqId: eq.id, sku: eq.sku, name: eq.name, brand: eq.brand,
                      unit: eq.unit, qty, price: eq.price, purchase: eq.purchase,
                    },
                  ],
                };
              }),
            };
          }),
        }));
        return res;
      },

      updateItem: (pid, cid, iid, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid
              ? {
                  ...p, updatedAt: Date.now(),
                  cabinets: p.cabinets.map((c) =>
                    c.id === cid ? { ...c, items: c.items.map((i) => (i.id === iid ? { ...i, ...patch } : i)) } : c
                  ),
                }
              : p
          ),
        })),

      removeItem: (pid, cid, iid) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid
              ? {
                  ...p, updatedAt: Date.now(),
                  cabinets: p.cabinets.map((c) =>
                    c.id === cid ? { ...c, items: c.items.filter((i) => i.id !== iid) } : c
                  ),
                }
              : p
          ),
        })),

      saveVersion: (pid, label) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== pid) return p;
            const c = calcProject(p, get().settings.rates);
            const v: ProjectVersion = {
              id: genId("ver"), ts: Date.now(),
              label: label || `Версия ${p.versions.length + 1}`,
              cabinets: JSON.parse(JSON.stringify(p.cabinets)),
              calc: { eqBase: Math.round(c.eqBase), total: Math.round(c.total) },
            };
            return { ...p, versions: [v, ...p.versions] };
          }),
        })),

      restoreVersion: (pid, vid) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== pid) return p;
            const v = p.versions.find((x) => x.id === vid);
            return v ? { ...p, cabinets: JSON.parse(JSON.stringify(v.cabinets)), updatedAt: Date.now() } : p;
          }),
        })),

      deleteVersion: (pid, vid) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === pid ? { ...p, versions: p.versions.filter((v) => v.id !== vid) } : p
          ),
        })),

      upsertEquipment: (e) =>
        set((s) => {
          const ex = s.catalog.some((x) => x.id === e.id);
          return { catalog: ex ? s.catalog.map((x) => (x.id === e.id ? e : x)) : [...s.catalog, e] };
        }),

      deleteEquipment: (id) => set((s) => ({ catalog: s.catalog.filter((e) => e.id !== id) })),

      importEquipment: (items) => {
        let added = 0;
        set((s) => {
          const bySku = new Map(s.catalog.map((e) => [e.sku.toLowerCase(), e] as const));
          const next = [...s.catalog];
          for (const it of items) {
            const ex = bySku.get(it.sku.toLowerCase());
            if (ex) {
              bySku.set(it.sku.toLowerCase(), { ...ex, ...it, id: ex.id });
              const i = next.findIndex((e) => e.id === ex.id);
              if (i >= 0) next[i] = bySku.get(it.sku.toLowerCase())!;
            } else {
              const ne: Equipment = { ...it, id: genId("eq") };
              next.push(ne);
              bySku.set(it.sku.toLowerCase(), ne);
              added++;
            }
          }
          return { catalog: next };
        });
        return added;
      },
    }),
    {
      name: "tkp-pro-v2",
      version: 2,
      // Миграция со старой структуры: дополняем проекты/настройки новыми полями.
      migrate: (persisted: unknown, version: number) => {
        const st = persisted as Partial<StoreState>;
        if (version < 2 && st) {
          st.projects = (st.projects ?? []).map(normalizeProject) as Project[];
          st.settings = {
            ...DEFAULT_SETTINGS,
            ...(st.settings ?? {}),
            rates: { ...DEFAULT_RATES, ...(st.settings?.rates ?? {}) },
          };
        }
        return st as StoreState;
      },
    }
  )
);
