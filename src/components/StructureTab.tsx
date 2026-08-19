import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Project } from "../types";
import { CABINET_KINDS } from "../types";
import { calcProject, fmtMoney, plural } from "../utils";
import { Badge, Btn, EmptyState, Field, IconBtn, Input, Modal, NumInput, Select, Stepper, cx } from "./ui";
import { IcCheck, IcChevronDown, IcLayers, IcPlus, IcSearch, IcTrash } from "./icons";

export default function StructureTab({ project }: { project: Project }) {
  const addCabinet = useStore((s) => s.addCabinet);
  const updateCabinet = useStore((s) => s.updateCabinet);
  const removeCabinet = useStore((s) => s.removeCabinet);
  const addEquipment = useStore((s) => s.addEquipment);
  const updateItem = useStore((s) => s.updateItem);
  const removeItem = useStore((s) => s.removeItem);
  const toast = useStore((s) => s.toast);

  const calc = calcProject(project);
  const [selected, setSelected] = useState<string>(project.cabinets[0]?.id ?? "");
  const [openSet, setOpenSet] = useState<Set<string>>(() => new Set(project.cabinets.map((c) => c.id)));
  const [addCabOpen, setAddCabOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const selId = project.cabinets.some((c) => c.id === selected) ? selected : project.cabinets[0]?.id ?? "";
  const selCab = project.cabinets.find((c) => c.id === selId);

  const toggleOpen = (id: string) =>
    setOpenSet((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const onAddEquipment = (eqId: string, name: string) => {
    if (!selCab) {
      toast("Сначала добавьте шкаф в проект", "err");
      return;
    }
    const eq = useStore.getState().catalog.find((e) => e.id === eqId);
    if (!eq) return;
    const res = addEquipment(project.id, selCab.id, eq);
    setLastAdded(eqId + ":" + selCab.id);
    setTimeout(() => setLastAdded(null), 1200);
    toast(
      res === "added" ? `${name.slice(0, 42)} — добавлено в «${selCab.name}»` : `+1 шт: ${name.slice(0, 42)}`,
      res === "added" ? "ok" : "info"
    );
  };

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* ---------------- дерево шкафов ---------------- */}
      <div className="flex min-w-0 flex-col gap-3">
        {project.cabinets.length === 0 && (
          <EmptyState
            icon={<IcLayers size={22} />}
            title="В проекте пока нет шкафов"
            text="Добавьте первый шкаф или секцию — например «ГРЩ», «Шкаф ПЛК» или «ЩУО» — и наполните его оборудованием из справочника справа."
          >
            <Btn onClick={() => setAddCabOpen(true)}>
              <IcPlus size={15} /> Добавить шкаф
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
              className={cx(
                "anim-up overflow-hidden rounded-xl border bg-card transition-all duration-200",
                isSel ? "border-accent shadow-md shadow-accent/10" : "border-line hover:border-line2 hover:shadow-md hover:shadow-dark/5"
              )}
              style={{ animationDelay: `${ci * 50}ms` }}
            >
              {/* заголовок шкафа */}
              <div
                className={cx(
                  "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3",
                  isSel ? "bg-accent-soft/40" : "bg-paper/60"
                )}
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
                <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-mute">
                  <input
                    type="number"
                    className="w-12 rounded border border-line bg-card px-1 py-0.5 text-right font-mono text-[11.5px] font-bold text-ink outline-none focus:border-accent"
                    value={c.hours}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateCabinet(project.id, c.id, { hours: Number(e.target.value) || 0 })}
                  />
                  н/ч
                </span>
                <span className="min-w-[110px] text-right font-mono text-[13.5px] font-bold text-ink tabular-nums">
                  {fmtMoney(cc.total)}
                </span>
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
                            <th className="w-[122px] py-2">Кол-во</th>
                            <th className="hidden w-24 py-2 md:table-cell">Цена, ₽</th>
                            <th className="w-28 py-2 text-right">Сумма</th>
                            <th className="w-10 py-2 pr-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.items.map((it, ii) => {
                            const flash = lastAdded === it.eqId + ":" + c.id;
                            return (
                              <tr
                                key={it.id}
                                className={cx(
                                  "group border-b border-line/60 transition-colors last:border-b-0 hover:bg-paper/70",
                                  flash && "row-flash"
                                )}
                              >
                                <td className="py-2 pl-4 align-top font-mono text-[11px] text-mute">{ii + 1}</td>
                                <td className="py-2 pr-2 align-top">
                                  <div className="text-[13px] leading-snug font-semibold text-ink">{it.name}</div>
                                  <div className="mt-0.5 font-mono text-[10.5px] text-mute">
                                    {it.sku} · {it.brand}
                                  </div>
                                </td>
                                <td className="py-2 pr-2 align-top">
                                  <Stepper value={it.qty} onChange={(v) => updateItem(project.id, c.id, it.id, { qty: v })} />
                                  <span className="mt-0.5 block pl-1 text-[10.5px] font-semibold text-mute">{it.unit}</span>
                                </td>
                                <td className="hidden py-2 pr-2 align-top md:table-cell">
                                  <NumInput
                                    className="h-7 w-[88px] px-1.5 text-[12px]"
                                    value={it.price}
                                    step={10}
                                    onChange={(v) => updateItem(project.id, c.id, it.id, { price: Math.max(0, v) })}
                                  />
                                </td>
                                <td className="py-2 pr-1 text-right align-top font-mono text-[12.5px] font-bold text-ink tabular-nums">
                                  {fmtMoney(it.price * it.qty)}
                                </td>
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

                    {/* итоги шкафа */}
                    <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1 bg-paper/70 px-4 py-2.5 font-mono text-[11.5px] text-ink2">
                      <span>
                        оборудование <b className="text-ink">{fmtMoney(cc.eqBase)}</b>
                      </span>
                      <span>
                        + наценка <b className="text-ink">{fmtMoney(cc.markupSum)}</b>
                      </span>
                      <span>
                        сборка {c.hours} ч × {(project.hourRate * project.complexity).toFixed(0)} ₽{" "}
                        <b className="text-ink">{fmtMoney(cc.work)}</b>
                      </span>
                      <span className="rounded bg-dark px-2 py-0.5 text-[12px] font-bold text-white">
                        итого {fmtMoney(cc.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {project.cabinets.length > 0 && (
          <button
            onClick={() => setAddCabOpen(true)}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line2 py-3.5 text-[13px] font-bold text-mute transition-all duration-150 hover:border-accent hover:bg-accent-soft/30 hover:text-accent-deep active:scale-[0.99]"
          >
            <IcPlus size={16} /> Добавить шкаф / секцию
          </button>
        )}
      </div>

      {/* ---------------- панель каталога ---------------- */}
      <CatalogPanel
        project={project}
        selId={selId}
        onSelChange={setSelected}
        onAdd={onAddEquipment}
      />

      <AddCabinetModal
        open={addCabOpen}
        onClose={() => setAddCabOpen(false)}
        project={project}
        onCreated={(cid, name) => {
          setSelected(cid);
          setOpenSet((p) => new Set(p).add(cid));
          toast(`Шкаф «${name}» добавлен`);
        }}
        addCabinet={addCabinet}
      />
    </div>
  );
}

/* ---------------- каталог справа ---------------- */

function CatalogPanel({
  project,
  selId,
  onSelChange,
  onAdd,
}: {
  project: Project;
  selId: string;
  onSelChange: (id: string) => void;
  onAdd: (eqId: string, name: string) => void;
}) {
  const catalog = useStore((s) => s.catalog);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("all");

  const inProject = useMemo(() => {
    const set = new Set<string>();
    project.cabinets.forEach((c) => c.items.forEach((i) => set.add(i.eqId)));
    return set;
  }, [project]);

  const cats = useMemo(() => [...new Set(catalog.map((e) => e.category))].sort((a, b) => a.localeCompare(b, "ru")), [catalog]);
  const brands = useMemo(() => [...new Set(catalog.map((e) => e.brand))].sort((a, b) => a.localeCompare(b, "ru")), [catalog]);

  const list = catalog.filter((e) => {
    if (e.direction !== "uni" && e.direction !== project.direction) return false;
    if (cat !== "all" && e.category !== cat) return false;
    if (brand !== "all" && e.brand !== brand) return false;
    const s = `${e.sku} ${e.name} ${e.brand}`.toLowerCase();
    return q.trim() === "" || s.includes(q.trim().toLowerCase());
  });

  return (
    <aside className="flex flex-col overflow-hidden rounded-xl border border-line bg-card xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)]">
      <div className="border-b border-line bg-dark px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-display text-[12px] font-semibold tracking-tight text-white">Справочник оборудования</span>
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
        <div className="grid grid-cols-2 gap-2">
          <Select value={cat} onChange={setCat} options={[{ value: "all", label: "Все категории" }, ...cats.map((c) => ({ value: c, label: c }))]} className="[&_select]:h-8 [&_select]:text-[12px]" />
          <Select value={brand} onChange={setBrand} options={[{ value: "all", label: "Все бренды" }, ...brands.map((b) => ({ value: b, label: b }))]} className="[&_select]:h-8 [&_select]:text-[12px]" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.map((e) => (
          <div
            key={e.id}
            className="group flex items-center gap-2.5 border-b border-line/60 px-3.5 py-2.5 transition-colors hover:bg-accent-soft/30"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] leading-snug font-semibold text-ink">{e.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-mute">
                <span>{e.sku}</span>·<span>{e.brand}</span>·<span>{e.category}</span>
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
              onClick={() => onAdd(e.id, e.name)}
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
        Цена фиксируется в момент добавления и редактируется прямо в строке шкафа.
      </div>
    </aside>
  );
}

/* ---------------- добавление шкафа ---------------- */

function AddCabinetModal({
  open,
  onClose,
  project,
  onCreated,
  addCabinet,
}: {
  open: boolean;
  onClose: () => void;
  project: Project;
  onCreated: (id: string, name: string) => void;
  addCabinet: (pid: string, kind: string, name: string) => string;
}) {
  const kinds = CABINET_KINDS[project.direction];
  const [kind, setKind] = useState(kinds[0]);
  const [name, setName] = useState("");

  const submit = () => {
    const finalName = name.trim() || `${kind} №${project.cabinets.length + 1}`;
    const cid = addCabinet(project.id, kind, finalName);
    onCreated(cid, finalName);
    setName("");
    onClose();
  };

  return (
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
  );
}
