import { useMemo, useState } from "react";
import type { View } from "../App";
import { useStore } from "../store";
import type { Direction, Project } from "../types";
import { DIRECTIONS, STATUS_META, type ProjectStatus } from "../types";
import { TEMPLATES } from "../data/templates";
import { calcProject, fmtDate, fmtMoney, plural } from "../utils";
import { Badge, Btn, EmptyState, Field, IconBtn, Input, Modal, Select, cx } from "./ui";
import {
  IcBolt,
  IcCopy,
  IcCpu,
  IcFlame,
  IcFolder,
  IcLayers,
  IcPanel,
  IcPencil,
  IcPlus,
  IcSearch,
  IcTrash,
} from "./icons";

const DIR_ICON: Record<Direction, (p: { size?: number }) => React.ReactNode> = {
  nku: (p) => <IcPanel {...p} />,
  asu: (p) => <IcCpu {...p} />,
  heat: (p) => <IcFlame {...p} />,
};

export default function Dashboard({ nav }: { nav: (v: View) => void }) {
  const projects = useStore((s) => s.projects);
  const catalog = useStore((s) => s.catalog);
  const updateProject = useStore((s) => s.updateProject);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const toast = useStore((s) => s.toast);

  const [dir, setDir] = useState<Direction | "all">("all");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Project | null>(null);

  const rows = useMemo(
    () =>
      projects
        .map((p) => ({ p, calc: calcProject(p) }))
        .sort((a, b) => b.p.updatedAt - a.p.updatedAt),
    [projects]
  );

  const filtered = rows.filter(({ p }) => {
    if (dir !== "all" && p.direction !== dir) return false;
    const s = `${p.number} ${p.title} ${p.client}`.toLowerCase();
    return q.trim() === "" || s.includes(q.trim().toLowerCase());
  });

  const openSum = rows.reduce((s, r) => s + r.calc.total, 0);
  const avgMargin = rows.length
    ? rows.reduce((s, r) => s + r.calc.marginPct, 0) / rows.length
    : 0;

  const stats = [
    { label: "Проектов в работе", value: String(projects.length), icon: <IcFolder size={16} />, tint: "text-accent bg-accent-soft" },
    { label: "Открытая сумма ТКП", value: fmtMoney(openSum), icon: <IcBolt size={16} />, tint: "text-steel bg-steel-soft" },
    { label: "Позиций в справочнике", value: String(catalog.length), icon: <IcLayers size={16} />, tint: "text-ok bg-ok-soft" },
    { label: "Средняя маржа", value: `${avgMargin.toFixed(0)} %`, icon: <IcCpu size={16} />, tint: "text-heat bg-heat-soft" },
  ];

  return (
    <div>
      {/* шапка */}
      <div className="anim-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-mute uppercase">
              Портфель предложений
            </span>
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Проекты ТКП</h1>
          <p className="mt-1 text-[13.5px] text-mute">
            Технико-коммерческие предложения по направлениям НКУ, АСУ ТП / АСУ Э и электрообогрев
          </p>
        </div>
        <Btn onClick={() => setNewOpen(true)}>
          <IcPlus size={15} /> Новое ТКП
        </Btn>
      </div>

      {/* метрики */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="anim-up group rounded-xl border border-line bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-line2 hover:shadow-md hover:shadow-dark/5"
            style={{ animationDelay: `${60 + i * 55}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold tracking-wide text-mute uppercase">{s.label}</span>
              <span className={cx("flex h-7 w-7 items-center justify-center rounded-md transition-transform duration-200 group-hover:scale-110", s.tint)}>
                {s.icon}
              </span>
            </div>
            <div className="mt-2 font-mono text-[19px] font-bold tracking-tight text-ink tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* фильтры */}
      <div className="anim-up mt-7 flex flex-wrap items-center gap-2" style={{ animationDelay: "120ms" }}>
        {(
          [
            { k: "all", label: "Все направления" },
            { k: "nku", label: "НКУ" },
            { k: "asu", label: "АСУ ТП / АСУ Э" },
            { k: "heat", label: "Электрообогрев" },
          ] as const
        ).map((o) => (
          <button
            key={o.k}
            onClick={() => setDir(o.k)}
            className={cx(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition-all duration-150 active:scale-95",
              dir === o.k
                ? "border-dark bg-dark text-white shadow-sm"
                : "border-line bg-card text-ink2 hover:border-line2 hover:text-ink"
            )}
          >
            {o.k !== "all" && <span className={cx("h-1.5 w-1.5 rounded-full", DIRECTIONS[o.k].dot)} />}
            {o.label}
            <span className={cx("font-mono text-[10.5px]", dir === o.k ? "text-darkmute" : "text-mute")}>
              {o.k === "all" ? projects.length : projects.filter((p) => p.direction === o.k).length}
            </span>
          </button>
        ))}
        <div className="relative ml-auto w-64">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute">
            <IcSearch size={15} />
          </span>
          <Input value={q} onChange={setQ} placeholder="Номер, название, заказчик…" className="pl-9" />
        </div>
      </div>

      {/* список проектов */}
      <div className="mt-4 flex flex-col gap-2.5 pb-10">
        {filtered.map(({ p, calc }, i) => {
          const d = DIRECTIONS[p.direction];
          const st = STATUS_META[p.status];
          const marginTone =
            calc.marginPct >= 22 ? "bg-ok-soft text-ok" : calc.marginPct >= 12 ? "bg-warn-soft text-warn" : "bg-heat-soft text-heat";
          return (
            <div
              key={p.id}
              className="anim-up group grid cursor-pointer grid-cols-1 items-center gap-x-6 gap-y-2 rounded-xl border border-line bg-card p-4 pl-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-line2 hover:shadow-lg hover:shadow-dark/5 lg:grid-cols-[minmax(0,1.6fr)_auto_minmax(0,1fr)]"
              style={{ animationDelay: `${Math.min(i * 45, 400)}ms` }}
              onClick={() => nav({ kind: "project", id: p.id, tab: "structure" })}
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className={cx("mt-1 h-2.5 w-2.5 shrink-0 rounded-[3px]", d.dot)} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11.5px] font-bold text-mute">{p.number}</span>
                    <Badge cls={d.badge}>{d.label}</Badge>
                    <Badge cls={st.cls}>{st.label}</Badge>
                  </div>
                  <h3 className="mt-1 truncate text-[14.5px] font-bold text-ink transition-colors group-hover:text-accent-deep">
                    {p.title}
                  </h3>
                  <p className="mt-0.5 truncate text-[12.5px] text-mute">
                    {p.client || "Заказчик не указан"} · обновлено {fmtDate(p.updatedAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 lg:justify-self-end">
                <div className="text-right">
                  <div className="font-mono text-[16px] font-bold text-ink tabular-nums">{fmtMoney(calc.total)}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-mute">
                    {p.cabinets.length} {plural(p.cabinets.length, "шкаф", "шкафа", "шкафов")} · {calc.posCount}{" "}
                    {plural(calc.posCount, "позиция", "позиции", "позиций")}
                  </div>
                </div>
                <Badge cls={marginTone}>маржа {calc.marginPct.toFixed(0)}%</Badge>
              </div>

              <div className="flex items-center gap-1.5 lg:justify-self-end" onClick={(e) => e.stopPropagation()}>
                <div className="w-36">
                  <Select
                    value={p.status}
                    onChange={(v) => {
                      updateProject(p.id, { status: v as ProjectStatus });
                      toast(`Статус: ${STATUS_META[v as ProjectStatus].label}`, "info");
                    }}
                    options={(Object.keys(STATUS_META) as ProjectStatus[]).map((k) => ({ value: k, label: STATUS_META[k].label }))}
                  />
                </div>
                <IconBtn title="Открыть конструктор" onClick={() => nav({ kind: "project", id: p.id, tab: "structure" })}>
                  <IcPencil size={15} />
                </IconBtn>
                <IconBtn
                  title="Дублировать"
                  onClick={() => {
                    duplicateProject(p.id);
                    toast("Создана копия проекта");
                  }}
                >
                  <IcCopy size={15} />
                </IconBtn>
                <IconBtn title="Удалить" danger onClick={() => setDelTarget(p)}>
                  <IcTrash size={15} />
                </IconBtn>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <EmptyState
            icon={<IcFolder size={22} />}
            title={projects.length === 0 ? "Пока нет ни одного ТКП" : "Ничего не найдено"}
            text={
              projects.length === 0
                ? "Создайте первое технико-коммерческое предложение — начните с пустого проекта или типового шаблона по одному из трёх направлений."
                : "Попробуйте изменить направление или поисковый запрос."
            }
          >
            {projects.length === 0 ? (
              <Btn onClick={() => setNewOpen(true)}>
                <IcPlus size={15} /> Создать ТКП
              </Btn>
            ) : (
              <Btn variant="outline" onClick={() => { setDir("all"); setQ(""); }}>
                Сбросить фильтры
              </Btn>
            )}
          </EmptyState>
        )}
      </div>

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} nav={nav} />

      <Modal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        title="Удалить проект?"
        w="max-w-md"
        footer={
          <>
            <Btn variant="outline" onClick={() => setDelTarget(null)}>Отмена</Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (delTarget) {
                  deleteProject(delTarget.id);
                  toast("Проект удалён", "err");
                }
                setDelTarget(null);
              }}
            >
              <IcTrash size={14} /> Удалить
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          Проект <b className="font-mono">{delTarget?.number}</b> «{delTarget?.title}» будет удалён вместе со всей
          структурой оборудования и версиями. Если хотите сохранить исходный вариант — сначала сделайте дубликат.
        </p>
      </Modal>
    </div>
  );
}

/* ---------------- мастер нового ТКП ---------------- */

function NewProjectModal({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: (v: View) => void }) {
  const createProject = useStore((s) => s.createProject);
  const toast = useStore((s) => s.toast);

  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [contact, setContact] = useState("");
  const [direction, setDirection] = useState<Direction>("nku");
  const [tpl, setTpl] = useState<string>("nku-shr");

  const pickDirection = (d: Direction) => {
    setDirection(d);
    const match = TEMPLATES.find((t) => t.direction === d);
    if (!TEMPLATES.some((t) => t.key === tpl && t.direction === d)) setTpl(match?.key ?? "blank");
  };

  const submit = () => {
    if (!title.trim()) {
      toast("Укажите название предложения", "err");
      return;
    }
    const p = createProject({
      title: title.trim(),
      client: client.trim(),
      contact: contact.trim(),
      direction,
      templateKey: tpl === "blank" ? undefined : tpl,
    });
    toast(`Создано ${p.number}${tpl !== "blank" ? " по шаблону" : ""}`);
    setTitle(""); setClient(""); setContact("");
    onClose();
    nav({ kind: "project", id: p.id, tab: "structure" });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Новое технико-коммерческое предложение"
      w="max-w-2xl"
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>Отмена</Btn>
          <Btn onClick={submit}>
            <IcPlus size={14} /> Создать проект
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Название предложения" className="col-span-2">
          <Input value={title} onChange={setTitle} placeholder="Например: Реконструкция ГРЩ-0,4 кВ котельной №3" autoFocus />
        </Field>
        <Field label="Заказчик">
          <Input value={client} onChange={setClient} placeholder="ООО «Заказчик»" />
        </Field>
        <Field label="Контактное лицо">
          <Input value={contact} onChange={setContact} placeholder="Должность, ФИО" />
        </Field>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-mute uppercase">Направление</span>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(DIRECTIONS) as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pickDirection(d)}
              className={cx(
                "cursor-pointer rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.98]",
                direction === d ? "border-accent bg-accent-soft/50 shadow-sm shadow-accent/10" : "border-line bg-card hover:border-line2"
              )}
            >
              <span className={cx("flex h-8 w-8 items-center justify-center rounded-md", DIRECTIONS[d].badge)}>
                {DIR_ICON[d]({ size: 16 })}
              </span>
              <span className="mt-2 block text-[12.5px] font-bold text-ink">{DIRECTIONS[d].label}</span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-mute">{DIRECTIONS[d].full}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-mute uppercase">Стартовый шаблон</span>
        <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-1">
          <TplRow
            active={tpl === "blank"}
            onClick={() => setTpl("blank")}
            title="Пустой проект"
            desc="Структуру шкафов и оборудование соберёте вручную"
            summary="0 шкафов"
            dirKey={null}
          />
          {TEMPLATES.map((t) => (
            <TplRow
              key={t.key}
              active={tpl === t.key}
              onClick={() => setTpl(t.key)}
              title={t.title}
              desc={t.desc}
              summary={t.summary}
              dirKey={t.direction}
              dim={t.direction !== direction}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TplRow({
  active,
  onClick,
  title,
  desc,
  summary,
  dirKey,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  summary: string;
  dirKey: Direction | null;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-all duration-150 active:scale-[0.99]",
        active ? "border-accent bg-accent-soft/50" : "border-line bg-card hover:border-line2",
        dim && "opacity-55"
      )}
    >
      <span
        className={cx(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          active ? "border-accent" : "border-line2"
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-bold text-ink">{title}</span>
          {dirKey && <Badge cls={DIRECTIONS[dirKey].badge}>{DIRECTIONS[dirKey].label}</Badge>}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] text-mute">{desc}</span>
      </span>
      <span className="shrink-0 font-mono text-[10.5px] font-semibold text-mute">{summary}</span>
    </button>
  );
}
