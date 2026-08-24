import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Direction, Equipment, Project } from "../types";
import { DIRECTIONS } from "../types";
import { calcProject, fmtMoney, plural } from "../utils";
import {
  SEVERITY_META, summarize, validateCabinet, validateProject, type Issue, type ValidateCtx,
} from "../utils/rules";
import { Badge, Btn, EmptyState, Field, IconBtn, Input, Modal, NumInput, Select, Stepper, cx } from "./ui";
import { IcAlert, IcCheck, IcChevronDown, IcLayers, IcPlus, IcSearch, IcTrash, IcWand } from "./icons";

/* ============================================================
   ВКЛАДКА «СТРУКТУРА»: дерево шкафов (аккордеон), inline-правка
   количеств/цен/трудозатрат, итоги по каждому шкафу и панель
   справочника СЛЕВА-СПРАВА — оборудование видно из ЛЮБОГО
   направления (ПЛК можно поставить и в щит АВР).
   ============================================================ */

type DirFilter = "all" | Direction | "uni";

export default function StructureTab({ project, onOpenWizard }: { project: Project; onOpenWizard: () => void }) {
  const updateCabinet = useStore((s) => s.updateCabinet);
  const removeCabinet = useStore((s) => s.removeCabinet);
  const addEquipment = useStore((s) => s.addEquipment);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const toast = useStore((s) => s.toast);

  const calc = calcProject(project, useStore.getState().settings.rates);
  const [selected, setSelected] = useState<string>(project.cabinets[0]?.id ?? "");
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(project.cabinets.map((c) => c.id)));
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // проверка совместимости: контекст + замечания по всему проекту
  const catalog = useStore((s) => s.catalog);
  const ctx: ValidateCtx = useMemo(() => ({ catalog, project }), [catalog, project]);
  const issues = useMemo(() => validateProject(ctx), [ctx]);
  const issueSum = summarize(issues);

  const selId = project.cabinets.some((c) => c.id === selected) ? selected : project.cabinets[0]?.id ?? "";
  const selCab = project.cabinets.find((c) => c.id === selId);

  const toggleOpen = (id: string) =>
    setOpenSet((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onAddEquipment = (eq: Equipment, name: string) => {
    if (!selCab) {
      toast("Сначала добавьте шкаф в проект", "err");
      return;
    }
    const errsBefore = validateCabinet(selCab, ctx).filter((i) => i.severity === "error").length;
    const res = addEquipment(project.id, selCab.id, eq);
    setLastAdded(eq.id + ":" + selCab.id);
    setTimeout(() => setLastAdded(null), 1200);
    toast(
      res === "added" ? `${name.slice(0, 42)} — в «${selCab.name}»` : `+1: ${name.slice(0, 42)}`,
      res === "added" ? "ok" : "info"
    );

    // мгновенная обратная связь: если позиция создала конфликт — предупреждаем
    const fresh = useStore.getState().projects.find((p) => p.id === project.id);
    const freshCab = fresh?.cabinets.find((c) => c.id === selCab.id);
    if (fresh && freshCab) {
      const errsAfter = validateCabinet(freshCab, { catalog, project: fresh }).filter(
        (i) => i.severity === "error"
      ).length;
      if (errsAfter > errsBefore)
        toast("Проверка: в шкафу появился конфликт — загляните в панель «Проверки»", "err");
    }
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* ---------------- дерево шкафов ---------------- */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Btn size="sm" onClick={onOpenWizard}>
            <IcWand size={14} /> Мастер подбора (опросник)
          </Btn>
          <Btn variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <IcPlus size={14} /> Шкаф вручную
          </Btn>
        </div>

        <ValidationPanel
          issues={issues}
          sum={issueSum}
          onJump={(cid) => {
            setSelected(cid);
            setOpenSet((p) => new Set(p).add(cid));
            requestAnimationFrame(() =>
              document.getElementById(`cab-${cid}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
            );
          }}
        />

        {project.cabinets.length === 0 && (
          <EmptyState
            icon={<IcLayers size={22} />}
            title="В проекте пока нет шкафов"
            text="Пройдите мастер подбора — он задаст вопросы про шкаф, автоматы, АВР, УЗИП, шины, ПЛК и ЗИП — или добавьте шкаф вручную."
          >
            <Btn onClick={onOpenWizard}>
              <IcWand size={14} /> Открыть мастер
            </Btn>
          </EmptyState>
        )}

        {calc.cabs.map((cc, ci) => {
          const c = cc.cab;
          const isOpen = openSet.has(c.id);
          const isSel = c.id === selId;
          return (
            <div
              key={c.id}
              id={`cab-${c.id}`}
              className={cx(
                "anim-up scroll-mt-4 overflow-hidden rounded-xl border bg-card transition-all duration-200",
                isSel ? "border-accent shadow-md shadow-accent/10" : "border-line hover:border-line2 hover:shadow-md hover:shadow-dark/5"
              )}
              style={{ animationDelay: `${ci * 50}ms` }}
            >
              {/* заголовок шкафа */}
              <div
                className={cx("flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3", isSel ? "bg-accent-soft/40" : "bg-paper/60")}
                onClick={() => {
                  setSelected(c.id);
                  if (!isOpen) toggleOpen(c.id);
                }}
              >
                <button
                  type="button"
                  className="cursor-pointer text-mute transition-transform duration-200 hover:text-ink"
                  style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleOpen(c.id);
                  }}
                >
                  <IcChevronDown size={16} />
                </button>
                <Badge cls="bg-dark text-white">{c.kind}</Badge>
                <input
                  className={cx(
                    "min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-[13.5px] font-bold text-ink outline-none transition-all",
                    "hover:border-line hover:bg-card focus:border-accent focus:bg-card"
                  )}
                  value={c.name}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateCabinet(project.id, c.id, { name: e.target.value })}
                />
                <span className="font-mono text-[11px] font-semibold text-mute">
                  {c.items.length} {plural(c.items.length, "позиция", "позиции", "позиций")}
                </span>
                <span className="min-w-[110px] text-right font-mono text-[13.5px] font-bold text-ink tabular-nums">{fmtMoney(cc.total)}</span>
                <IconBtn
                  title="Удалить шкаф"
                  danger
                  onClick={() => {
                    removeCabinet(project.id, c.id);
                    toast(`Шкаф «${c.name}» удалён`, "err");
                  }}
                >
                  <IcTrash size={15} />
                </IconBtn>
              </div>

              {/* тело шкафа */}
              <div className={cx("collapse-grid", isOpen && "open")}>
                <div>
                  <div className="border-t border-line">
                    {c.items.length === 0 ? (
                      <div className="px-5 py-6 text-center text-[12.5px] text-mute">
                        Позиций нет — выберите этот шкаф и добавляйте оборудование из каталога
                        <span className="hidden xl:inline"> справа →</span>
                      </div>
                    ) : (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-line text-[10px] font-bold tracking-wide text-mute uppercase">
                            <th className="w-9 py-2 pl-4">№</th>
                            <th className="py-2">Наименование</th>
                            <th className="w-[118px] py-2">Кол-во</th>
                            <th className="hidden w-24 py-2 md:table-cell">Цена, ₽</th>
                            <th className="w-28 py-2 text-right">Сумма</th>
                            <th className="w-10 py-2 pr-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((it, ii) => {
                            const flash = lastAdded === it.eqId + ":" + c.id;
                            return (
                              <tr key={it.id} className={cx("group border-b border-line/60 transition-colors last:border-b-0 hover:bg-paper/70", flash && "row-flash")}>
                                <td className="py-2 pl-4 align-top font-mono text-[11px] text-mute">{ii + 1}</td>
                                <td className="py-2 pr-2 align-top">
                                  <div className="text-[13px] leading-snug font-semibold text-ink">{it.name}</div>
                                  <div className="mt-0.5 font-mono text-[10.5px] text-mute">{it.sku} · {it.brand}</div>
                                </td>
                                <td className="py-2 pr-2 align-top">
                                  <Stepper value={it.qty} onChange={(v) => updateItem(project.id, c.id, it.id, { qty: v })} />
                                  <span className="mt-0.5 block pl-1 text-[10.5px] font-semibold text-mute">{it.unit}</span>
                                </td>
                                <td className="hidden py-2 pr-2 align-top md:table-cell">
                                  <NumInput
                                    className="h-7 w-[86px] px-1.5 text-[12px]"
                                    value={it.price}
                                    step={10}
                                    onChange={(v) => updateItem(project.id, c.id, it.id, { price: Math.max(0, v) })}
                                  />
                                </td>
                                <td className="py-2 pr-1 text-right align-top font-mono text-[12.5px] font-bold text-ink tabular-nums">{fmtMoney(it.price * it.qty)}</td>
                                <td className="py-2 pr-2 text-right align-top">
                                  <span className="opacity-0 transition-opacity group-hover:opacity-100">
                                    <IconBtn title="Убрать позицию" danger onClick={() => removeItem(project.id, c.id, it.id)}>
                                      <IcTrash size={14} />
                                    </IconBtn>
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}

                    {/* итоги и трудозатраты шкафа */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-paper/70 px-4 py-2.5">
                      <div className="flex items-center gap-2 font-mono text-[10.5px] font-semibold text-mute">
                        <span>трудозатраты:</span>
                        <HourInput title="Сборка (производство)" value={c.hours} onChange={(v) => updateCabinet(project.id, c.id, { hours: v })} suffix="сб" />
                        <HourInput title="Проектирование" value={c.designHours} onChange={(v) => updateCabinet(project.id, c.id, { designHours: v })} suffix="пр" />
                        <HourInput title="Разработка ПО" value={c.softwareHours} onChange={(v) => updateCabinet(project.id, c.id, { softwareHours: v })} suffix="по" />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11.5px] text-ink2">
                        <span>оборуд. <b className="text-ink">{fmtMoney(cc.eqBase)}</b></span>
                        <span>+наценка <b className="text-ink">{fmtMoney(cc.markupSum)}</b></span>
                        <span>работы <b className="text-ink">{fmtMoney(cc.laborSell)}</b></span>
                        <span className="rounded bg-dark px-2 py-0.5 text-[12px] font-bold text-white">итого {fmtMoney(cc.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {project.cabinets.length > 0 && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line2 py-3.5 text-[13px] font-bold text-mute transition-all duration-150 hover:border-accent hover:bg-accent-soft/30 hover:text-accent-deep active:scale-[0.99]"
          >
            <IcPlus size={16} /> Добавить шкаф / секцию
          </button>
        )}
      </div>

      <CatalogPanel project={project} selId={selId} onSelChange={setSelected} onAdd={onAddEquipment} />

      <AddCabinetBtn
        project={project}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(cid) => { setSelected(cid); setOpenSet((p) => new Set(p).add(cid)); }}
      />
    </div>
  );
}

function HourInput({ title, value, onChange, suffix }: { title: string; value: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1" title={title}>
      <input
        type="number"
        className="w-12 rounded border border-line bg-card px-1 py-0.5 text-right font-mono text-[11px] font-bold text-ink outline-none focus:border-accent"
        value={value}
        min={0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
      <span className="text-mute">ч {suffix}</span>
    </label>
  );
}

/* ---------------- панель проверки совместимости ---------------- */

function ValidationPanel({
  issues,
  sum,
  onJump,
}: {
  issues: Issue[];
  sum: ReturnType<typeof summarize>;
  onJump: (cid: string) => void;
}) {
  const [open, setOpen] = useState(sum.error + sum.warn > 0);

  return (
    <div
      className={cx(
        "anim-up overflow-hidden rounded-xl border bg-card",
        sum.error ? "border-heat/50" : sum.warn ? "border-warn/50" : sum.total ? "border-line" : "border-ok/40"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-left"
      >
        <span
          className={cx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white",
            sum.error ? "bg-heat" : sum.warn ? "bg-warn" : "bg-ok"
          )}
        >
          {sum.error || sum.warn ? <IcAlert size={15} /> : <IcCheck size={15} />}
        </span>
        <span className="text-[13px] font-bold text-ink">Проверка совместимости</span>
        {sum.total === 0 ? (
          <span className="rounded bg-ok-soft px-2 py-0.5 text-[11px] font-bold text-ok">замечаний нет</span>
        ) : (
          <>
            {sum.error > 0 && (
              <span className="rounded bg-heat-soft px-2 py-0.5 font-mono text-[11px] font-bold text-heat">
                {sum.error} {plural(sum.error, "ошибка", "ошибки", "ошибок")}
              </span>
            )}
            {sum.warn > 0 && (
              <span className="rounded bg-warn-soft px-2 py-0.5 font-mono text-[11px] font-bold text-warn">
                {sum.warn} {plural(sum.warn, "предупреждение", "предупреждения", "предупреждений")}
              </span>
            )}
            {sum.info > 0 && (
              <span className="rounded bg-steel-soft px-2 py-0.5 font-mono text-[11px] font-bold text-steel">
                {sum.info} {plural(sum.info, "подсказка", "подсказки", "подсказок")}
              </span>
            )}
          </>
        )}
        <span
          className="ml-auto text-mute transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <IcChevronDown size={16} />
        </span>
      </button>

      {open && sum.total > 0 && (
        <ul className="border-t border-line/70">
          {issues.map((i) => (
            <li key={i.id} className="flex items-start gap-2.5 border-b border-line/50 px-4 py-2.5 last:border-b-0">
              <span className={cx("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase", SEVERITY_META[i.severity].badge)}>
                {SEVERITY_META[i.severity].label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] leading-snug font-semibold text-ink">
                  {i.cabinetName && i.cabinetId && (
                    <button
                      type="button"
                      onClick={() => onJump(i.cabinetId!)}
                      className="mr-1.5 cursor-pointer rounded bg-dark px-1.5 py-0.5 align-middle font-mono text-[10px] font-bold text-white transition-colors hover:bg-accent"
                      title="Перейти к шкафу"
                    >
                      {i.cabinetName}
                    </button>
                  )}
                  {i.text}
                </div>
                {i.hint && <div className="mt-0.5 text-[11.5px] leading-snug text-mute">{i.hint}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && sum.total === 0 && (
        <div className="border-t border-line/70 px-4 py-3 text-[12px] text-mute">
          Конфликтов не найдено: номиналы аппаратов согласованы с шинами, защиты на месте.
        </div>
      )}
    </div>
  );
}

/* ---------------- панель каталога (все направления) ---------------- */

function CatalogPanel({
  project, selId, onSelChange, onAdd,
}: {
  project: Project;
  selId: string;
  onSelChange: (id: string) => void;
  onAdd: (eq: Equipment, name: string) => void;
}) {
  const catalog = useStore((s) => s.catalog);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("all");
  const [dir, setDir] = useState<DirFilter>("all");

  const inProject = useMemo(() => {
    const set = new Set<string>();
    project.cabinets.forEach((c) => c.items.forEach((i) => set.add(i.eqId)));
    return set;
  }, [project]);

  const cats = useMemo(() => [...new Set(catalog.map((e) => e.category))].sort((a, b) => a.localeCompare(b, "ru")), [catalog]);
  const brands = useMemo(() => [...new Set(catalog.map((e) => e.brand))].sort((a, b) => a.localeCompare(b, "ru")), [catalog]);

  const list = catalog.filter((e) => {
    if (dir !== "all" && e.direction !== dir) return false;
    if (cat !== "all" && e.category !== cat) return false;
    if (brand !== "all" && e.brand !== brand) return false;
    const s = `${e.sku} ${e.name} ${e.brand} ${e.attrs ?? ""}`.toLowerCase();
    return q.trim() === "" || s.includes(q.trim().toLowerCase());
  });

  const dirChips: { k: DirFilter; label: string; cls?: string }[] = [
    { k: "all", label: "Все" },
    { k: "nku", label: "НКУ", cls: DIRECTIONS.nku.chip },
    { k: "asu", label: "АСУ", cls: DIRECTIONS.asu.chip },
    { k: "heat", label: "Обогрев", cls: DIRECTIONS.heat.chip },
    { k: "uni", label: "Универс." },
  ];

  return (
    <aside className="flex flex-col overflow-hidden rounded-xl border border-line bg-card xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
      <div className="border-b border-line bg-dark px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[12px] font-semibold tracking-tight text-white">Справочник</span>
          <span className="rounded bg-darkline px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-darkmute">{list.length}</span>
        </div>
        <div className="mt-2">
          <Select
            value={selId}
            onChange={onSelChange}
            options={
              project.cabinets.length
                ? project.cabinets.map((c) => ({ value: c.id, label: `Добавлять в: ${c.name}` }))
                : [{ value: "", label: "Нет шкафов — добавьте слева" }]
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-3.5 py-3">
        <div className="relative">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-mute">
            <IcSearch size={14} />
          </span>
          <Input value={q} onChange={setQ} placeholder="Артикул, название, бренд…" className="h-8 pl-8 text-[12.5px]" />
        </div>
        <div className="flex flex-wrap gap-1">
          {dirChips.map((d) => (
            <button
              key={d.k}
              onClick={() => setDir(d.k)}
              className={cx(
                "cursor-pointer rounded px-2 py-1 text-[10.5px] font-bold transition-all active:scale-95",
                dir === d.k ? (d.cls ?? "bg-dark text-white") : "bg-paper text-mute hover:text-ink"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={cat} onChange={setCat} options={[{ value: "all", label: "Все категории" }, ...cats.map((c) => ({ value: c, label: c }))]} className="[&_select]:h-8 [&_select]:text-[11.5px]" />
          <Select value={brand} onChange={setBrand} options={[{ value: "all", label: "Все бренды" }, ...brands.map((b) => ({ value: b, label: b }))]} className="[&_select]:h-8 [&_select]:text-[11.5px]" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.map((e) => (
          <div key={e.id} className="group flex items-center gap-2.5 border-b border-line/60 px-3.5 py-2.5 transition-colors hover:bg-accent-soft/30">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] leading-snug font-semibold text-ink">{e.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-mute">
                <span>{e.sku}</span>·<span>{e.brand}</span>
                {e.direction === "uni" ? (
                  <span className="rounded bg-line/60 px-1 py-px font-bold text-ink2 uppercase">универс.</span>
                ) : (
                  <span className={cx("rounded px-1 py-px font-bold uppercase", DIRECTIONS[e.direction].badge)}>{DIRECTIONS[e.direction].label}</span>
                )}
                {inProject.has(e.id) && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-ok-soft px-1 py-px font-bold text-ok">
                    <IcCheck size={9} /> в ТКП
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[12px] font-bold text-ink tabular-nums">{fmtMoney(e.price)}</span>
            <button
              type="button"
              title="Добавить в выбранный шкаф"
              onClick={() => onAdd(e, e.name)}
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-dark text-white transition-all duration-150 hover:bg-accent active:scale-90"
            >
              <IcPlus size={14} />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="px-4 py-10 text-center text-[12.5px] text-mute">
            Ничего не найдено.
            <br />
            Попробуйте сбросить фильтры.
          </div>
        )}
      </div>

      <div className="border-t border-line bg-paper/70 px-4 py-2 text-[10.5px] leading-relaxed text-mute">
        Оборудование из любого направления доступно в каждом проекте — цена фиксируется при добавлении.
      </div>
    </aside>
  );
}

/* ---------------- добавление шкафа ---------------- */

import { CABINET_KINDS } from "../types";

function AddCabinetBtn({
  project, open, onClose, onCreated,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const addCabinet = useStore((s) => s.addCabinet);
  const toast = useStore((s) => s.toast);
  const kinds = CABINET_KINDS[project.direction];
  const [kind, setKind] = useState(kinds[0]);
  const [name, setName] = useState("");

  const submit = () => {
    const finalName = name.trim() || `${kind} №${project.cabinets.length + 1}`;
    const cid = addCabinet(project.id, kind, finalName);
    onCreated(cid);
    toast(`Шкаф «${finalName}» добавлен`);
    setName("");
    onClose();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Новый шкаф / секция"
        w="max-w-md"
        footer={
          <>
            <Btn variant="outline" onClick={onClose}>Отмена</Btn>
            <Btn onClick={submit}>
              <IcPlus size={14} /> Добавить
            </Btn>
          </>
        }
      >
        <Field label="Тип шкафа">
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  if (!name.trim()) setName(`${k} №${project.cabinets.length + 1}`);
                }}
                className={cx(
                  "cursor-pointer rounded-md border px-2.5 py-1.5 text-[12px] font-bold transition-all duration-150 active:scale-95",
                  kind === k ? "border-accent bg-accent text-white shadow-sm shadow-accent/30" : "border-line bg-card text-ink2 hover:border-line2"
                )}
              >
                {k}
              </button>
            ))}
          </div>
        </Field>
        <div className="mt-3">
          <Field label="Название в структуре проекта" hint={`Например: ${kind} №1 — Ввод`}>
            <Input value={name} onChange={setName} placeholder={`${kind} №${project.cabinets.length + 1}`} autoFocus />
          </Field>
        </div>
      </Modal>
    </>
  );
}
