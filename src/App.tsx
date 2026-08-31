import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_SETTINGS, useStore } from "./store";
import type { Settings } from "./types";
import CatalogPage from "./components/CatalogPage";
import Dashboard from "./components/Dashboard";
import Editor from "./components/Editor";
import LoginGate from "./components/LoginGate";
import RatesPage from "./components/RatesPage";
import UsersPage from "./components/UsersPage";
import { Field, Input, Modal, Textarea, ToastHost, cx } from "./components/ui";
import {
  IcBolt, IcBox, IcClock, IcFolder, IcGear, IcMoon, IcPanel, IcRefresh, IcSun, IcUser, IcWand, IcX,
} from "./components/icons";
import { can, currentRole, ROLE_LABEL } from "./utils/roles";

/* ============================================================
   ОБОЛОЧКА: тёмный сайдбар с навигацией, переключатель темы,
   реквизиты компании (уходят в шапку документов), подключение
   к C#-бэкенду, JWT-вход. Тосты — глобальные.
   ============================================================ */

type Route = "board" | "editor" | "catalog" | "rates" | "users";

const NAV: { key: Route; label: string; hint: string; icon: (p: { size?: number }) => ReactNode; adminOnly?: boolean }[] = [
  { key: "board", label: "Дашборд", hint: "проекты и статусы", icon: IcFolder },
  { key: "editor", label: "Конструктор", hint: "структура ТКП", icon: IcPanel },
  { key: "catalog", label: "Справочник", hint: "оборудование", icon: IcBox },
  { key: "rates", label: "Тарифы", hint: "нормо-часы", icon: IcClock },
  { key: "users", label: "Пользователи", hint: "роли и доступ", icon: IcUser, adminOnly: true },
];

export default function App() {
  const projects = useStore((s) => s.projects);
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const initAuth = useStore((s) => s.initAuth);
  const hydrateFromApi = useStore((s) => s.hydrateFromApi);
  const createProject = useStore((s) => s.createProject);
  const updateSettings = useStore((s) => s.updateSettings);
  const checkApi = useStore((s) => s.checkApi);
  const outboxCount = useStore((s) => s.outbox.length);
  const toast = useStore((s) => s.toast);

  const [route, setRoute] = useState<Route>("board");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [checkingConn, setCheckingConn] = useState(false);

  /* Клик по индикатору связи: явная проверка с визуальным откликом.
     Между нажатием и ответом — «Проверка…», затем тост «ок» или «не удалось». */
  const recheckConn = async () => {
    if (!apiBase || checkingConn) return;
    setCheckingConn(true);
    toast("Проверяем связь с сервером…", "info");
    const ok = await checkApi();
    setCheckingConn(false);
    toast(ok ? "Связь с сервером установлена" : `Сервер ${apiBase} не отвечает`, ok ? "ok" : "err");
  };

  const apiBase = (settings.apiBaseUrl ?? "").trim();
  const editorProject = projects.find((p) => p.id === editorId);
  /* пользователи — только админ; редактор — только при открытом проекте */
  const activeRoute: Route =
    route === "editor" ? (editorProject ? "editor" : "board")
    : route === "users" ? (can(user, "users.manage") ? "users" : "board")
    : route;

  /* тема: класс на <html> переключает все CSS-переменные токенов */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  /* при старте: восстановить профиль (токен на сервере или сессия в localStorage) */
  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  /* серверные данные подтягиваем только после входа:
     проекты/каталог защищены политикой Staff и требуют Bearer-токен */
  useEffect(() => {
    if (apiBase && user) void hydrateFromApi();
  }, [apiBase, user, hydrateFromApi]);

  const openProject = (id: string) => {
    setEditorId(id);
    setRoute("editor");
  };

  const addDemo = () => {
    const id = createProject({
      title: "Щит АВР для насосной станции №3",
      client: "ООО «Водоканал-Сервис»",
      contact: "гл. энергетик Морозов К.П.",
      direction: "nku",
      templateKey: "nku-avr",
      markup: 18,
      validDays: 30,
    });
    openProject(id);
    toast("Демо-проект создан по шаблону «Щит АВР»");
  };

  /* Экран входа показывается всегда, пока нет профиля:
     в серверном режиме — ASP.NET Identity, в локальном — localStorage. */
  if (!user) {
    return (
      <>
        <LoginGate />
        <ToastHost />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      {/* ---------------- сайдбар ---------------- */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-darkline bg-dark">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-lg shadow-accent/30">
            <IcBolt size={19} />
          </span>
          <div>
            <div className="font-display text-[15px] leading-none font-bold tracking-tight text-white">ТКП·Про</div>
            <div className="mt-1 text-[8.5px] font-semibold tracking-[0.22em] text-darkmute uppercase">НКУ · АСУ · Обогрев</div>
          </div>
        </div>

        <nav className="mt-1 flex flex-col gap-1 px-3">
          {NAV.filter((n) => !n.adminOnly || can(user, "users.manage")).map((n) => {
            const Icon = n.icon;
            const active = activeRoute === n.key;
            const dim = n.key === "editor" && !editorProject;
            return (
              <button
                key={n.key}
                disabled={dim}
                onClick={() => (n.key === "editor" && editorProject ? openProject(editorProject.id) : setRoute(n.key))}
                className={cx(
                  "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
                  active ? "bg-accent text-white shadow-lg shadow-accent/25" : "text-darkmute hover:bg-dark2 hover:text-white",
                  dim && "cursor-not-allowed opacity-40"
                )}
              >
                <Icon size={17} />
                <span className="flex-1">
                  <span className="block text-[13px] leading-tight font-bold">{n.label}</span>
                  <span className={cx("block text-[10px] leading-tight", active ? "text-white/70" : "text-darkmute")}>{n.hint}</span>
                </span>
                {n.key === "board" && projects.length > 0 && (
                  <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold", active ? "bg-white/20 text-white" : "bg-darkline text-darkmute")}>
                    {projects.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* профиль (если авторизован) */}
        {user && (
          <div className="mx-3 mt-4 rounded-lg bg-dark2 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="truncate text-[12.5px] font-bold text-white">{user.fullName}</div>
              <span className="shrink-0 rounded bg-darkline px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-darkmute uppercase">
                {ROLE_LABEL[currentRole(user)]}
              </span>
            </div>
            <div className="truncate text-[10px] text-darkmute">{user.email}</div>
            {user.phone && <div className="truncate text-[10px] text-darkmute">{user.phone}</div>}
            <div className="mt-1.5 flex items-center gap-3">
              <button
                onClick={() => setProfileOpen(true)}
                title="Изменить ФИО, должность, телефон"
                className="flex cursor-pointer items-center gap-1 text-[10.5px] font-semibold text-steel transition-colors hover:text-white"
              >
                <IcGear size={11} /> Профиль
              </button>
              <button onClick={logout} className="flex cursor-pointer items-center gap-1 text-[10.5px] font-semibold text-heat transition-colors hover:text-white">
                <IcX size={11} /> Выйти
              </button>
            </div>
          </div>
        )}

        <div className="mt-auto flex flex-col gap-1.5 border-t border-darkline px-3 py-4">
          {/* режим работы: локально (localStorage) или C#-бэкенд.
              В сетевом режиме — кликабельная кнопка повторной проверки связи. */}
          {apiBase ? (
            <button
              type="button"
              onClick={() => void recheckConn()}
              disabled={checkingConn}
              title={`${apiBase} — нажмите, чтобы проверить связь и отправить отложенные изменения`}
              className={cx(
                "mx-0.5 mb-1 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-wide uppercase transition-all duration-150 active:scale-[0.98]",
                checkingConn && "border-warn/50 text-warn",
                !checkingConn && settings.apiOnline === true && "border-ok/40 text-ok hover:bg-ok/10",
                !checkingConn && settings.apiOnline !== true && "border-heat/40 text-heat hover:bg-heat/10"
              )}
            >
              {checkingConn ? (
                <span className="shrink-0 animate-spin"><IcRefresh size={11} /></span>
              ) : (
                <span
                  className={cx(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    settings.apiOnline === true ? "blink-dot bg-ok" : "bg-heat"
                  )}
                />
              )}
              {checkingConn ? "Проверка…" : settings.apiOnline === true ? "C# API · онлайн" : "C# API · офлайн"}
              {!checkingConn && outboxCount > 0 && (
                <span className="ml-auto rounded bg-warn px-1 py-px font-mono text-[9px] font-bold text-dark" title={`Отложенных изменений: ${outboxCount}`}>
                  {outboxCount}
                </span>
              )}
            </button>
          ) : (
            <div
              className="mx-0.5 mb-1 flex items-center gap-2 rounded-md border border-darkline px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-wide text-darkmute uppercase"
              title="Данные хранятся в браузере. URL бэкенда — в «Реквизитах компании»."
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-darkmute" />
              Локальный режим
            </div>
          )}
          <button onClick={addDemo} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-darkmute transition-colors hover:bg-dark2 hover:text-white">
            <IcWand size={15} /> Демо-проект
          </button>
          <button
            onClick={() => {
              updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" });
              toast(settings.theme === "dark" ? "Светлая тема включена" : "Тёмная тема включена", "info");
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-darkmute transition-colors hover:bg-dark2 hover:text-white"
          >
            {settings.theme === "dark" ? <IcSun size={15} /> : <IcMoon size={15} />}
            {settings.theme === "dark" ? "Светлая тема" : "Тёмная тема"}
            <span className="ml-auto flex h-4 w-7 items-center rounded-full p-0.5 transition-colors" style={{ background: settings.theme === "dark" ? "#f04d14" : "#27313f" }}>
              <span className={cx("h-3 w-3 rounded-full bg-white transition-transform duration-200", settings.theme === "dark" && "translate-x-3")} />
            </span>
          </button>
          <button onClick={() => setSettingsOpen(true)} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-darkmute transition-colors hover:bg-dark2 hover:text-white">
            <IcGear size={15} /> Реквизиты компании
          </button>
        </div>
      </aside>

      {/* ---------------- контент ---------------- */}
      <main className="min-w-0 flex-1 bg-blueprint">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-[1460px] px-6 py-6 lg:px-8">
            {activeRoute === "board" && <Dashboard onOpen={openProject} />}
            {activeRoute === "editor" && editorProject && (
              <Editor
                key={editorProject.id}
                id={editorProject.id}
                onBack={() => {
                  setEditorId(null);
                  setRoute("board");
                }}
              />
            )}
            {activeRoute === "catalog" && <CatalogPage />}
            {activeRoute === "rates" && <RatesPage />}
            {activeRoute === "users" && <UsersPage />}
          </div>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={settings}
        onSave={(s) => {
          updateSettings(s);
          toast("Реквизиты сохранены — шапка документов обновлена");
          setSettingsOpen(false);
        }}
        onReset={() => {
          updateSettings(DEFAULT_SETTINGS);
          toast("Реквизиты сброшены к значениям по умолчанию", "info");
        }}
      />
      <ToastHost />
    </div>
  );
}

/* ---------------- реквизиты компании + подключение к API ---------------- */

function SettingsModal({
  open, onClose, initial, onSave, onReset,
}: {
  open: boolean;
  onClose: () => void;
  initial: Settings;
  onSave: (s: Settings) => void;
  onReset: () => void;
}) {
  const [f, setF] = useState<Settings>(initial);
  useEffect(() => setF(initial), [open, initial]);
  const set = (patch: Partial<Settings>) => setF((s) => ({ ...s, ...patch }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Реквизиты компании"
      w="max-w-2xl"
      footer={
        <>
          <button onClick={onReset} className="mr-auto flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-mute transition-colors hover:text-ink">
            <IcRefresh size={13} /> Сбросить
          </button>
          <button onClick={onClose} className="cursor-pointer rounded-md border border-line px-3.5 py-2 text-[13px] font-bold text-ink2 transition-colors hover:bg-paper">
            Отмена
          </button>
          <button onClick={() => onSave(f)} className="cursor-pointer rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-white transition-all hover:bg-accent-deep active:scale-95">
            Сохранить
          </button>
        </>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-mute">
        Эти данные попадают в шапку и подпись каждого документа ТКП (PDF/Word). Ставки нормо-часов — на странице{" "}
        <b className="text-ink2">«Тарифы»</b>.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Название компании">
          <Input value={f.companyName} onChange={(v) => set({ companyName: v })} />
        </Field>
        <Field label="Слоган / профиль">
          <Input value={f.tagline} onChange={(v) => set({ tagline: v })} />
        </Field>
        <Field label="Телефон">
          <Input value={f.phone} onChange={(v) => set({ phone: v })} />
        </Field>
        <Field label="E-mail">
          <Input value={f.email} onChange={(v) => set({ email: v })} />
        </Field>
        <Field label="Адрес" className="col-span-2">
          <Input value={f.address} onChange={(v) => set({ address: v })} />
        </Field>
        <Field label="Банковские реквизиты (ИНН, счёт…)" className="col-span-2">
          <Textarea rows={2} value={f.requisites} onChange={(v) => set({ requisites: v })} />
        </Field>
        <Field label="Менеджер (подписант)">
          <Input value={f.manager} onChange={(v) => set({ manager: v })} />
        </Field>
        <Field label="Исполнитель (инженер)">
          <Input value={f.executor} onChange={(v) => set({ executor: v })} />
        </Field>
      </div>

      <ApiBlock f={f} set={set} />
    </Modal>
  );
}

function ApiBlock({ f, set }: { f: Settings; set: (p: Partial<Settings>) => void }) {
  const pingApi = useStore((s) => s.pingApi);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-4 rounded-lg border border-line bg-paper/60 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-bold tracking-[0.14em] text-mute uppercase">Подключение к C#-бэкенду</span>
        <span
          className={cx(
            "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold",
            f.apiOnline ? "bg-ok-soft text-ok" : f.apiOnline === false ? "bg-heat-soft text-heat" : "bg-line/70 text-mute"
          )}
        >
          <span className={cx("h-1.5 w-1.5 rounded-full", f.apiOnline ? "blink-dot bg-ok" : f.apiOnline === false ? "bg-heat" : "bg-mute")} />
          {f.apiOnline ? "онлайн" : f.apiOnline === false ? "офлайн" : "не проверялось"}
        </span>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
        Сервер: <span className="font-mono text-[10.5px]">backend/TkpApi</span> (ASP.NET Core + PostgreSQL). Пустой URL —
        локальный режим, данные в браузере.
      </p>
      <div className="mt-2 flex gap-2">
        <Input value={f.apiBaseUrl ?? ""} onChange={(v) => set({ apiBaseUrl: v })} placeholder="http://localhost:5085" className="font-mono text-[12px]" />
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await pingApi(f.apiBaseUrl);
            setBusy(false);
          }}
          className="shrink-0 cursor-pointer rounded-md border border-line bg-card px-3 text-[12.5px] font-bold text-ink2 transition-all hover:border-accent hover:text-accent-deep active:scale-95 disabled:opacity-50"
        >
          {busy ? "Проверка…" : "Проверить"}
        </button>
      </div>
    </div>
  );
}
