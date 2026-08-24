import { useState, type ReactNode } from "react";
import { useStore } from "../store";
import type { Project } from "../types";
import { DIRECTIONS, NEXT_STATUS, STATUS_META } from "../types";
import { calcProject, downloadText, fmtDateTime, fmtMoney, fmtMoney2 } from "../utils";
import { summarize, validateProject } from "../utils/rules";
import { exportProjectXlsx } from "../utils/excel";
import StructureTab from "./StructureTab";
import DocumentTab from "./DocumentTab";
import Wizard from "./Wizard";
import { Btn, Field, NumInput, Toggle, cx } from "./ui";
import {
  IcArrowLeft, IcCheck, IcClock, IcCopy, IcDoc, IcLayers, IcPlus, IcTable, IcTrash, IcWand,
} from "./icons";

/* ============================================================
   РЕДАКТОР ПРОЕКТА: шапка, вкладки (Структура / Документ /
   Версии), панель экономики проекта и запуск мастера подбора.
   ============================================================ */

type Tab = "structure" | "doc" | "versions";

export default function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const project = useStore((s) => s.projects.find((p) => p.id === id));
  const rates = useStore((s) => s.settings.rates);
  const catalog = useStore((s) => s.catalog);
  const [tab, setTab] = useState<Tab>("structure");
  const [wizardOpen, setWizardOpen] = useState(false);

  if (!project) {
    return (
      <div className="py-20 text-center">
        <p className="text-[14px] font-semibold text-mute">Проект не найден (возможно, удалён).</p>
        <Btn variant="outline" className="mt-4" onClick={onBack}>
          <IcArrowLeft size={14} /> К дашборду
        </Btn>
      </div>
    );
  }

  const calc = calcProject(project, rates);
  const dir = DIRECTIONS[project.direction];
  const issueSum = summarize(validateProject({ catalog, project }));
  const structureProblems = issueSum.error + issueSum.warn;

  return (
    <div className="pb-10">
      {/* -------- шапка проекта -------- */}
      <div className="anim-up flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          title="К списку проектов"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-line bg-card text-ink2 transition-all hover:border-line2 hover:shadow-sm active:scale-95"
        >
          <IcArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-dark px-2 py-0.5 font-mono text-[11px] font-bold text-white">{project.number}</span>
            <span className={cx("rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide uppercase", dir.chip)}>{dir.label}</span>
            <StatusBadge project={project} />
            <span className="text-[10.5px] font-semibold text-mute">обновлён {fmtDateTime(project.updatedAt)}</span>
          </div>
          <TitleInput project={project} />
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={() => {
            exportProjectXlsx(project, calc, useStore.getState().settings);
            useStore.getState().toast("Excel-книга сформирована: шкафы + ИТОГО + Расчёт + Бюджет");
          }}>
            <IcTable size={14} /> Excel
          </Btn>
          <Btn variant="outline" size="sm" onClick={() => {
            downloadText(`${project.number}.tkp.json`, JSON.stringify(project, null, 2), "application/json");
            useStore.getState().toast("Проект выгружен в JSON (резервная копия)");
          }}>
            <IcDoc size={14} /> JSON
          </Btn>
        </div>
      </div>

      {/* -------- вкладки -------- */}
      <div className="anim-up mt-4 flex gap-1.5" style={{ animationDelay: "60ms" }}>
        {([
          ["structure", (
            <span key="l" className="flex items-center gap-1.5">
              Структура и состав
              {structureProblems > 0 && (
                <span
                  className={cx(
                    "rounded-full px-1.5 py-px font-mono text-[10px] font-bold leading-tight",
                    tab === "structure" ? "bg-white/20 text-white" : issueSum.error ? "bg-heat text-white" : "bg-warn text-white"
                  )}
                  title={issueSum.error ? "Есть ошибки совместимости" : "Есть предупреждения"}
                >
                  {structureProblems}
                </span>
              )}
            </span>
          ), <IcLayers size={13} key="i" />],
          ["doc", "Документ ТКП", <IcDoc size={13} key="i" />],
          ["versions", `Версии · ${project.versions.length}`, <IcClock size={13} key="i" />],
        ] as [Tab, ReactNode, JSX.Element][]).map(([k, label, icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cx(
              "flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-bold transition-all duration-150 active:scale-95",
              tab === k ? "bg-dark text-white shadow-md shadow-dark/20" : "border border-line bg-card text-ink2 hover:border-line2"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* -------- контент + экономика -------- */}
      <div className="mt-4 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {tab === "structure" && <StructureTab project={project} onOpenWizard={() => setWizardOpen(true)} />}
          {tab === "doc" && <DocumentTab project={project} />}
          {tab === "versions" && <VersionsTab project={project} />}
        </div>
        {tab !== "doc" && <CalcPanel project={project} calc={calc} />}
      </div>

      {wizardOpen && <Wizard project={project} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}

/* ---------------- статус ---------------- */

function StatusBadge({ project }: { project: Project }) {
  const setStatus = useStore((s) => s.setStatus);
  const toast = useStore((s) => s.toast);
  const st = STATUS_META[project.status];
  return (
    <button
      title="Следующий статус по воронке"
      onClick={() => {
        const next = NEXT_STATUS[project.status];
        setStatus(project.id, next);
        toast(`Статус: «${STATUS_META[next].label}»`, "info");
      }}
      className={cx("flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition-transform hover:scale-105 active:scale-95", st.cls)}
    >
      <span className={cx("h-1.5 w-1.5 rounded-full", st.dot)} />
      {st.label}
    </button>
  );
}

function TitleInput({ project }: { project: Project }) {
  const updateProject = useStore((s) => s.updateProject);
  return (
    <input
      className="mt-1 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-display text-[19px] font-bold tracking-tight text-ink outline-none transition-all hover:border-line hover:bg-card focus:border-accent focus:bg-card"
      value={project.title}
      onChange={(e) => updateProject(project.id, { title: e.target.value })}
    />
  );
}

/* ---------------- панель экономики ---------------- */

function CalcPanel({ project, calc }: { project: Project; calc: ReturnType<typeof calcProject> }) {
  const updateProject = useStore((s) => s.updateProject);
  const up = (patch: Partial<Project>) => updateProject(project.id, patch);

  const Row = ({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) => (
    <div className={cx("flex items-center justify-between py-[3px] text-[12px]", bold && "font-bold")}>
      <span className={bold ? "text-ink" : "text-mute"}>{label}</span>
      <span className={cx("font-mono tabular-nums", accent ? "text-[15px] font-bold text-accent-deep" : bold ? "text-ink" : "text-ink2")}>{value}</span>
    </div>
  );

  const marginTone = calc.marginPct >= 15 ? "text-ok" : calc.marginPct >= 5 ? "text-warn" : "text-heat";

  return (
    <aside id="app-aside" className="flex flex-col gap-3 xl:sticky xl:top-6">
      <div className="anim-up rounded-xl border border-line bg-card p-4" style={{ animationDelay: "90ms" }}>
        <div className="mb-2 text-[10.5px] font-bold tracking-wide text-mute uppercase">Продажа</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Наценка, %"><NumInput value={project.markup} step={1} onChange={(v) => up({ markup: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Наценка работ, %"><NumInput value={project.workMarkup} step={1} onChange={(v) => up({ workMarkup: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Скидка, %"><NumInput value={project.discount} step={0.5} onChange={(v) => up({ discount: Math.min(90, Math.max(0, v)) })} className="h-8 text-[12px]" /></Field>
          <Field label="НДС, %"><NumInput value={project.vatRate} step={1} onChange={(v) => up({ vatRate: Math.min(40, Math.max(0, v)) })} className="h-8 text-[12px]" /></Field>
          <Field label="Доставка, % от оборуд."><NumInput value={project.transportPct} step={0.5} onChange={(v) => up({ transportPct: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Срок действия, дней"><NumInput value={project.validDays} step={5} onChange={(v) => up({ validDays: Math.max(1, Math.round(v)) })} className="h-8 text-[12px]" /></Field>
        </div>
        <div className="mt-2.5">
          <Toggle on={project.showWorkLines} onChange={(v) => up({ showWorkLines: v })} label="Работы отдельной строкой в ТКП" />
        </div>
      </div>

      <div className="anim-up rounded-xl border border-line bg-card p-4" style={{ animationDelay: "130ms" }}>
        <div className="mb-2 text-[10.5px] font-bold tracking-wide text-mute uppercase">Услуги (отдельные строки)</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="СМР: себест., ₽"><NumInput value={project.smrCost} step={1000} onChange={(v) => up({ smrCost: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="СМР: продажа, ₽"><NumInput value={project.smrSell} step={1000} onChange={(v) => up({ smrSell: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="ПНР: себест., ₽"><NumInput value={project.pnrCost} step={1000} onChange={(v) => up({ pnrCost: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="ПНР: продажа, ₽"><NumInput value={project.pnrSell} step={1000} onChange={(v) => up({ pnrSell: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
        </div>
      </div>

      <div className="anim-up rounded-xl border border-line bg-card p-4" style={{ animationDelay: "170ms" }}>
        <div className="mb-2 text-[10.5px] font-bold tracking-wide text-mute uppercase">Себестоимость (план)</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ТЗР, %"><NumInput value={project.tzzPct} step={0.5} onChange={(v) => up({ tzzPct: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Непредвид., %"><NumInput value={project.unforeseenPct} step={0.5} onChange={(v) => up({ unforeseenPct: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Сторонние, ₽"><NumInput value={project.thirdParty} step={1000} onChange={(v) => up({ thirdParty: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Доп. затраты, ₽"><NumInput value={project.extraCosts} step={1000} onChange={(v) => up({ extraCosts: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
          <Field label="Командировки, ₽"><NumInput value={project.tripCosts} step={1000} onChange={(v) => up({ tripCosts: Math.max(0, v) })} className="h-8 text-[12px]" /></Field>
        </div>
      </div>

      {/* итоги */}
      <div className="anim-up rounded-xl border border-line bg-dark p-4 text-white shadow-lg shadow-dark/20" style={{ animationDelay: "210ms" }}>
        <div className="mb-1.5 text-[10.5px] font-bold tracking-wide text-darkmute uppercase">Сводка предложения</div>
        <Row label="Оборудование" value={fmtMoney2(calc.eqBase)} />
        <Row label={`Наценка ${project.markup}%`} value={fmtMoney2(calc.markupSum)} />
        <Row label="Работы (сборка+проект+ПО)" value={fmtMoney2(calc.laborSell)} />
        {(project.smrSell > 0 || project.pnrSell > 0) && <Row label="СМР и ПНР" value={fmtMoney2(project.smrSell + project.pnrSell)} />}
        {calc.transportSum > 0 && <Row label="Доставка" value={fmtMoney2(calc.transportSum)} />}
        {project.discount > 0 && <Row label={`Скидка ${project.discount}%`} value={`− ${fmtMoney2(calc.discountSum)}`} />}
        <Row label={project.vatRate > 0 ? `НДС ${project.vatRate}%` : "НДС"} value={project.vatRate > 0 ? fmtMoney2(calc.vatSum) : "без НДС"} />
        <div className="mt-2 border-t border-darkline pt-2">
          <div className={cx("flex items-center justify-between", calc.total > 0 && "tick-pulse")} key={Math.round(calc.total)}>
            <span className="text-[12.5px] font-bold">ИТОГО</span>
            <span className="font-mono text-[19px] font-bold tabular-nums">{fmtMoney(calc.total)}</span>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-dark2 p-2.5">
          <Row label="Себестоимость" value={fmtMoney2(calc.totalCost)} />
          <Row label="ФОТ (трудозатраты)" value={`${calc.laborHours.toFixed(0)} ч · ${fmtMoney2(calc.laborCost)}`} />
          <Row label="Прибыль" value={fmtMoney2(calc.profit)} bold />
          <div className="mt-1 flex items-center justify-between border-t border-darkline pt-1.5">
            <span className="text-[11px] font-semibold text-darkmute">Рентабельность</span>
            <span className={cx("font-mono text-[13px] font-bold tabular-nums", marginTone)}>{calc.marginPct.toFixed(1)} %</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-darkmute">Наценка к себест.</span>
            <span className={cx("font-mono text-[13px] font-bold tabular-nums", marginTone)}>{calc.markupPct.toFixed(1)} %</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- версии ---------------- */

function VersionsTab({ project }: { project: Project }) {
  const saveVersion = useStore((s) => s.saveVersion);
  const restoreVersion = useStore((s) => s.restoreVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const toast = useStore((s) => s.toast);
  const [label, setLabel] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);

  const currentTotal = calcProject(project, useStore.getState().settings.rates).total;

  return (
    <div className="anim-up flex flex-col gap-3">
      <div className="rounded-xl border border-line bg-card p-4">
        <div className="text-[13px] font-bold text-ink">Снимок текущей версии</div>
        <p className="mt-0.5 text-[11.5px] text-mute">
          Сохраняет структуру и цены как отдельную версию — например, до правок по просьбе заказчика. Текущая сумма:{" "}
          <b className="font-mono text-ink">{fmtMoney(currentTotal)}</b>
        </p>
        <div className="mt-2.5 flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={`Версия ${project.versions.length + 1} — например, «после звонка заказчику»`}
            className="h-9 flex-1 rounded-md border border-line bg-card px-3 text-[12.5px] outline-none focus:border-accent"
          />
          <Btn size="sm" onClick={() => { saveVersion(project.id, label.trim()); setLabel(""); toast("Версия сохранена"); }}>
            <IcPlus size={14} /> Сохранить
          </Btn>
        </div>
      </div>

      {project.versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line2 bg-card/60 px-4 py-8 text-center text-[12.5px] text-mute">
          Версий пока нет. Снимок не заменяет текущую работу — можно спокойно экспериментировать.
        </div>
      ) : (
        project.versions.map((v) => (
          <div key={v.id} className="anim-up rounded-xl border border-line bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-steel-soft text-steel">
                <IcCopy size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-ink">{v.label}</div>
                <div className="font-mono text-[10.5px] text-mute">
                  {fmtDateTime(v.ts)} · {v.cabinets.length} шкаф(ов) · оборудование {fmtMoney(v.calc.eqBase)}
                </div>
              </div>
              <span className={cx("font-mono text-[12.5px] font-bold tabular-nums", Math.abs(v.calc.total - currentTotal) < 1 ? "text-mute" : v.calc.total >= currentTotal ? "text-ok" : "text-heat")}>
                {fmtMoney(v.calc.total)}
                {Math.abs(v.calc.total - currentTotal) >= 1 && (
                  <span className="ml-1 text-[10px] font-semibold">
                    ({v.calc.total >= currentTotal ? "+" : "−"}
                    {fmtMoney(Math.abs(v.calc.total - currentTotal))} к тек.)
                  </span>
                )}
              </span>
              {confirm === v.id ? (
                <span className="anim-scale flex gap-1">
                  <button
                    className="cursor-pointer rounded-md bg-warn px-2.5 py-1.5 text-[11px] font-bold text-white"
                    onClick={() => { restoreVersion(project.id, v.id); setConfirm(null); toast("Версия восстановлена в структуру", "info"); }}
                  >
                    Восстановить?
                  </button>
                  <button className="cursor-pointer rounded-md border border-line px-2 py-1.5 text-[11px] font-bold text-mute" onClick={() => setConfirm(null)}>
                    Нет
                  </button>
                </span>
              ) : (
                <span className="flex gap-1">
                  <Btn variant="outline" size="sm" onClick={() => setConfirm(v.id)}>
                    <IcCheck size={13} /> Вернуть
                  </Btn>
                  <button
                    title="Удалить версию"
                    onClick={() => { deleteVersion(project.id, v.id); toast("Версия удалена", "err"); }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-mute transition-colors hover:bg-heat-soft hover:text-heat"
                  >
                    <IcTrash size={14} />
                  </button>
                </span>
              )}
            </div>
          </div>
        ))
      )}

      <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12px] leading-relaxed text-ink2">
        <b>Подсказка:</b> заказчик попросил изменить цены — сохраните версию, правьте текущую структуру. В любой момент
        можно вернуться к прежнему варианту одним кликом.
        <span className="ml-1 inline-flex items-center gap-1 font-semibold text-warn">
          <IcWand size={12} /> Мастер подбора тоже оставляет структуру редактируемой.
        </span>
      </div>
    </div>
  );
}
