import { useMemo, useState } from "react";
import { useStore } from "../store";
import { DIRECTIONS, NEXT_STATUS, STATUS_META, type Direction, type Project } from "../types";
import { calcProject, fmtDateShort, fmtMoney } from "../utils";
import { TEMPLATES } from "../data/templates";
import { Btn, EmptyState, Field, Input, Modal, NumInput, cx } from "./ui";
import { IcArrowLeft, IcBolt, IcBox, IcCopy, IcFolder, IcPlus, IcTrash, IcWand } from "./icons";

/* ============================================================
   ДАШБОРД: воронка проектов «в работе / выполнено / проиграно»,
   сводные метрики и мастер создания нового ТКП с шаблонами.
   ============================================================ */

type Filter = "all" | "work" | "done" | "lost";

export default function Dashboard({ onOpen }: { onOpen: (id: string) => void }) {
  const projects = useStore((s) => s.projects);
  const rates = useStore((s) => s.settings.rates);
  const duplicateProject = useStore((s) => s.duplicateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const setStatus = useStore((s) => s.setStatus);
  const toast = useStore((s) => s.toast);

  const [filter, setFilter] = useState<Filter>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Project | null>(null);

  const withCalc = useMemo(
    () => projects.map((p) => ({ p, calc: calcProject(p, rates) })),
    [projects, rates]
  );
  const work = withCalc.filter(({ p }) => p.status === "draft" || p.status === "calc" || p.status === "sent");
  const done = withCalc.filter(({ p }) => p.status === "won");
  const lost = withCalc.filter(({ p }) => p.status === "lost");

  const sum = (list: typeof withCalc) => list.reduce((s, x) => s + x.calc.total, 0);
  const conversion = done.length + lost.length > 0 ? Math.round((done.length / (done.length + lost.length)) * 100) : null;

  const shown =
    filter === "work" ? work : filter === "done" ? done : filter === "lost" ? lost : withCalc;

  const advance = (p: Project) => {
    const next = NEXT_STATUS[p.status];
    setStatus(p.id, next);
    toast(`${p.number}: статус → «${STATUS_META[next].label}»`, "info");
  };

  return (
    <div className="pb-10">
      {/* заголовок */}
      <div className="anim-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="blink-dot h-2 w-2 rounded-full bg-accent" />
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-mute uppercase">
              Портфель ТКП · {fmtDateShort(Date.now())}
            </span>
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Технико-коммерческие предложения</h1>
          <p className="mt-1 text-[13.5px] text-mute">
            НКУ · АСУ ТП / АСУ Э · Системы электрообогрева — от опросника до подписанного документа
          </p>
        </div>
        <Btn onClick={() => setWizardOpen(true)}>
          <IcPlus size={15} /> Новое ТКП
        </Btn>
      </div>

      {/* метрики */}
      <div className="anim-up mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: "70ms" }}>
        <Metric label="В работе" value={String(work.length)} sub={fmtMoney(sum(work))} accent="bg-steel" />
        <Metric label="Выполнено (выиграно)" value={String(done.length)} sub={fmtMoney(sum(done))} accent="bg-ok" />
        <Metric
          label="Конверсия"
          value={conversion === null ? "—" : `${conversion}%`}
          sub={conversion === null ? "нет завершённых" : `${done.length} из ${done.length + lost.length}`}
          accent="bg-accent"
        />
        <Metric
          label="Средний чек портфеля"
          value={withCalc.length ? fmtMoney(sum(withCalc) / withCalc.length) : "—"}
          sub={`${withCalc.length} ${withCalc.length === 1 ? "проект" : "проектов"}`}
          accent="bg-dark"
        />
      </div>

      {/* фильтры */}
      <div className="anim-up mt-6 flex flex-wrap gap-1.5" style={{ animationDelay: "120ms" }}>
        {([
          ["all", `Все · ${withCalc.length}`],
          ["work", `В работе · ${work.length}`],
          ["done", `Выполнено · ${done.length}`],
          ["lost", `Проиграно · ${lost.length}`],
        ] as [Filter, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={cx(
              "cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-all duration-150 active:scale-95",
              filter === k ? "bg-dark text-white shadow-md shadow-dark/20" : "border border-line bg-card text-ink2 hover:border-line2"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* список */}
      {shown.length === 0 ? (
        <div className="anim-up mt-6">
          <EmptyState
            icon={<IcFolder size={22} />}
            title={projects.length === 0 ? "Проектов пока нет" : "В этой категории пусто"}
            text={
              projects.length === 0
                ? "Создайте первое ТКП — можно начать с типового шаблона (щит АВР, распределительный щит, АСУ ТП или обогрев) или с чистого листа."
                : "Переключите фильтр или создайте новый проект."
            }
          >
            {projects.length === 0 && (
              <>
                <Btn onClick={() => setWizardOpen(true)}>
                  <IcPlus size={15} /> Создать ТКП
                </Btn>
                <DemoBtn />
              </>
            )}
          </EmptyState>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ p, calc }, i) => {
            const d = DIRECTIONS[p.direction];
            const st = STATUS_META[p.status];
            const confirming = delTarget?.id === p.id;
            return (
              <div
                key={p.id}
                className={cx(
                  "anim-up group flex flex-col rounded-xl border bg-card p-4 transition-all duration-200",
                  p.status === "won" ? "border-ok/40 hover:shadow-lg hover:shadow-ok/10" : "border-line hover:border-line2 hover:shadow-lg hover:shadow-dark/5"
                )}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span className={cx("rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide uppercase", d.chip)}>{d.label}</span>
                  <span className="font-mono text-[10.5px] font-semibold text-mute">{p.number}</span>
                  <button
                    onClick={() => advance(p)}
                    title="Сменить статус"
                    className={cx("ml-auto flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold transition-transform hover:scale-105 active:scale-95", st.cls)}
                  >
                    <span className={cx("h-1.5 w-1.5 rounded-full", st.dot)} />
                    {st.label}
                  </button>
                </div>

                <button onClick={() => onOpen(p.id)} className="mt-2.5 cursor-pointer text-left">
                  <div className="text-[15px] leading-snug font-bold text-ink transition-colors group-hover:text-accent-deep">
                    {p.title}
                  </div>
                  <div className="mt-0.5 text-[12px] text-mute">{p.client || "Заказчик не указан"}</div>
                </button>

                <div className="mt-3 flex items-end justify-between border-t border-line/70 pt-3">
                  <div>
                    <div className="font-mono text-[17px] font-bold text-ink tabular-nums">{calc.total > 0 ? fmtMoney(calc.total) : "—"}</div>
                    <div className="text-[10.5px] font-semibold text-mute">
                      {p.cabinets.length > 0
                        ? `${p.cabinets.length} ${p.cabinets.length === 1 ? "шкаф" : "шкафов"} · ${calc.posCount} поз. · обновлён ${fmtDateShort(p.updatedAt)}`
                        : `пустой · обновлён ${fmtDateShort(p.updatedAt)}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      title="Дублировать"
                      onClick={() => {
                        const nid = duplicateProject(p.id);
                        if (nid) toast("Копия проекта создана");
                      }}
                      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-mute transition-colors hover:bg-paper hover:text-ink"
                    >
                      <IcCopy size={14} />
                    </button>
                    {confirming ? (
                      <button
                        onClick={() => {
                          deleteProject(p.id);
                          setDelTarget(null);
                          toast("Проект удалён", "err");
                        }}
                        className="anim-scale h-7 cursor-pointer rounded-md bg-heat px-2 text-[10.5px] font-bold text-white"
                      >
                        Точно?
                      </button>
                    ) : (
                      <button
                        title="Удалить"
                        onClick={() => setDelTarget(p)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-mute transition-colors hover:bg-heat-soft hover:text-heat"
                      >
                        <IcTrash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewProjectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onCreated={(id) => { setWizardOpen(false); onOpen(id); }} />
    </div>
  );

  // небольшая хитрость: Tabs возвращает string
  function setCount(k: string) {
    setFilter(k as Filter);
  }
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-card p-4">
      <span className={cx("absolute top-0 left-0 h-full w-1", accent)} />
      <div className="text-[10.5px] font-bold tracking-wide text-mute uppercase">{label}</div>
      <div className="mt-1 font-mono text-[20px] leading-none font-bold text-ink tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11px] font-semibold text-mute">{sub}</div>
    </div>
  );
}

function DemoBtn() {
  const createProject = useStore((s) => s.createProject);
  const toast = useStore((s) => s.toast);
  return (
    <Btn variant="outline" onClick={() => {
      createProject({
        title: "Щит АВР для насосной станции №3",
        client: "ООО «Водоканал-Сервис»",
        contact: "гл. энергетик Морозов К.П.",
        direction: "nku",
        templateKey: "nku-avr",
        markup: 18,
        validDays: 30,
      });
      toast("Демо-проект создан");
    }}>
      <IcWand size={14} /> Демо-данные
    </Btn>
  );
}

/* ---------------- мастер нового ТКП ---------------- */

function NewProjectWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const createProject = useStore((s) => s.createProject);
  const toast = useStore((s) => s.toast);
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [contact, setContact] = useState("");
  const [direction, setDirection] = useState<Direction>("nku");
  const [tpl, setTpl] = useState<string>("");
  const [markup, setMarkup] = useState(15);
  const [validDays, setValidDays] = useState(30);
  const [err, setErr] = useState("");

  const tpls = TEMPLATES.filter((t) => t.direction === direction);
  const valid = title.trim().length > 0 && client.trim().length > 0;

  const create = () => {
    if (!valid) {
      setErr("Укажите название и заказчика — без них нельзя завести ТКП");
      return;
    }
    const id = createProject({ title: title.trim(), client: client.trim(), contact: contact.trim(), direction, templateKey: tpl || null, markup, validDays });
    toast(`ТКП создано${tpl ? " по шаблону" : ""}`);
    setTitle(""); setClient(""); setContact(""); setTpl(""); setErr("");
    onCreated(id);
  };

  return (
    <Modal
      open={open}
      onClose={() => { setErr(""); onClose(); }}
      title="Новое технико-коммерческое предложение"
      w="max-w-3xl"
      footer={
        <>
          <Btn variant="outline" onClick={onClose}><IcArrowLeft size={14} /> Отмена</Btn>
          <Btn disabled={!valid} onClick={create}><IcPlus size={14} /> Создать ТКП</Btn>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Название проекта" className="md:col-span-2">
          <Input value={title} onChange={(v) => { setTitle(v); setErr(""); }} placeholder="Например: ГРЩ 250А для цеха розлива" autoFocus />
        </Field>
        <Field label="Заказчик (организация)">
          <Input value={client} onChange={(v) => { setClient(v); setErr(""); }} placeholder="ООО «Промтех»" />
        </Field>
        <Field label="Контактное лицо">
          <Input value={contact} onChange={setContact} placeholder="Иванов И.И., гл. энергетик" />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Направление">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(DIRECTIONS) as Direction[]).map((d) => {
              const m = DIRECTIONS[d];
              const active = direction === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setDirection(d); setTpl(""); }}
                  className={cx(
                    "cursor-pointer rounded-lg border p-2.5 text-left transition-all duration-150 active:scale-[0.98]",
                    active ? "border-accent bg-accent-soft/60 shadow-sm" : "border-line hover:border-line2"
                  )}
                >
                  <span className={cx("rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide uppercase", active ? m.chip : "bg-paper text-mute")}>{m.label}</span>
                  <div className="mt-1.5 text-[11px] leading-tight font-semibold text-ink2">{m.full}</div>
                </button>
              );
            })}
          </div>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Стартовый шаблон (можно изменить в конструкторе)">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setTpl("")}
              className={cx(
                "cursor-pointer rounded-lg border p-2.5 text-left transition-all active:scale-[0.99]",
                tpl === "" ? "border-accent bg-accent-soft/60" : "border-line hover:border-line2"
              )}
            >
              <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
                <IcBox size={13} /> Пустой проект
              </div>
              <div className="text-[10.5px] text-mute">собрать с нуля, можно через мастер подбора</div>
            </button>
            {tpls.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTpl(t.key)}
                className={cx(
                  "cursor-pointer rounded-lg border p-2.5 text-left transition-all active:scale-[0.99]",
                  tpl === t.key ? "border-accent bg-accent-soft/60" : "border-line hover:border-line2"
                )}
              >
                <div className="text-[12.5px] font-bold text-ink">{t.title}</div>
                <div className="text-[10.5px] leading-snug text-mute">{t.summary}</div>
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Наценка на оборудование, %">
          <NumInput value={markup} onChange={(v) => setMarkup(Math.max(0, Math.min(200, v)))} step={1} />
        </Field>
        <Field label="Срок действия предложения, дней">
          <NumInput value={validDays} onChange={(v) => setValidDays(Math.max(1, Math.round(v)))} step={5} />
        </Field>
      </div>

      {err && <div className="anim-scale mt-3 rounded-md bg-heat-soft px-3 py-2 text-[12px] font-semibold text-heat">{err}</div>}
    </Modal>
  );
}
