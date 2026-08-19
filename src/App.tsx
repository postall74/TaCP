import { useState, type ReactNode } from "react";
import { useStore } from "./store";
import { Btn, Field, Input, Modal, Textarea, ToastHost, cx } from "./components/ui";
import {
  IcBolt,
  IcBox,
  IcFolder,
  IcGear,
  IcRefresh,
  IcAlert,
} from "./components/icons";
import Dashboard from "./components/Dashboard";
import Editor from "./components/Editor";
import CatalogPage from "./components/CatalogPage";

export type Tab = "structure" | "doc" | "versions";
export type View =
  | { kind: "dashboard" }
  | { kind: "catalog" }
  | { kind: "project"; id: string; tab: Tab };

const NavItem = ({
  active,
  onClick,
  icon,
  label,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  meta?: string;
}) => (
  <button
    onClick={onClick}
    className={cx(
      "group flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-bold transition-all duration-150",
      active ? "bg-darkline text-white shadow-inner" : "text-darkmute hover:bg-dark2 hover:text-white"
    )}
  >
    <span className={cx("transition-colors", active ? "text-accent" : "text-darkmute group-hover:text-accent")}>{icon}</span>
    <span className="flex-1">{label}</span>
    {meta && <span className="rounded bg-dark2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-darkmute">{meta}</span>}
  </button>
);

export default function App() {
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const catalog = useStore((s) => s.catalog);
  const projects = useStore((s) => s.projects);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const resetAll = useStore((s) => s.resetAll);
  const toast = useStore((s) => s.toast);

  const activeProject =
    view.kind === "project" ? projects.find((p) => p.id === view.id) : undefined;

  const nav = (v: View) => setView(v);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ---------------- сайдбар ---------------- */}
      <aside className="no-print flex w-[218px] shrink-0 flex-col border-r border-darkline bg-dark">
        <button
          className="flex cursor-pointer items-center gap-2.5 px-4 pt-5 pb-4 text-left"
          onClick={() => nav({ kind: "dashboard" })}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-lg shadow-accent/30">
            <IcBolt size={20} />
          </span>
          <span>
            <span className="block font-display text-[14px] font-bold tracking-tight text-white">ТКП Про</span>
            <span className="block text-[10px] font-semibold tracking-[0.14em] text-darkmute uppercase">
              НКУ · АСУ · Обогрев
            </span>
          </span>
        </button>

        <nav className="mt-2 flex flex-col gap-1 px-2.5">
          <NavItem
            active={view.kind === "dashboard" || view.kind === "project"}
            onClick={() => nav({ kind: "dashboard" })}
            icon={<IcFolder size={17} />}
            label="Проекты ТКП"
            meta={String(projects.length)}
          />
          <NavItem
            active={view.kind === "catalog"}
            onClick={() => nav({ kind: "catalog" })}
            icon={<IcBox size={17} />}
            label="Справочник"
            meta={String(catalog.length)}
          />
        </nav>

        {activeProject && (
          <div className="anim-up mx-2.5 mt-4 rounded-lg border border-darkline bg-dark2 p-3">
            <div className="font-mono text-[10.5px] font-semibold text-accent">{activeProject.number}</div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug font-semibold text-white/90">
              {activeProject.title}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-darkmute">
              <span className="blink-dot h-1.5 w-1.5 rounded-full bg-accent" />
              в работе · черновик автосохранения
            </div>
          </div>
        )}

        <div className="mt-auto border-t border-darkline px-2.5 py-3">
          <NavItem active={false} onClick={() => setSettingsOpen(true)} icon={<IcGear size={17} />} label="Реквизиты компании" />
          <NavItem active={false} onClick={() => setResetOpen(true)} icon={<IcRefresh size={17} />} label="Сбросить демо-данные" />
          <div className="mt-2 px-3 text-[10px] leading-relaxed text-darkmute/70">
            {settings.companyName}
            <br />
            v1.0 · локальный режим
          </div>
        </div>
      </aside>

      {/* ---------------- рабочая область ---------------- */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 bg-blueprint [mask-image:linear-gradient(to_bottom,black_0%,transparent_80%)]" />
        <div className="pointer-events-none absolute -top-40 right-[-8rem] h-[26rem] w-[40rem] rounded-full bg-accent/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute top-64 -left-24 h-80 w-80 rounded-full bg-steel/[0.08] blur-3xl" />

        <div className="relative mx-auto max-w-[1240px] px-6 py-6 lg:px-8">
          {view.kind === "dashboard" && <Dashboard nav={nav} />}
          {view.kind === "catalog" && <CatalogPage />}
          {view.kind === "project" &&
            (activeProject ? (
              <Editor key={activeProject.id} project={activeProject} tab={view.tab} setTab={(t) => nav({ kind: "project", id: activeProject.id, tab: t })} nav={nav} />
            ) : (
              <div className="py-20 text-center">
                <p className="text-mute">Проект не найден.</p>
                <Btn variant="outline" className="mt-4" onClick={() => nav({ kind: "dashboard" })}>
                  К списку проектов
                </Btn>
              </div>
            ))}
        </div>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={() => {
        setSettingsOpen(false);
        toast("Реквизиты сохранены");
      }} />

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Сбросить демо-данные?"
        w="max-w-md"
        footer={
          <>
            <Btn variant="outline" onClick={() => setResetOpen(false)}>Отмена</Btn>
            <Btn variant="danger" onClick={resetAll}>
              <IcRefresh size={14} /> Сбросить всё
            </Btn>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-heat"><IcAlert size={20} /></span>
          <p className="text-[13px] leading-relaxed text-ink2">
            Все проекты, изменения справочника и реквизиты будут удалены, приложение вернётся
            к исходному демонстрационному состоянию. Действие необратимо.
          </p>
        </div>
      </Modal>

      <ToastHost />
    </div>
  );
}

/* ---------------- настройки / реквизиты ---------------- */

function SettingsModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [form, setForm] = useState(settings);

  const f = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (v: string) => setForm({ ...form, [k]: v }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Реквизиты и шапка документа"
      w="max-w-xl"
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>Отмена</Btn>
          <Btn onClick={() => { setSettings(form); onSave(); }}>Сохранить</Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Название компании" className="col-span-2">
          <Input {...f("companyName")} />
        </Field>
        <Field label="Слоган / профиль" className="col-span-2">
          <Input {...f("tagline")} />
        </Field>
        <Field label="Менеджер (подпись)">
          <Input {...f("manager")} />
        </Field>
        <Field label="Телефон">
          <Input {...f("phone")} />
        </Field>
        <Field label="E-mail">
          <Input {...f("email")} />
        </Field>
        <Field label="Адрес">
          <Input {...f("address")} />
        </Field>
        <Field label="Реквизиты (ИНН, банк, счёт)" className="col-span-2">
          <Textarea rows={3} {...f("requisites")} />
        </Field>
      </div>
      <p className="mt-3 rounded-md bg-steel-soft px-3 py-2 text-[12px] leading-relaxed text-steel">
        Эти данные попадают в шапку и подпись генерируемого документа ТКП (PDF / Word).
      </p>
    </Modal>
  );
}
