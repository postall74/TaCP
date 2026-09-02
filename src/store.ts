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

export type ToastKind = "ok" | "err" | "info";
export interface Toast { id: string; kind: ToastKind; text: string }

/** Операция отложенной синхронизации (офлайн-очередь). Пока сервер недоступен,
    мутации копятся здесь (persist → localStorage) и отправляются при восстановлении
    связи: новые и изменённые проекты, удалённые проекты, позиции справочника. */
export type OutboxOp =
  | { kind: "project.upsert"; id: string; ts: number }
  | { kind: "project.delete"; id: string; ts: number }
  | { kind: "equipment.upsert"; eqId: string; ts: number }
  | { kind: "equipment.delete"; eqId: string; ts: number };

const seedNumber = () => {
  const d = new Date();
  const n = Math.floor(Math.random() * 900) + 100;
  return `ТКП-${String(n)}-${d.getFullYear()}`;
};

const DEFAULT_RATES: Rates = { design: 1800, production: 1800, software: 2200, smr: 1800, pnr: 1800 };

export const DEFAULT_SETTINGS: Settings = {
  companyName: "ЗАО «Эталон-Прибор»",
  tagline: "КИПиА · сборка НКУ · АСУ ТП · системы электрообогрева",
  requisites:
    "ИНН: 7452023246 / КПП: 74480100 / ОГРН: 1027403767500\n" +
    "Банк Филиал «Корпоративный» ПАО «Совкомбанк», г. МОСКВА\n" +
    "Расчетный счет 40702810300230800179\n" +
    "Корр. счет 30101810445250000360\n" +
    "БИК 044525360",
  manager: "Сабаев А.В., руководитель проектов",
  executor: "Султанов С.А., руководитель группы по подготовке ТКП",
  phone: "+7 (351) 267-47-10",
  email: "s.a.sultanov@etalon-chel.ru",
  address: "г. Челябинск, пр. Победы, 288",
  theme: "light",
  rates: DEFAULT_RATES,
  apiBaseUrl: "",
  apiOnline: null,
};

/** Версия с сервера приходит в обёртке { snapshot: { cabinets, calc } },
    а локально хранится плоско { cabinets, calc }. Приводим оба варианта к
    плоскому виду — иначе вкладка «Версии» падает на v.cabinets / v.calc
    (чёрный экран) после гидратации из онлайн-режима. */
type RawVersion = Partial<ProjectVersion> & {
  ts?: number | string;
  snapshot?: { cabinets?: Cabinet[]; calc?: { eqBase?: number; total?: number } };
};
const normalizeVersion = (v: RawVersion): ProjectVersion => ({
  id: v.id ?? genId("ver"),
  ts: typeof v.ts === "number" ? v.ts : new Date(v.ts ?? Date.now()).getTime(),
  label: v.label ?? "",
  cabinets: v.cabinets ?? v.snapshot?.cabinets ?? [],
  calc: v.calc ?? { eqBase: v.snapshot?.calc?.eqBase ?? 0, total: v.snapshot?.calc?.total ?? 0 },
});

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
  versions: (p.versions ?? []).map(normalizeVersion),
  cabinets: (p.cabinets ?? []).map((c) => ({
    ...c,
    hours: c.hours ?? 0,
    designHours: c.designHours ?? 0,
    softwareHours: c.softwareHours ?? 0,
    items: c.items ?? [],
  })),
});

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
          const rest = s.outbox.filter((x) => opKey(x) !== opKey(op));
          return { outbox: [...rest, op] };
        });
      const dequeue = (op: OutboxOp) =>
        set((s) => ({ outbox: s.outbox.filter((x) => opKey(x) !== opKey(op)) }));

      /** Отправка проекта: PUT, а при 404 — POST (проект, созданный офлайн,
          может ещё не существовать на сервере). Идемпотентна — безопасна для
          повторных попыток из офлайн-очереди. */
      const sendProject = async (a: RestApi, p: Project) => {
        try {
          await a.putProject(p);
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) await a.createProject(p);
          else throw e;
        }
      };

      const syncTimers = new Map<string, number>();
      /** Дебаунс-отправка проекта на сервер после каждой локальной мутации.
          При сетевом сбое операция остаётся в очереди и уйдёт позже. */
      const syncProject = (pid: string) => {
        const a = api();
        if (!a) return;
        window.clearTimeout(syncTimers.get(pid));
        syncTimers.set(pid, window.setTimeout(async () => {
          const p = get().projects.find((x) => x.id === pid);
          if (!p) return;
          const op: OutboxOp = { kind: "project.upsert", id: pid, ts: Date.now() };
          enqueue(op);
          try {
            await sendProject(a, p);
            dequeue(op);
            syncOk();
          } catch (e) {
            if (e instanceof ApiError) { dequeue(op); syncFail(e); } // сервер ответил — не повторяем
            else syncFail(e);                                         // сеть — операция в очереди
          }
        }, 700));
      };

      return {
        projects: [],
        catalog: CATALOG,
        deletedCatalog: [],
        outbox: [],
        apiChecking: false,
        settings: DEFAULT_SETTINGS,
        toasts: [],
        remoteLoading: false,
        user: null,

        toast: (text, kind = "ok") => {
          const id = genId("t");
          set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
          setTimeout(() => get().dismissToast(id), 3800);
        },
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

        updateSettings: (patch) => {
          set((s) => ({ settings: { ...s.settings, ...patch } }));
          const a = api();
          if (!a) return;
          // зеркалируем на сервер то, что там хранится
          if (patch.rates) a.putRates(patch.rates).then(syncOk).catch(syncFail);
          const s = get().settings;
          if (["companyName", "tagline", "address", "phone", "email", "requisites", "manager", "executor"].some((k) => k in patch))
            a.putCompany(toCompany(s)).then(syncOk).catch(syncFail);
        },

        pingApi: async (url) => {
          const base = (url ?? get().settings.apiBaseUrl).trim();
          if (!base) {
            get().toast("Укажите URL бэкенда, например http://localhost:5085", "info");
            return false;
          }
          try {
            await restApi(base).ping();
            set((s) => ({ settings: { ...s.settings, apiOnline: true } }));
            get().toast("API доступен — подключение установлено");
            if (get().outbox.length > 0) void get().flushOutbox();
            return true;
          } catch {
            set((s) => ({ settings: { ...s.settings, apiOnline: false } }));
            get().toast(`Не удалось подключиться к ${base}`, "err");
            return false;
          }
        },

        /* тихая проверка — для heartbeat и ручного переподключения из сайдбара.
           При успехе доотправляет накопленные офлайн-мутации. */
        checkApi: async () => {
          const base = (get().settings.apiBaseUrl ?? "").trim();
          if (!base) return false;
          try {
            await restApi(base).ping();
            syncOk();
            if (get().outbox.length > 0) {
              get().toast(`Связь восстановлена — отправляем ${get().outbox.length} отложенных изменений`, "info");
              void get().flushOutbox();
            }
            return true;
          } catch {
            syncFail();
            return false;
          }
        },

        /* Автодетекция same-origin — ключ к запуску в локальной сети.
           API сам раздаёт фронтенд из dist/ (UseStaticFiles), поэтому для
           пользователя, открывшего http://<сервер>:5085, правильный apiBaseUrl —
           это текущий origin. Если URL не задан, проверяем /api/health на origin:
           ответил — автоматически переходим в онлайн (и подтягиваем данные после
           входа); не ответил (vite-dev на :3000 или file://) — остаёмся локально. */
        autoDetectApi: async () => {
          if ((get().settings.apiBaseUrl ?? "").trim()) return; // уже настроен — не трогаем
          if (typeof window === "undefined") return;
          const origin = window.location.origin;
          if (!/^https?:$/.test(window.location.protocol)) return; // file:// — локальный режим
          try {
            await restApi(origin).ping();
            set((s) => ({ settings: { ...s.settings, apiBaseUrl: origin, apiOnline: true } }));
            get().toast("Сервер ТКП обнаружен — включён онлайн-режим", "info");
          } catch {
            /* на этом origin API нет — остаёмся в локальном режиме */
          }
        },

        /* Отложенная синхронизация: отправляем очередь в порядке поступления.
           Сетевой сбой — останавливаемся (остальное доотправит следующий цикл);
           HTTP-ошибка — снимаем операцию (сервер доступен, повтор бесполезен). */
        flushOutbox: async () => {
          const a = api();
          if (!a) return;
          const queue = [...get().outbox];
          for (const op of queue) {
            try {
              if (op.kind === "project.upsert") {
                const p = get().projects.find((x) => x.id === op.id);
                if (p) await sendProject(a, p);
              } else if (op.kind === "project.delete") {
                await a.deleteProject(op.id);
              } else if (op.kind === "equipment.upsert") {
                const eq = get().catalog.find((x) => x.id === op.eqId);
                if (eq) await a.putEquipment(eq);
              } else {
                await a.deleteEquipment(op.eqId);
              }
              dequeue(op);
              syncOk();
            } catch (e) {
              if (e instanceof ApiError) { dequeue(op); syncFail(e); }
              else { syncFail(e); return; } // сеть всё ещё лежит — ждём следующего цикла
            }
          }
        },

        hydrateFromApi: async () => {
          const a = api();
          if (!a) return;
          set({ remoteLoading: true });
          try {
            /* «корзина» справочника грузится отдельно и необязательно:
               если эндпоинта нет (старый сервер) — просто пустой список */
            const [projects, catalog, company, rates, deletedCatalog] = await Promise.all([
              a.projects(), a.catalog(), a.company(), a.rates(),
              a.deletedEquipment().catch(() => [] as DeletedEquipment[]),
            ]);
            set((s) => ({
              projects: projects.map(normalizeProject),
              catalog,
              deletedCatalog,
              remoteLoading: false,
              settings: { ...s.settings, ...company, rates, apiOnline: true },
            }));
            get().toast("Данные загружены с сервера C#", "info");
            if (get().outbox.length > 0) void get().flushOutbox();
          } catch {
            set((s) => ({ remoteLoading: false, settings: { ...s.settings, apiOnline: false } }));
            get().toast("Сервер недоступен — работаем с локальной копией", "err");
          }
        },

        /* ---------- аутентификация (двухрежимная) ----------
           серверный режим (apiBaseUrl задан) → ASP.NET Identity + JWT;
           локальный режим → localStorage (utils/localAuth.ts).
           Контракты действий одинаковые — UI разницы не видит. */

        login: async (email, password) => {
          const a = api();
          if (a) {
            const r = await a.login(email, password);
            setToken(r.token);
            set({ user: r.user, settings: { ...get().settings, apiOnline: true } });
          } else {
            const u = await localLogin(email, password);
            set({ user: u });
          }
        },

        register: async (email, password, fullName, role) => {
          const a = api();
          if (a) await a.register(email, password, fullName, role);
          else await localRegister(email, password, fullName, role as Role);
        },

        logout: () => {
          setToken(null);
          localLogout();
          set({ user: null });
          get().toast("Вы вышли из системы", "info");
        },

        initAuth: async () => {
          const a = api();
          if (a) {
            if (!getToken()) return;
            try {
              set({ user: await a.me() });
            } catch {
              // токен невалиден/истёк — сбрасываем, покажем экран входа
              setToken(null);
              set({ user: null });
            }
          } else {
            await ensureLocalAdmin();
            const u = localMe();
            if (u) set({ user: u });
          }
        },

        listUsers: async () => {
          const a = api();
          return a ? a.users() : localListUsers();
        },

        setUserRole: async (id, role) => {
          const a = api();
          if (a) await a.setUserRole(id, role);
          else await localSetUserRole(id, role as Role);
          // если поменяли роль текущего пользователя — обновим профиль
          if (get().user?.id === id) {
            const u = get().user && { ...get().user!, roles: [role] };
            if (u) set({ user: u });
          }
        },

        /* Свой профиль: смена телефона/ФИО — сам пользователь, без админа.
           Сервер: PUT /api/auth/me; локально: localStorage. Ошибки (в т.ч.
           сетевые) пробрасываем — UI показывает причину тостом. */
        updateProfile: async (patch: ProfilePatch) => {
          const me = get().user;
          if (!me) throw new Error("Профиль не загружен");
          const a = api();
          let next: AuthUser;
          if (a) {
            next = await a.updateProfile(patch);
            syncOk();
          } else {
            next = localUpdateProfile(me.id, patch);
          }
          set({ user: { ...me, ...next } });
        },

        /* ---------- проекты ---------- */

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
          const a = api();
          if (a) {
            /* при обрыве связи проект останется в очереди и будет создан на
               сервере при восстановлении (sendProject: PUT → 404 → POST) */
            const op: OutboxOp = { kind: "project.upsert", id, ts: Date.now() };
            enqueue(op);
            a.createProject(p)
              .then(() => { dequeue(op); syncOk(); })
              .catch((e) => { if (e instanceof ApiError) { dequeue(op); syncFail(e); } else syncFail(e); });
          }
          return id;
        },

        updateProject: (id, patch) => {
          set((s) => ({
            projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
          }));
          syncProject(id);
        },

        deleteProject: (id) => {
          // право на удаление — менеджер/админ (матрица utils/roles.ts)
          if (!can(get().user, "project.delete")) {
            get().toast(denyReason(get().user, "project.delete"), "err");
            return false;
          }
          set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
          const a = api();
          if (a) {
            const op: OutboxOp = { kind: "project.delete", id, ts: Date.now() };
            enqueue(op);
            a.deleteProject(id)
              .then(() => { dequeue(op); syncOk(); })
              .catch((e) => { if (e instanceof ApiError) { dequeue(op); syncFail(e); } else syncFail(e); });
          }
          return true;
        },

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
          api()?.createProject(copy).then(syncOk).catch(syncFail);
          return nid;
        },

        setStatus: (id, status) => {
          // «выиграно/проиграно» — решение менеджера/админа; остальные переходы — рабочий процесс
          const perm = status === "won" || status === "lost" ? "status.decide" : "status.workflow";
          if (!can(get().user, perm)) {
            get().toast(denyReason(get().user, perm), "err");
            return false;
          }
          get().updateProject(id, { status });
          return true;
        },

        addCabinet: (pid, kind, name) => {
          const cid = genId("cab");
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === pid
                ? { ...p, updatedAt: Date.now(), cabinets: [...p.cabinets, { id: cid, kind, name, hours: 0, designHours: 0, softwareHours: 0, items: [] }] }
                : p
            ),
          }));
          syncProject(pid);
          return cid;
        },

        addCabinetsBulk: (pid, cabs) => {
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === pid ? { ...p, updatedAt: Date.now(), cabinets: [...p.cabinets, ...cabs] } : p
            ),
          }));
          syncProject(pid);
        },

        updateCabinet: (pid, cid, patch) => {
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === pid
                ? { ...p, updatedAt: Date.now(), cabinets: p.cabinets.map((c) => (c.id === cid ? { ...c, ...patch } : c)) }
                : p
            ),
          }));
          syncProject(pid);
        },

        removeCabinet: (pid, cid) => {
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === pid ? { ...p, updatedAt: Date.now(), cabinets: p.cabinets.filter((c) => c.id !== cid) } : p
            ),
          }));
          syncProject(pid);
        },

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
                        unit: eq.unit, qty, purchase: eq.purchase,
                      },
                    ],
                  };
                }),
              };
            }),
          }));
          syncProject(pid);
          return res;
        },

        updateItem: (pid, cid, iid, patch) => {
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
          }));
          syncProject(pid);
        },

        removeItem: (pid, cid, iid) => {
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
          }));
          syncProject(pid);
        },

        /* ---------- версии ---------- */

        saveVersion: (pid, label) => {
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
          }));
          syncProject(pid);
          api()?.saveVersionRemote(pid, label).catch(syncFail);
        },

        restoreVersion: (pid, vid) => {
          set((s) => ({
            projects: s.projects.map((p) => {
              if (p.id !== pid) return p;
              const v = p.versions.find((x) => x.id === vid);
              return v ? { ...p, cabinets: JSON.parse(JSON.stringify(v.cabinets ?? [])), updatedAt: Date.now() } : p;
            }),
          }));
          syncProject(pid);
        },

        deleteVersion: (pid, vid) => {
          set((s) => ({
            projects: s.projects.map((p) =>
              p.id === pid ? { ...p, versions: p.versions.filter((v) => v.id !== vid) } : p
            ),
          }));
          syncProject(pid);
        },

        /* ---------- справочник ---------- */

        upsertEquipment: (e) => {
          const isNew = !get().catalog.some((x) => x.id === e.id);
          set((s) => {
            const ex = s.catalog.some((x) => x.id === e.id);
            return { catalog: ex ? s.catalog.map((x) => (x.id === e.id ? e : x)) : [...s.catalog, e] };
          });
          const a = api();
          if (a) {
            /* putEquipment на сервере — upsert (создаёт, если нет), поэтому
               идемпотентен и безопасен для повторной отправки из офлайн-очереди */
            const op: OutboxOp = { kind: "equipment.upsert", eqId: e.id, ts: Date.now() };
            enqueue(op);
            a.putEquipment(e).then(() => { dequeue(op); syncOk(); }).catch((err) => {
              if (err instanceof ApiError && err.status === 409) {
                dequeue(op); // сервер доступен — дубль не добавлен, не повторяем
                if (isNew) set((s) => ({ catalog: s.catalog.filter((x) => x.id !== e.id) }));
                get().toast("Такая позиция уже есть в общем справочнике — дубль не добавлен", "err");
                return;
              }
              if (err instanceof ApiError) { dequeue(op); syncFail(err); }
              else syncFail(err); // сетевой сбой — операция осталась в очереди
            });
          }
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
