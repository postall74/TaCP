import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Cabinet,
  Direction,
  Equipment,
  LineItem,
  Project,
  Settings,
  Toast,
} from "./types";
import { CATALOG } from "./data/catalog";
import { TEMPLATES, buildTemplateCabinets } from "./data/templates";
import { calcProject, genId } from "./utils";

const nextNumber = (projects: Project[]) => {
  const nums = projects.map((p) => Number(p.number.split("-").pop()) || 0);
  return `ТКП-${new Date().getFullYear()}-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
};

const sampleProject = (): Project => ({
  id: genId("prj"),
  number: "ТКП-2026-001",
  title: "Модернизация системы электроснабжения механосборочного цеха",
  client: "АО «Полимер-Инжиниринг»",
  contact: "главный энергетик Крылов Д. М.",
  direction: "nku",
  status: "draft",
  createdAt: Date.now() - 86_400_000 * 3,
  updatedAt: Date.now() - 3_600_000 * 5,
  validDays: 30,
  markup: 8,
  hourRate: 950,
  complexity: 1.15,
  discount: 3,
  vat: true,
  notes:
    "Оплата: аванс 50 %, остаток по факту отгрузки.\nСрок изготовления: 6 недель с момента поступления аванса.\nГарантия: 24 месяца с даты подписания акта.\nДоставка до объекта заказчика включена в стоимость.",
  cabinets: TEMPLATES[0].build(),
  versions: [],
});

interface AppState {
  projects: Project[];
  catalog: Equipment[];
  settings: Settings;
  toasts: Toast[];

  toast: (msg: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;

  createProject: (d: {
    title: string;
    client: string;
    contact: string;
    direction: Direction;
    templateKey?: string;
  }) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;

  addCabinet: (pid: string, kind: string, name: string) => string;
  updateCabinet: (pid: string, cid: string, patch: Partial<Cabinet>) => void;
  removeCabinet: (pid: string, cid: string) => void;

  addEquipment: (pid: string, cid: string, eq: Equipment) => "added" | "incremented";
  updateItem: (pid: string, cid: string, itemId: string, patch: Partial<LineItem>) => void;
  removeItem: (pid: string, cid: string, itemId: string) => void;

  saveVersion: (pid: string, label: string) => void;
  restoreVersion: (pid: string, vid: string) => void;
  deleteVersion: (pid: string, vid: string) => void;

  upsertEquipment: (e: Equipment) => void;
  deleteEquipment: (id: string) => void;
  importEquipment: (items: Omit<Equipment, "id">[]) => number;

  setSettings: (s: Partial<Settings>) => void;
  resetAll: () => void;
}

const touch = (p: Project): Project => ({ ...p, updatedAt: Date.now() });

const mapProject = (projects: Project[], id: string, fn: (p: Project) => Project): Project[] =>
  projects.map((p) => (p.id === id ? fn(p) : p));

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      projects: [sampleProject()],
      catalog: CATALOG,
      settings: {
        companyName: "ООО «ЭнергоПром Автоматика»",
        tagline: "Щитовые устройства · АСУ ТП · Системы электрообогрева",
        requisites: "ИНН 7715402881 / КПП 771501001\nОГРН 1157746903122\nр/с 40702810902340051873, АО «Альфа-Банк»",
        manager: "Савельев А. П., руководитель отдела ТКП",
        phone: "+7 (495) 120-38-64",
        email: "tkp@ep-automatika.ru",
        address: "109316, г. Москва, Волгоградский пр-т, 42к5",
      },
      toasts: [],

      toast: (msg, tone = "ok") => {
        const id = genId("t");
        set({ toasts: [...get().toasts, { id, msg, tone }] });
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

      createProject: (d) => {
        const p: Project = {
          id: genId("prj"),
          number: nextNumber(get().projects),
          title: d.title,
          client: d.client,
          contact: d.contact,
          direction: d.direction,
          status: "draft",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          validDays: 30,
          markup: 8,
          hourRate: 950,
          complexity: 1.1,
          discount: 0,
          vat: true,
          notes:
            "Оплата: аванс 50 %, остаток по факту отгрузки.\nСрок изготовления: 4–6 недель.\nГарантия: 24 месяца.",
          cabinets: d.templateKey ? buildTemplateCabinets(d.templateKey) : [],
          versions: [],
        };
        set({ projects: [p, ...get().projects] });
        return p;
      },

      updateProject: (id, patch) =>
        set({ projects: mapProject(get().projects, id, (p) => touch({ ...p, ...patch })) }),

      deleteProject: (id) => set({ projects: get().projects.filter((p) => p.id !== id) }),

      duplicateProject: (id) => {
        const src = get().projects.find((p) => p.id === id);
        if (!src) return;
        const copy: Project = {
          ...src,
          id: genId("prj"),
          number: nextNumber(get().projects),
          title: `${src.title} (копия)`,
          status: "draft",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cabinets: structuredClone(src.cabinets),
          versions: [],
        };
        set({ projects: [copy, ...get().projects] });
      },

      addCabinet: (pid, kind, name) => {
        const cid = genId("cab");
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({ ...p, cabinets: [...p.cabinets, { id: cid, kind, name, hours: 8, items: [] }] })
          ),
        });
        return cid;
      },

      updateCabinet: (pid, cid, patch) =>
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({
              ...p,
              cabinets: p.cabinets.map((c) => (c.id === cid ? { ...c, ...patch } : c)),
            })
          ),
        }),

      removeCabinet: (pid, cid) =>
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({ ...p, cabinets: p.cabinets.filter((c) => c.id !== cid) })
          ),
        }),

      addEquipment: (pid, cid, eq) => {
        const proj = get().projects.find((p) => p.id === pid);
        const cab = proj?.cabinets.find((c) => c.id === cid);
        if (!proj || !cab) return "added";
        const existing = cab.items.find((i) => i.eqId === eq.id);
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({
              ...p,
              cabinets: p.cabinets.map((c) => {
                if (c.id !== cid) return c;
                if (existing)
                  return {
                    ...c,
                    items: c.items.map((i) => (i.id === existing.id ? { ...i, qty: i.qty + 1 } : i)),
                  };
                const item: LineItem = {
                  id: genId("li"),
                  eqId: eq.id,
                  sku: eq.sku,
                  name: eq.name,
                  brand: eq.brand,
                  unit: eq.unit,
                  qty: 1,
                  price: eq.price,
                  purchase: eq.purchase,
                };
                return { ...c, items: [...c.items, item] };
              }),
            })
          ),
        });
        return existing ? "incremented" : "added";
      },

      updateItem: (pid, cid, itemId, patch) =>
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({
              ...p,
              cabinets: p.cabinets.map((c) =>
                c.id === cid
                  ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }
                  : c
              ),
            })
          ),
        }),

      removeItem: (pid, cid, itemId) =>
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({
              ...p,
              cabinets: p.cabinets.map((c) =>
                c.id === cid ? { ...c, items: c.items.filter((i) => i.id !== itemId) } : c
              ),
            })
          ),
        }),

      saveVersion: (pid, label) => {
        const proj = get().projects.find((p) => p.id === pid);
        if (!proj) return;
        const v = {
          id: genId("ver"),
          label: label || `Версия ${proj.versions.length + 1}`,
          createdAt: Date.now(),
          total: calcProject(proj).total,
          cabinets: structuredClone(proj.cabinets),
          calc: {
            markup: proj.markup,
            hourRate: proj.hourRate,
            complexity: proj.complexity,
            discount: proj.discount,
            vat: proj.vat,
          },
        };
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({ ...p, versions: [v, ...p.versions] })
          ),
        });
      },

      restoreVersion: (pid, vid) =>
        set({
          projects: mapProject(get().projects, pid, (p) => {
            const v = p.versions.find((x) => x.id === vid);
            if (!v) return p;
            return touch({
              ...p,
              cabinets: structuredClone(v.cabinets),
              markup: v.calc.markup,
              hourRate: v.calc.hourRate,
              complexity: v.calc.complexity,
              discount: v.calc.discount,
              vat: v.calc.vat,
            });
          }),
        }),

      deleteVersion: (pid, vid) =>
        set({
          projects: mapProject(get().projects, pid, (p) =>
            touch({ ...p, versions: p.versions.filter((v) => v.id !== vid) })
          ),
        }),

      upsertEquipment: (e) => {
        const exists = get().catalog.some((c) => c.id === e.id);
        set({
          catalog: exists ? get().catalog.map((c) => (c.id === e.id ? e : c)) : [e, ...get().catalog],
        });
      },

      deleteEquipment: (id) => set({ catalog: get().catalog.filter((c) => c.id !== id) }),

      importEquipment: (items) => {
        const withIds = items.map((i) => ({ ...i, id: genId("eq") }));
        set({ catalog: [...withIds, ...get().catalog] });
        return withIds.length;
      },

      setSettings: (s) => set({ settings: { ...get().settings, ...s } }),

      resetAll: () => {
        localStorage.removeItem("tkp-pro-v1");
        location.reload();
      },
    }),
    {
      name: "tkp-pro-v1",
      partialize: (s) => ({ projects: s.projects, catalog: s.catalog, settings: s.settings }),
    }
  )
);
