import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ApiError, restApi, toCompany, getToken, setToken, type AuthUser, type ProfilePatch, type RestApi } from "./api/client";
import { CATALOG } from "./data/catalog";
import { buildTemplateCabinets } from "./data/templates";
import type {
  Cabinet, DeletedEquipment, Direction, Equipment, LineItem, Project, ProjectStatus, ProjectVersion, Rates, Settings,
} from "./types";
import { calcProject, genId } from "./utils";
import { can, denyReason, type Role } from "./utils/roles";
import {
  ensureLocalAdmin, localListUsers, localLogin, localLogout, localMe, localRegister, localSetUserRole,
  localUpdateProfile,
} from "./utils/localAuth";

/* ============================================================
   ХРАНИЛИЩЕ. Двухрежимное:
   • локальный (apiBaseUrl пуст) — всё в localStorage (persist);
   • серверный — каждая мутация оптимистично применяется локально
     и с дебаунсом уходит в C#-бэкенд (PUT /api/projects/{id} и др.),
     при старте состояние гидрируется с сервера (hydrateFromApi).
   UI-компоненты разницы не видят — контракты действий те же.
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
  /** «Корзина» справочника (удалённые позиции, хранятся 90 дней) — для пометок в ТКП. */
  deletedCatalog: DeletedEquipment[];
  /** Офлайн-очередь мутаций, отправляется при восстановлении связи. */
  outbox: OutboxOp[];
  /** true, пока идёт ручная проверка связи (индикатор «Проверка…»). */
  apiChecking: boolean;
  settings: Settings;
  toasts: Toast[];
  remoteLoading: boolean;
  /** Текущий пользователь (null — не авторизован / локальный режим). */
  user: AuthUser | null;

  toast: (text: string, kind?: ToastKind) => void;
  dismissToast: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;

  pingApi: (url?: string) => Promise<boolean>;
  /** Тихая проверка связи (heartbeat и клик по индикатору): обновляет apiOnline. */
  checkApi: () => Promise<boolean>;
  /** Автодетекция same-origin: при пустом apiBaseUrl проверяет /api/health на
      текущем origin и сам включает онлайн-режим (запуск в локальной сети). */
  autoDetectApi: () => Promise<void>;
  /** Отправить накопленные офлайн-мутации (проекты, справочник) на сервер. */
  flushOutbox: () => Promise<void>;
  hydrateFromApi: () => Promise<void>;

  /** Правка своего профиля (ФИО, должность, телефон) — доступно всем ролям. */
  updateProfile: (patch: { fullName?: string; position?: string; phone?: string }) => Promise<void>;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, role: string) => Promise<void>;
  logout: () => void;
  /** При старте: восстановить профиль (сервер — /api/auth/me, локально — сессия в localStorage). */
  initAuth: () => Promise<void>;
  /** Список пользователей: сервер (admin) или локальное хранилище. */
  listUsers: () => Promise<AuthUser[]>;
  /** Смена роли пользователя (сервер: PUT /api/auth/users/{id}/role, локально: сразу). */
  setUserRole: (id: string, role: string) => Promise<void>;

  createProject: (a: {
    title: string; client: string; contact: string; direction: Direction;
    templateKey: string | null; markup: number; validDays: number;
  }) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  /** false — отказано по правам (тост уже показан). */
  deleteProject: (id: string) => boolean;
  duplicateProject: (id: string) => string;
  /** false — отказано по правам (тост уже показан). */
  setStatus: (id: string, status: ProjectStatus) => boolean;

  addCabinet: (pid: string, kind: string, name: string) => string;
  addCabinetsBulk: (pid: string, cabs: Cabinet[]) => void;
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
  importEquipment: (items: Omit<Equipment, "id">[], csv?: string) => number;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => {
      /* ---------- серверная синхронизация ---------- */

      const api = (): RestApi | null => {
        // защита от старых сохранённых настроек без apiBaseUrl
        const base = (get().settings.apiBaseUrl ?? "").trim();
        return base ? restApi(base) : null;
      };

      let lastErrTs = 0;
      let failStreak = 0;
      /** Ошибка синхронизации. ВАЖНО различать два класса:
          • ApiError (любой HTTP-ответ, даже 4xx) — сервер ДОСТУПЕН, он ответил:
            показываем причину и НЕ роняем индикатор «онлайн» (иначе отказ прав
            или валидации выглядел бы как обрыв связи);
          • сетевой сбой (fetch не выполнился) — офлайн, но только после двух
            подряд, чтобы одиночный «чих» сети не переключал индикатор. */
      const syncFail = (err?: unknown) => {
        if (err instanceof ApiError) {
          if (Date.now() - lastErrTs > 6000) {
            lastErrTs = Date.now();
            get().toast(err.message || `Сервер ответил ошибкой ${err.status}`, "err");
          }
          return;
        }
        failStreak += 1;
        if (failStreak >= 2) {
          set((s) => ({ settings: { ...s.settings, apiOnline: false } }));
          if (Date.now() - lastErrTs > 6000) {
            lastErrTs = Date.now();
            get().toast("Бэкенд недоступен — изменения сохранены локально", "err");
          }
        }
      };
      const syncOk = () => {
        failStreak = 0;
        set((s) => (s.settings.apiOnline === true ? s : { settings: { ...s.settings, apiOnline: true } }));
      };

      /* Heartbeat: раз в 45 с тихо проверяем /api/health и возвращаем индикатор
         «онлайн», как только сервер снова отвечает. Закрывает сценарий «связь
         восстановилась, а режим так и остался офлайновым до разлогина». */
      if (typeof window !== "undefined") {
        window.setInterval(() => {
          const base = (get().settings.apiBaseUrl ?? "").trim();
          if (!base) return;
          if (get().settings.apiOnline === true) {
            // онлайн: если в очереди что-то осталось (например, flush прервался) — доотправляем
            if (get().outbox.length > 0) void get().flushOutbox();
            return;
          }
          void get().checkApi(); // при успехе сам снимет очередь
        }, 45_000);
      }

      /* ---------- офлайн-очередь (outbox) ----------
         Каждая мутация, не сумевшая дойти до сервера из-за обрыва связи,
         кладётся в очередь (persist → localStorage). При восстановлении связи
         (heartbeat / ручной клик по индикатору / успешный ping) очередь
         отправляется в порядке поступления. HTTP-ошибки (4xx/5xx) означают,
         что сервер ДОСТУПЕН — такую операцию снимаем (иначе зациклимся). */
      const opKey = (o: OutboxOp) =>
        o.kind === "project.upsert" || o.kind === "project.delete"
          ? `${o.kind}:${o.id}`
          : `${o.kind}:${o.eqId}`;
      const enqueue = (op: OutboxOp) =>
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
              return v ? { ...p, cabinets: JSON.parse(JSON.stringify(v.cabinets)), updatedAt: Date.now() } : p;
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

        /* Удаление позиции — только менеджер/админ (инженер лишь пополняет справочник). */
        deleteEquipment: (id) => {
          if (!can(get().user, "catalog.delete")) {
            get().toast(denyReason(get().user, "catalog.delete"), "err");
            return;
          }
          set((s) => ({ catalog: s.catalog.filter((e) => e.id !== id) }));
          const a = api();
          if (a) {
            const op: OutboxOp = { kind: "equipment.delete", eqId: id, ts: Date.now() };
            enqueue(op);
            a.deleteEquipment(id)
              .then(() => { dequeue(op); syncOk(); })
              .catch((e) => { if (e instanceof ApiError) { dequeue(op); syncFail(e); } else syncFail(e); });
          }
        },

        /* Импорт прайсов — массовая перезапись цен: только менеджер/админ. */
        importEquipment: (items, csv) => {
          if (!can(get().user, "catalog.import")) {
            get().toast(denyReason(get().user, "catalog.import"), "err");
            return 0;
          }
          let added = 0;
          set((s) => {
            const bySku = new Map(s.catalog.map((e) => [e.sku.toLowerCase(), e] as const));
            const next = [...s.catalog];
            for (const it of items) {
              const ex = bySku.get(it.sku.toLowerCase());
              if (ex) {
                const merged = { ...ex, ...it, id: ex.id };
                bySku.set(it.sku.toLowerCase(), merged);
                const i = next.findIndex((e) => e.id === ex.id);
                if (i >= 0) next[i] = merged;
              } else {
                const ne: Equipment = { ...it, id: genId("eq") };
                next.push(ne);
                bySku.set(it.sku.toLowerCase(), ne);
                added++;
              }
            }
            return { catalog: next };
          });
          // сервер сам разбирает CSV: дубликаты по артикулу обновит, новое добавит
          if (csv) api()?.importCsv(csv).then(syncOk).catch(syncFail);
          return added;
        },
      };
    },
    {
      name: "tkp-pro-v2",
      // v3: у settings появились apiBaseUrl/apiOnline. Старые сохранённые настройки
      // (без этих полей) приводили к краху при рендере — миграция дополняет их.
      version: 3,
      // не сохраняем «летучие» поля: тосты, индикатор загрузки, статус соединения,
      // apiChecking. outbox ОБЯЗАТЕЛЬНО сохраняем — иначе офлайн-мутации, сделанные
      // перед перезагрузкой страницы, потеряются и не дойдут до сервера.
      partialize: (s) =>
        ({
          projects: s.projects,
          catalog: s.catalog,
          outbox: s.outbox,
          deletedCatalog: s.deletedCatalog,
          settings: { ...s.settings, apiOnline: null },
        }) as StoreState,
      // Миграция со старой структуры: дополняем проекты/настройки новыми полями.
      migrate: (persisted: unknown, version: number) => {
        const st = persisted as Partial<StoreState>;
        if (version < 3 && st) {
          st.projects = (st.projects ?? []).map(normalizeProject) as Project[];
          const old = (st.settings ?? {}) as Partial<Settings>;
          st.settings = {
            ...DEFAULT_SETTINGS,
            ...old,
            rates: { ...DEFAULT_RATES, ...(old.rates ?? {}) },
            apiBaseUrl: typeof old.apiBaseUrl === "string" ? old.apiBaseUrl : "",
            apiOnline: null,
          };
        }
        return st as StoreState;
      },
    }
  )
);
