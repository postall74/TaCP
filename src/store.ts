import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, CabinetTemplate, Equipment, Toast } from "./types";
import { CATALOG } from "./data/catalog";
import { genId } from "./utils";

/* ============================================================
   ХРАНИЛИЩЕ ПРИЛОЖЕНИЯ (zustand + persist в localStorage).
   Шаблоны шкафов — главная сущность Б.1: сохраняются локально и
   переживают перезагрузку; в полной версии синхронизируются с БД.
   ============================================================ */

interface StoreState {
  templates: CabinetTemplate[];
  catalog: Equipment[];
  /** null — локальный режим (права администратора). */
  user: AuthUser | null;
  toasts: Toast[];

  upsertTemplate: (t: CabinetTemplate) => void;
  deleteTemplate: (id: string) => boolean;
  toast: (msg: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      templates: [],
      catalog: CATALOG,
      user: null,
      toasts: [],

      upsertTemplate: (t) =>
        set((s) => {
          const ex = s.templates.some((x) => x.id === t.id);
          return { templates: ex ? s.templates.map((x) => (x.id === t.id ? t : x)) : [t, ...s.templates] };
        }),

      deleteTemplate: (id) => {
        const ex = get().templates.some((x) => x.id === id);
        set((s) => ({ templates: s.templates.filter((x) => x.id !== id) }));
        return ex;
      },

      toast: (msg, kind = "ok") => {
        const id = genId("t");
        set((s) => ({ toasts: [...s.toasts, { id, msg, kind }] }));
        setTimeout(() => get().dismissToast(id), 4200);
      },

      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "shkaf-pro-v1",
      /* тосты не сохраняем */
      partialize: (s) => ({ templates: s.templates, catalog: s.catalog, user: s.user }) as StoreState,
    },
  ),
);
