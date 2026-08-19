import { useState } from "react";
import type { Tab, View } from "../App";
import { useStore } from "../store";
import type { Project } from "../types";
import { DIRECTIONS } from "../types";
import { calcProject, fmtDate, fmtDateTime, fmtMoney, fmtMoney2 } from "../utils";
import { Badge, Btn, Field, IconBtn, Input, Modal, NumInput, Seg, Textarea, Toggle, cx } from "./ui";
import { IcAlert, IcArrowLeft, IcCalc, IcClock, IcRefresh, IcTrash } from "./icons";
import StructureTab from "./StructureTab";
import DocumentTab from "./DocumentTab";

export default function Editor({
  project,
  tab,
  setTab,
  nav,
}: {
  project: Project;
  tab: Tab;
  setTab: (t: Tab) => void;
  nav: (v: View) => void;
}) {
  const updateProject = useStore((s) => s.updateProject);
  const saveVersion = useStore((s) => s.saveVersion);
  const restoreVersion = useStore((s) => s.restoreVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const toast = useStore((s) => s.toast);

  const calc = calcProject(project);
  const dir = DIRECTIONS[project.direction];

  const [calcOpen, setCalcOpen] = useState(false);
  const [verOpen, setVerOpen] = useState(false);
  const [verLabel, setVerLabel] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  return (
    <div className="pb-10">
      {/* ---------------- шапка проекта ---------------- */}
      <div className="anim-up flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={() => nav({ kind: "dashboard" })}
            className="mb-2 inline-flex cursor-pointer items-center gap-1.5 text-[12px] font-bold text-mute transition-colors hover:text-accent-deep"
          >
            <IcArrowLeft size={14} /> Все проекты
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] font-bold text-mute">{project.number}</span>
            <Badge cls={dir.badge}>{dir.label}</Badge>
          </div>
          <input
            className="mt-1 -mx-1.5 w-full max-w-xl rounded-md border border-transparent bg-transparent px-1.5 font-display text-[19px] font-bold tracking-tight text-ink outline-none transition-all duration-150 hover:border-line hover:bg-card focus:border-accent focus:bg-card focus:ring-2 focus:ring-accent/15"
            value={project.title}
            onChange={(e) => updateProject(project.id, { title: e.target.value })}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-mute">
            <span>Заказчик:</span>
            <input
              className="w-56 rounded border border-transparent bg-transparent px-1 font-semibold text-ink2 outline-none transition-all hover:border-line hover:bg-card focus:border-accent focus:bg-card"
              value={project.client}
              placeholder="укажите заказчика"
              onChange={(e) => updateProject(project.id, { client: e.target.value })}
            />
            <span>· от {fmtDate(project.createdAt)}</span>
            <span>· действительно {project.validDays} дн.</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10.5px] font-bold tracking-wide text-mute uppercase">Итого{project.vat ? " с НДС" : ""}</div>
          <div key={Math.round(calc.total)} className="tick-pulse font-mono text-[26px] font-bold tracking-tight text-ink tabular-nums">
            {fmtMoney(calc.total)}
          </div>
          <div className="mt-1 flex items-center justify-end gap-2">
            <Badge cls={calc.marginPct >= 22 ? "bg-ok-soft text-ok" : calc.marginPct >= 12 ? "bg-warn-soft text-warn" : "bg-heat-soft text-heat"}>
              маржа {calc.marginPct.toFixed(1)} %
            </Badge>
            <span className="font-mono text-[11px] text-mute">{calc.posCount} поз.</span>
          </div>
        </div>
      </div>

      {/* ---------------- сводка расчёта ---------------- */}
      <div className="anim-up mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-6" style={{ animationDelay: "60ms" }}>
        {[
          { l: "Оборудование", v: calc.eqBase },
          { l: `Наценка ${project.markup}%`, v: calc.markupSum },
          { l: "Сборка и монтаж", v: calc.work },
          { l: `Скидка ${project.discount}%`, v: -calc.discountSum, neg: true },
          { l: "НДС 20%", v: calc.vatSum },
          { l: "Прибыль", v: calc.profit },
        ].map((x) => (
          <div key={x.l} className="bg-card px-3.5 py-2.5 transition-colors hover:bg-paper/70">
            <div className="truncate text-[10px] font-bold tracking-wide text-mute uppercase">{x.l}</div>
            <div className={cx("mt-0.5 font-mono text-[13.5px] font-bold tabular-nums", x.neg ? "text-heat" : "text-ink")}>
              {x.v < 0 ? "− " : ""}
              {fmtMoney(Math.abs(x.v))}
            </div>
          </div>
        ))}
      </div>

      {/* ---------------- панель вкладок ---------------- */}
      <div className="anim-up mt-5 flex flex-wrap items-center justify-between gap-3" style={{ animationDelay: "100ms" }}>
        <Seg
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={[
            { value: "structure", label: "Структура" },
            { value: "doc", label: "Документ" },
            { value: "versions", label: `Версии · ${project.versions.length}` },
          ]}
        />
        <div className="flex items-center gap-2">
          <Btn variant="outline" size="sm" onClick={() => setCalcOpen(true)}>
            <IcCalc size={14} /> Параметры расчёта
          </Btn>
          <Btn variant="dark" size="sm" onClick={() => { setVerLabel(`Версия ${project.versions.length + 1}`); setVerOpen(true); }}>
            <IcClock size={14} /> Сохранить версию
          </Btn>
        </div>
      </div>

      {/* ---------------- контент ---------------- */}
      <div className="mt-4">
        {tab === "structure" && <StructureTab project={project} />}
        {tab === "doc" && <DocumentTab project={project} />}

        {tab === "versions" && (
          <div className="anim-up">
            <div className="mb-3 rounded-xl border border-steel/25 bg-steel-soft/60 px-4 py-3 text-[12.5px] leading-relaxed text-steel">
              Версии фиксируют структуру оборудования и параметры расчёта на момент сохранения. Заказчик попросил
              пересчитать цены? Сохраните текущий вариант как новую версию и правьте смело — предыдущий всегда можно восстановить.
            </div>
            {project.versions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line2 bg-card/60 px-6 py-10 text-center">
                <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-dark text-accent">
                  <IcClock size={18} />
                </span>
                <p className="text-[13.5px] font-bold text-ink">Сохранённых версий пока нет</p>
                <p className="mt-1 text-[12.5px] text-mute">Нажмите «Сохранить версию» — снимок появится здесь.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {project.versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="anim-up group flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-card px-4 py-3 transition-all duration-200 hover:border-line2 hover:shadow-md hover:shadow-dark/5"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-dark font-mono text-[12px] font-bold text-accent">
                      v{project.versions.length - i}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-ink">{v.label}</div>
                      <div className="text-[11.5px] text-mute">
                        {fmtDateTime(v.createdAt)} · {v.cabinets.length} шкаф(ов) · {v.cabinets.reduce((s, c) => s + c.items.length, 0)} поз.
                      </div>
                    </div>
                    <div className="font-mono text-[15px] font-bold text-ink tabular-nums">{fmtMoney(v.total)}</div>
                    <div className="flex gap-1">
                      <IconBtn title="Восстановить эту версию" onClick={() => setRestoreTarget(v.id)}>
                        <IcRefresh size={15} />
                      </IconBtn>
                      <IconBtn
                        title="Удалить версию"
                        danger
                        onClick={() => {
                          deleteVersion(project.id, v.id);
                          toast("Версия удалена", "err");
                        }}
                      >
                        <IcTrash size={15} />
                      </IconBtn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------- параметры расчёта ---------------- */}
      <CalcModal open={calcOpen} onClose={() => setCalcOpen(false)} project={project} />

      {/* ---------------- сохранение версии ---------------- */}
      <Modal
        open={verOpen}
        onClose={() => setVerOpen(false)}
        title="Сохранить версию ТКП"
        w="max-w-md"
        footer={
          <>
            <Btn variant="outline" onClick={() => setVerOpen(false)}>Отмена</Btn>
            <Btn
              onClick={() => {
                saveVersion(project.id, verLabel.trim());
                toast(`Сохранена версия «${verLabel.trim() || `Версия ${project.versions.length + 1}`}» (${fmtMoney(calc.total)})`);
                setVerOpen(false);
              }}
            >
              <IcClock size={14} /> Сохранить снимок
            </Btn>
          </>
        }
      >
        <Field label="Название версии">
          <Input value={verLabel} onChange={setVerLabel} autoFocus placeholder="Например: после просьбы снизить цену" />
        </Field>
        <div className="mt-3 rounded-lg bg-paper px-3.5 py-2.5 font-mono text-[12px] text-ink2">
          Сумма снимка: <b className="text-ink">{fmtMoney2(calc.total)}</b> · позиций: {calc.posCount}
        </div>
      </Modal>

      {/* ---------------- подтверждение восстановления ---------------- */}
      <Modal
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        title="Восстановить версию?"
        w="max-w-md"
        footer={
          <>
            <Btn variant="outline" onClick={() => setRestoreTarget(null)}>Отмена</Btn>
            <Btn
              onClick={() => {
                if (restoreTarget) {
                  restoreVersion(project.id, restoreTarget);
                  toast("Версия восстановлена", "info");
                }
                setRestoreTarget(null);
              }}
            >
              <IcRefresh size={14} /> Восстановить
            </Btn>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-warn"><IcAlert size={20} /></span>
          <p className="text-[13px] leading-relaxed text-ink2">
            Текущая структура и параметры расчёта будут заменены данными выбранной версии. Если текущий вариант ценен —
            сначала сохраните его как отдельную версию.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- модалка параметров расчёта ---------------- */

function CalcModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const updateProject = useStore((s) => s.updateProject);
  const toast = useStore((s) => s.toast);
  const [f, setF] = useState({
    markup: project.markup,
    hourRate: project.hourRate,
    complexity: project.complexity,
    discount: project.discount,
    validDays: project.validDays,
    vat: project.vat,
    notes: project.notes,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Параметры расчёта и условия"
      w="max-w-xl"
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>Отмена</Btn>
          <Btn
            onClick={() => {
              updateProject(project.id, f);
              toast("Параметры расчёта обновлены");
              onClose();
            }}
          >
            <IcCalc size={14} /> Применить
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Наценка на оборудование, %">
          <NumInput value={f.markup} onChange={(v) => setF({ ...f, markup: v })} step={0.5} />
        </Field>
        <Field label="Скидка по предложению, %">
          <NumInput value={f.discount} onChange={(v) => setF({ ...f, discount: v })} step={0.5} />
        </Field>
        <Field label="Ставка нормо-часа, ₽">
          <NumInput value={f.hourRate} onChange={(v) => setF({ ...f, hourRate: v })} step={10} />
        </Field>
        <Field label="Коэфф. сложности сборки" hint="× к нормо-часам каждого шкафа">
          <NumInput value={f.complexity} onChange={(v) => setF({ ...f, complexity: v })} step={0.05} />
        </Field>
        <Field label="Срок действия, дней">
          <NumInput value={f.validDays} onChange={(v) => setF({ ...f, validDays: v })} min={1} />
        </Field>
        <div className="flex items-end">
          <Toggle on={f.vat} onChange={(v) => setF({ ...f, vat: v })} label="НДС 20 % сверху" />
        </div>
      </div>
      <div className="mt-3">
        <Field label="Условия предложения (попадают в документ)">
          <Textarea rows={4} value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
        </Field>
      </div>
      <p className="mt-3 rounded-md bg-paper px-3 py-2 font-mono text-[11.5px] leading-relaxed text-ink2">
        Формула: (цена × кол-во) + наценка % + нормо-часы × ставка × сложность → скидка % → НДС
      </p>
    </Modal>
  );
}
