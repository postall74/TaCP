import { useEffect, useState } from "react";
import { useStore } from "./store";
import LoginGate from "./components/LoginGate";
import Dashboard from "./components/Dashboard";
import Editor from "./components/Editor";
import CatalogPage from "./components/CatalogPage";
import CabinetConfigurator from "./components/CabinetConfigurator";
import RatesPage from "./components/RatesPage";
import UsersPage from "./components/UsersPage";
import { cx } from "./components/ui";
import {
  IcBolt, IcBox, IcDatabase, IcGear, IcLayers, IcRefresh, IcUser, IcX,
} from "./components/icons";
import { currentRole, ROLE_LABEL } from "./utils/roles";

/* ============================================================
   ОБОЛОЧКА ПРИЛОЖЕНИЯ: авторизация (локально / сервер),
   сайдбар с навигацией и индикатором связи, рабочая область,
   тосты. Режимы: локальный (apiBaseUrl пуст) и онлайн
   (C#-бэкенд, автодетекция same-origin при запуске в сети).
   ============================================================ */

type Page = "projects" | "catalog" | "templates" | "rates" | "users";

const NAV: { id: Page; label: string; icon: (s: number) => React.ReactNode; adminOnly?: boolean }[] = [
  { id: "projects", label: "Проекты ТКП", icon: (s) => <IcLayers size={s} /> },
  { id: "catalog", label: "Справочник", icon: (s) => <IcDatabase size={s} /> },
  { id: "templates", label: "Шаблоны шкафов", icon: (s) => <IcBox size={s} /> },
  { id: "rates", label: "Тарифы", icon: (s) => <IcGear size={s} /> },
  { id: "users", label: "Пользователи", icon: (s) => <IcUser size={s} />, adminOnly: true },
];

export default function App() {
  const user = useStore((s) => s.user);
  const settings = useStore((s) => s.settings);
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);
  const initAuth = useStore((s) => s.initAuth);
  const autoDetectApi = useStore((s) => s.autoDetectApi);
  const checkApi = useStore((s) => s.checkApi);
  const logout = useStore((s) => s.logout);
  const remoteLoading = useStore((s) => s.remoteLoading);
  const outboxCount = useStore((s) => s.outbox.length);
  const apiChecking = useStore((s) => s.apiChecking);

  const [page, setPage] = useState<Page>("projects");
  const [editorId, setEditorId] = useState<string | null>(null);

  /* старт: автодетекция API на том же origin (работа в локальной сети),
     затем восстановление профиля по токену / сессии */
  useEffect(() => {
    void autoDetectApi().then(() => initAuth());
  }, [autoDetectApi, initAuth]);

  if (!user) {
    return (
      <>
        <LoginGate />
        <Toasts toasts={toasts} dismiss={dismissToast} />
      </>
    );
  }

  const role = currentRole(user);
  const online = settings.apiOnline === true;
  const apiBase = (settings.apiBaseUrl ?? "").trim();

  return (
    <div className="bg-blueprint flex min-h-screen">
      {/* ---------------- сайдбар ---------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-darkline bg-dark lg:w-60">
        <div className="flex items-center gap-2.5 px-3 py-4 lg:px-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-md shadow-accent/30">
            <IcBolt size={18} />
          </span>
          <div className="hidden min-w-0 lg:block">
            <div className="font-display text-[15px] font-bold leading-tight text-white">ТКП·Про</div>
            <div className="text-[9.5px] font-semibold tracking-[0.14em] text-darkmute uppercase">предложения · расчёт</div>
          </div>
        </div>
      </header>

      {/* ---------- рабочая область ---------- */}
      <main className="mx-auto grid max-w-6xl gap-4 px-5 py-6 lg:grid-cols-[360px_1fr]">
        {/* карточка проекта + экономика */}
        <section className="anim-rise flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
            <div className="border-b border-line bg-dark px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="num font-mono text-[11px] font-bold tracking-wide text-darkmute">{project.number}</span>
                <Badge tone="warn">{STATUS_LABEL[project.status]}</Badge>
              </div>
              <h1 className="mt-1 text-[15px] leading-snug font-bold text-white">{project.title}</h1>
              <div className="mt-0.5 text-[11px] text-darkmute">{project.client}</div>
            </div>
            <div className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-mute">Направление</span>
                <Badge tone="steel">{DIRECTIONS[project.direction].short}</Badge>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-mute">Шкафов / позиций</span>
                <span className="num font-mono font-bold text-ink">{project.cabinets.length} / {posCount}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-mute">Наценка / работы</span>
                <span className="num font-mono font-bold text-ink">{fmtNum(project.markup)} % / +{fmtNum(project.workMarkup)} %</span>
              </div>
              <div className="mt-1 flex items-end justify-between border-t border-line pt-2.5">
                <div>
                  <div className="text-[9.5px] font-bold tracking-widest text-mute uppercase">Итог с НДС {fmtNum(project.vatRate)} %</div>
                  <div key={calc.totalVat} className="num anim-pop font-mono text-[22px] leading-tight font-extrabold text-ink">
                    {fmtMoney(calc.totalVat)}
                  </div>
                </div>
                <div className="text-right text-[10.5px] leading-snug text-mute">
                  оборудование {fmtMoney(calc.eqSell)}<br />работы {fmtMoney(calc.laborSell)}
                </div>
              </div>
              <Btn className="mt-2 w-full" onClick={() => setWizardOpen(true)}>
                <Wand size={15} /> Открыть мастер подбора
              </Btn>
            </div>
          </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2 lg:px-3">
          {NAV.filter((n) => !n.adminOnly || role === "admin").map((n) => {
            const active = page === n.id && !editorId;
            return (
              <button
                key={n.id}
                onClick={() => { setPage(n.id); setEditorId(null); }}
                title={n.label}
                className={cx(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[12.5px] font-bold transition-all duration-150 lg:px-3",
                  active ? "bg-dark2 text-white shadow-inner" : "text-darkmute hover:bg-dark2/60 hover:text-white",
                )}
              >
                <span className={cx("shrink-0", active && "text-accent")}>{n.icon(16)}</span>
                <span className="hidden truncate lg:block">{n.label}</span>
              </button>
            );
          })}
        </nav>

        {/* индикатор связи с бэкендом — кликабельный */}
        {apiBase && (
          <button
            onClick={() => { void checkApi(); }}
            title={apiChecking ? "Проверяем связь…" : online ? "Нажмите, чтобы перепроверить связь" : "Связи нет — нажмите для повторной проверки"}
            className={cx(
              "mx-2 mb-2 flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all duration-150 active:scale-[0.98] lg:mx-3 lg:px-3",
              online ? "border-ok/30 bg-ok-soft/10 hover:bg-ok-soft/20" : "border-heat/30 bg-heat-soft/10 hover:bg-heat-soft/20",
            )}
          >
            {apiChecking ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-steel"><IcRefresh size={14} className="animate-spin" /></span>
            ) : (
              <span className={cx("blink-dot h-2.5 w-2.5 shrink-0 rounded-full", online ? "bg-ok" : "bg-heat")} />
            )}
            <span className="hidden min-w-0 lg:block">
              <span className={cx("block text-[11.5px] font-bold", online ? "text-white" : "text-heat")}>
                {apiChecking ? "Проверка связи…" : online ? "Онлайн" : "Офлайн"}
              </span>
              <span className="block truncate text-[9.5px] text-darkmute">
                {apiChecking ? "опрашиваем сервер" : online
                  ? (outboxCount > 0 ? `отложенных изменений: ${outboxCount}` : "все изменения на сервере")
                  : "данные сохраняются локально"}
              </span>
            </span>
          </button>
        )}

        {/* профиль */}
        <div className="mx-2 mb-3 rounded-lg bg-dark2 px-3 py-2.5 lg:mx-3">
          <div className="flex items-center justify-between gap-2">
            <div className="hidden truncate text-[12px] font-bold text-white lg:block">{user.fullName}</div>
            <span className="hidden shrink-0 rounded bg-darkline px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-darkmute uppercase lg:block">
              {ROLE_LABEL[role]}
            </span>
          </div>
          <div className="hidden truncate text-[10px] text-darkmute lg:block">{user.email}</div>
          {user.phone && <div className="hidden truncate text-[10px] text-darkmute lg:block">{user.phone}</div>}
          <button onClick={() => { logout(); setEditorId(null); }} className="mt-1.5 flex cursor-pointer items-center gap-1 text-[10.5px] font-semibold text-heat transition-colors hover:text-white">
            <IcX size={11} /> Выйти
          </button>
        </div>
      </aside>

      {/* ---------------- рабочая область ---------------- */}
      <main className="ml-16 min-w-0 flex-1 px-4 py-6 lg:ml-60 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          {editorId ? (
            <Editor id={editorId} onBack={() => setEditorId(null)} />
          ) : page === "projects" ? (
            <Dashboard onOpen={(id) => setEditorId(id)} />
          ) : page === "catalog" ? (
            <CatalogPage />
          ) : page === "templates" ? (
            <CabinetConfigurator />
          ) : page === "rates" ? (
            <RatesPage />
          ) : (
            <UsersPage />
          )}
        </div>
      </main>

      {/* оверлей загрузки с сервера */}
      {remoteLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-dark/30 backdrop-blur-[2px]">
          <div className="anim-scale flex items-center gap-3 rounded-xl border border-line bg-card px-5 py-3.5 shadow-2xl">
            <IcRefresh size={18} className="animate-spin text-steel" />
            <span className="text-[13px] font-bold text-ink">Загружаем данные с сервера…</span>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

/* ---------------- тосты ---------------- */

function Toasts({ toasts, dismiss }: { toasts: { id: string; kind: "ok" | "err" | "info"; text: string }[]; dismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            "anim-slide pointer-events-auto cursor-pointer rounded-lg border px-3.5 py-2.5 text-left text-[12.5px] font-semibold shadow-lg backdrop-blur",
            t.kind === "ok" && "border-ok/30 bg-ok-soft text-ok",
            t.kind === "err" && "border-heat/30 bg-heat-soft text-heat",
            t.kind === "info" && "border-steel/30 bg-steel-soft text-steel",
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
