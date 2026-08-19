import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, useStore } from "./store";
import CatalogPage from "./components/CatalogPage";
import Dashboard from "./components/Dashboard";
import Editor from "./components/Editor";
import RatesPage from "./components/RatesPage";
import { Field, Input, Modal, Textarea, ToastHost, cx } from "./components/ui";
import {
  IcBolt, IcBox, IcClock, IcFolder, IcGear, IcMoon, IcPanel, IcRefresh, IcSun, IcWand,
} from "./components/icons";
import type { Settings } from "./types";

/* ============================================================
   ОБОЛОЧКА: тёмный сайдбар с навигацией, переключатель темы,
   реквизиты компании (уходят в шапку документов), тосты.
   ============================================================ */

type Route = "board" | "editor" | "catalog" | "rates";

const NAV: { key: Route; label: string; icon: (p: { size?: number }) => JSX.Element; hint: string }[] = [
  { key: "board", label: "Дашборд", icon: IcFolder, hint: "проекты и статусы" },
  { key: "editor", label: "Конструктор", icon: IcPanel, hint: "структура ТКП" },
  { key: "catalog", label: "Справочник", icon: IcBox, hint: "оборудование" },
  { key: "rates", label: "Тарифы", icon: IcClock, hint: "нормо-часы" },
];

export default function App() {
  const projects = useStore((s) => s.projects);
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const createProject = useStore((s) => s.createProject);
  const toast = useStore((s) => s.toast);

  const [route, setRoute] = useState<Route>("board");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const editorProject = projects.find((p) => p.id === editorId);
  const activeRoute: Route = route === "editor" ? (editorProject ? "editor" : "board") : route;

  /* тема: класс на <html> переключает все CSS-переменные токенов */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  /* при заданном URL бэкенда — грузим проекты/каталог/тарифы с сервера */
  const hydrateFromApi = useStore((s) => s.hydrateFromApi);
  const apiBase = settings.apiBaseUrl.trim();
  useEffect(() => {
    if (apiBase) hydrateFromApi();
  }, [apiBase, hydrateFromApi]);

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

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      {/* ---------------- сайдбар ---------------- */}
      <aside id="app-sidebar" className="flex w-[218px] shrink-0 flex-col border-r border-darkline bg-dark">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-lg shadow-accent/30">
            <IcBolt size={19} />
          </span>
          <div>
            <div className="font-display text-[15px] leading-none font-bold tracking-tight text-white">ТКП·Про</div>
            <div className="mt-1 text-[9px] font-semibold tracking-[0.22em] text-darkmute uppercase">НКУ · АСУ · Обогрев</div>
          </div>
        </div>

        {/* индикатор режима хранения: локально / C#-бэкенд */}
        <div className="mx-4 mb-4 flex items-center gap-2 rounded-md border border-darkline bg-dark2 px-2.5 py-1.5">
          <span
            className={cx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              settings.apiBaseUrl.trim()
                ? settings.apiOnline
                  ? "blink-dot bg-ok"
                  : settings.apiOnline === false
                    ? "bg-heat"
                    : "bg-warn"
                : "bg-darkmute"
            )}
          />
          <span className="truncate text-[9.5px] font-bold tracking-[0.14em] text-darkmute uppercase">
            {settings.apiBaseUrl.trim()
              ? settings.apiOnline
                ? "API · онлайн"
                : settings.apiOnline === false
                  ? "API · офлайн"
                  : "API · проверка"
              : "локальный режим"}
          </span>
        </div>

        <nav className="mt-1 flex flex-col gap-1 px-3">
          {NAV.map((n) => {
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

        <div className="mt-auto flex flex-col gap-1.5 border-t border-darkline px-3 py-4">
          <button
            onClick={addDemo}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-darkmute transition-colors hover:bg-dark2 hover:text-white"
          >
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
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-darkmute transition-colors hover:bg-dark2 hover:text-white"
          >
            <IcGear size={15} /> Реквизиты компании
          </button>
        </div>
      </aside>

      {/* ---------------- контент ---------------- */}
      <main id="app-main" className="min-w-0 flex-1 bg-blueprint">
        <div id="app-scroll" className="h-full overflow-y-auto">
          <div id="app-content" className="mx-auto max-w-[1460px] px-6 py-6 lg:px-8">
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
          </div>
        </div>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} initial={settings} onSave={(s) => { updateSettings(s); toast("Реквизиты сохранены — шапка документов обновлена"); setSettingsOpen(false); }} onReset={() => { updateSettings(DEFAULT_SETTINGS); toast("Реквизиты сброшены к значениям по умолчанию", "info"); }} />
      <ToastHost />
    </div>
  );
}

/* ---------------- реквизиты компании ---------------- */

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
          <button onClick={onClose} className="rounded-md border border-line px-3.5 py-2 text-[13px] font-bold text-ink2 transition-colors hover:bg-paper">
            Отмена
          </button>
          <button onClick={() => onSave(f)} className="cursor-pointer rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-white transition-all hover:bg-accent-deep active:scale-95">
            Сохранить
          </button>
        </>
      }
    >
      <p className="mb-3 text-[12px] leading-relaxed text-mute">
        Эти данные попадают в шапку и подпись каждого документа ТКП (PDF/Word). Ставки нормо-часов настраиваются на
        отдельной странице <b className="text-ink2">«Тарифы»</b>.
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

/* ---------------- подключение к C#-бэкенду ---------------- */

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
