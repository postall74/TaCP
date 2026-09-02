import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { CabinetTemplate, Direction, LineItem, TemplateComponent } from "../types";
import { DIRECTIONS } from "../types";
import { fmtMoney, genId } from "../utils";
import {
  autoAssemblyHours, baseKit, kitTotal, suggestName, suggestOrderCode,
  templateDocLine, templateLabel, templateTotal,
} from "../utils/cabinetTemplates";
import { can } from "../utils/roles";
import { Badge, Btn, EmptyState, Field, IconBtn, Input, Modal, NumInput, Seg, Select, Stepper, cx } from "./ui";
import { IcAlert, IcBox, IcCheck, IcClock, IcLayers, IcPlus, IcSearch, IcTrash, IcWand } from "./icons";

/* ============================================================
   КОНФИГУРАТОР ПУСТЫХ И ПРЕДНАПОЛНЕННЫХ ШКАФОВ (дорожная карта Б.1).
   Отдельная сущность «шкаф по заказному шифру»: пустой корпус ИЛИ
   преднаполненный (корпус + АВ на микроклимат/освещение). Комплект
   поставки сводится в одну позицию ТКП со сборным описанием,
   преднаполнение — отдельными строками; часы сборки — в цене изделия.
   Используется в мастере подбора (шаг «Корпус» → «Из конфигуратора»).
   ============================================================ */

const newTemplate = (direction: Direction): CabinetTemplate => {
  const now = Date.now();
  const kit = baseKit("floor", 2000, 800, 600);
  return {
    id: genId("tpl"), orderCode: "", name: suggestName("floor"), direction,
    brand: "", mount: "floor", h: 2000, w: 800, d: 600, ip: 54,
    kit, fillItems: [], assemblyHours: autoAssemblyHours("floor", 2000, 800),
    notes: "", createdAt: now, updatedAt: now,
  };
};

export default function CabinetConfigurator() {
  const templates = useStore((s) => s.templates);
  const catalog = useStore((s) => s.catalog);
  const upsertTemplate = useStore((s) => s.upsertTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const user = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<CabinetTemplate | null>(null);
  const [confirmDel, setConfirmDel] = useState<CabinetTemplate | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...templates]
      .filter((t) => !q || t.orderCode.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.brand.toLowerCase().includes(q))
      .sort((a, b) => a.orderCode.localeCompare(b.orderCode, "ru"));
  }, [templates, search]);

  const canDelete = can(user, "catalog.delete");
  const isNew = draft !== null && !templates.some((t) => t.id === draft.id);

  const openTemplate = (t: CabinetTemplate) =>
    setDraft({ ...t, kit: t.kit.map((k) => ({ ...k })), fillItems: t.fillItems.map((f) => ({ ...f })) });

  const startNew = () => setDraft(newTemplate(templates[0]?.direction ?? "nku"));

  /* изменение габаритов/монтажа перегенерирует комплект поставки */
  const regen = (patch: Partial<CabinetTemplate>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      next.kit = baseKit(next.mount, next.h, next.w, next.d);
      next.assemblyHours = autoAssemblyHours(next.mount, next.h, next.w);
      return next;
    });
  };

  const patch = (p: Partial<CabinetTemplate>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const setKitQty = (key: string, qty: number) =>
    setDraft((d) => d ? { ...d, kit: d.kit.map((k) => (k.key === key ? { ...k, qty: Math.max(0, qty) } : k)) } : d);

  const save = () => {
    if (!draft) return;
    const code = draft.orderCode.trim();
    if (!code) { toast("Укажите заказной шифр", "err"); return; }
    if (!draft.name.trim()) { toast("Укажите наименование изделия", "err"); return; }
    if (draft.kit.length === 0) { toast("Комплект поставки пуст", "err"); return; }
    const dup = templates.find((t) => t.id !== draft.id && t.orderCode.toLowerCase() === code.toLowerCase());
    if (dup) { toast(`Шкаф с шифром «${dup.orderCode}» уже существует`, "err"); return; }
    upsertTemplate({ ...draft, orderCode: code, updatedAt: Date.now() });
    toast(isNew ? `Шкаф «${code}» создан` : `Шкаф «${code}» обновлён`);
    setDraft(null);
  };

  return (
    <div className="anim-up">
      {/* -------- заголовок -------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-dark text-white">
          <IcLayers size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-[19px] font-bold text-ink">Конфигуратор шкафов</h1>
            <Badge cls="bg-steel-soft text-steel">{templates.length} шт</Badge>
          </div>
          <p className="text-[12px] text-mute">
            Пустые и преднаполненные шкафы с заказным шифром — для многократного использования в ТКП
          </p>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute"><IcSearch size={15} /></span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Шифр, название, бренд…"
            className="h-9 w-56 rounded-lg border border-line bg-card pl-8 pr-3 text-[12.5px] outline-none transition-colors focus:border-accent"
          />
        </div>
        <Btn onClick={startNew}><IcPlus size={15} /> Новый шкаф</Btn>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* -------- список шаблонов -------- */}
        <div className="flex flex-col gap-2.5 self-start">
          {list.length === 0 && (
            <EmptyState icon={<IcBox size={22} />} title="Шаблонов нет" text="Создайте первый шкаф — пустой или преднаполненный.">
              <Btn size="sm" onClick={startNew}><IcPlus size={14} /> Создать</Btn>
            </EmptyState>
          )}
          {list.map((t) => {
            const active = draft?.id === t.id;
            return (
              <button
                key={t.id}
                onClick={() => openTemplate(t)}
                className={cx(
                  "group cursor-pointer rounded-xl border p-3.5 text-left transition-all duration-150",
                  active
                    ? "border-accent bg-accent-soft/50 shadow-md shadow-accent/10"
                    : "border-line bg-card hover:-translate-y-0.5 hover:border-line2 hover:shadow-md"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("font-mono text-[13px] font-bold", active ? "text-accent-deep" : "text-ink")}>{t.orderCode}</span>
                  {t.fillItems.length > 0
                    ? <Badge cls="bg-ok-soft text-ok">преднаполнен</Badge>
                    : <Badge cls="bg-line/60 text-mute">пустой</Badge>}
                </div>
                <div className="mt-1 truncate text-[12px] font-semibold text-ink2">{t.name}</div>
                <div className="mt-0.5 text-[11px] text-mute">
                  {templateLabel(t)} · {t.brand || "бренд не указан"}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line/60 pt-2">
                  <span className="font-mono text-[12.5px] font-bold text-ink">{fmtMoney(templateTotal(t))}</span>
                  <span className="flex items-center gap-1 text-[10.5px] text-mute">
                    <IcClock size={11} /> {t.assemblyHours} ч · комплект {t.kit.length}{t.fillItems.length > 0 ? ` + ${t.fillItems.length}` : ""}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* -------- редактор / предпросмотр -------- */}
        <div className="min-w-0">
          {draft === null ? (
            <div className="flex h-full min-h-[380px] items-center justify-center rounded-xl border border-dashed border-line2 bg-card/50">
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-steel-soft text-steel"><IcWand size={26} /></div>
                <div className="mt-3 text-[14px] font-bold text-ink2">Выберите шкаф слева или создайте новый</div>
                <div className="mt-1 max-w-sm text-[12px] text-mute">
                  Конфигуратор соберёт комплект поставки по габаритам, рассчитает часы и сформирует строку для ТКП заказчика.
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* параметры */}
              <Section title="Параметры корпуса">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Тип монтажа">
                    <Seg
                      value={draft.mount}
                      onChange={(v) => regen({ mount: v as CabinetTemplate["mount"], name: draft.name.startsWith("Шкаф") ? suggestName(v as "floor" | "wall") : draft.name })}
                      options={[{ value: "floor", label: "Напольный" }, { value: "wall", label: "Навесной" }]}
                    />
                  </Field>
                  <Field label="Степень защиты IP">
                    <Select value={String(draft.ip)} onChange={(v) => patch({ ip: Number(v) })}
                      options={[31, 54, 65, 66, 67].map((x) => ({ value: String(x), label: `IP${x}` }))} />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Высота, мм"><NumInput value={draft.h} step={100} onChange={(v) => regen({ h: Math.max(200, v) })} /></Field>
                    <Field label="Ширина, мм"><NumInput value={draft.w} step={100} onChange={(v) => regen({ w: Math.max(200, v) })} /></Field>
                    <Field label="Глубина, мм"><NumInput value={draft.d} step={50} onChange={(v) => regen({ d: Math.max(150, v) })} /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Направление">
                      <Select value={draft.direction} onChange={(v) => patch({ direction: v as Direction })}
                        options={Object.entries(DIRECTIONS).map(([k, d]) => ({ value: k, label: d.label }))} />
                    </Field>
                    <Field label="Бренд / система корпусов">
                      <Input value={draft.brand} onChange={(v) => patch({ brand: v })} placeholder="ПРОВЕНТО, DKC…" />
                    </Field>
                  </div>
                </div>
              </Section>

              {/* комплект поставки */}
              <Section
                title="Комплект поставки"
                right={
                  <button onClick={() => patch({ kit: baseKit(draft.mount, draft.h, draft.w, draft.d) })}
                    className="cursor-pointer text-[11px] font-bold text-accent-deep hover:underline">
                    Сбросить к типовому
                  </button>
                }
              >
                <div className="overflow-hidden rounded-lg border border-line">
                  {draft.kit.map((k, i) => (
                    <div key={k.key} className={cx("anim-up flex items-center gap-3 px-3 py-2", i % 2 === 0 ? "bg-card" : "bg-paper/50")}
                      style={{ animationDelay: `${i * 25}ms` }}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold text-ink">{k.name}</div>
                        <div className="font-mono text-[10.5px] text-mute">{fmtMoney(k.purchase)} / {k.unit}</div>
                      </div>
                      <Stepper value={k.qty} onChange={(v) => setKitQty(k.key, v)} />
                      <div className="w-24 text-right font-mono text-[12.5px] font-bold text-ink">{fmtMoney(k.qty * k.purchase)}</div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-line bg-dark px-3 py-2.5">
                    <span className="text-[11px] font-bold tracking-wide text-darkmute uppercase">Итого комплект</span>
                    <span className="font-mono text-[14px] font-bold text-white">{fmtMoney(kitTotal(draft.kit))}</span>
                  </div>
                </div>
              </Section>

              {/* преднаполнение */}
              <Section title="Преднаполнение (оборудование)">
                <FillPicker
                  catalog={catalog}
                  direction={draft.direction}
                  onAdd={(eq) =>
                    patch({
                      fillItems: [...draft.fillItems, {
                        id: genId("li"), eqId: eq.id, sku: eq.sku, name: eq.name, brand: eq.brand,
                        unit: eq.unit, qty: 1, purchase: eq.purchase,
                      }],
                    })
                  }
                />
                {draft.fillItems.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-line">
                    {draft.fillItems.map((f) => (
                      <div key={f.id} className="anim-up flex items-center gap-3 border-b border-line/60 bg-card px-3 py-2 last:border-b-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-semibold text-ink">{f.name}</div>
                          <div className="font-mono text-[10.5px] text-mute">{f.sku} · {f.brand} · {fmtMoney(f.purchase)} / {f.unit}</div>
                        </div>
                        <Stepper value={f.qty} onChange={(v) => patch({ fillItems: draft.fillItems.map((x) => (x.id === f.id ? { ...x, qty: Math.max(1, v) } : x)) })} />
                        <div className="w-24 text-right font-mono text-[12.5px] font-bold text-ink">{fmtMoney(f.qty * f.purchase)}</div>
                        <IconBtn title="Убрать" danger onClick={() => patch({ fillItems: draft.fillItems.filter((x) => x.id !== f.id) })}>
                          <IcTrash size={14} />
                        </IconBtn>
                      </div>
                    ))}
                  </div>
                )}
                {draft.fillItems.length === 0 && (
                  <p className="mt-2 text-[11.5px] text-mute">
                    Не добавлено — получится <b>пустой</b> шкаф. Добавьте АВ на микроклимат/освещение, чтобы сделать <b>преднаполненный</b>.
                  </p>
                )}
              </Section>

              {/* часы, шифр, наименование */}
              <Section title="Часы сборки, шифр и наименование">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Часы сборки (в цене изделия)" hint={`Рекомендовано: ${autoAssemblyHours(draft.mount, draft.h, draft.w)} ч`}>
                    <NumInput value={draft.assemblyHours} step={0.5} onChange={(v) => patch({ assemblyHours: Math.max(0, v) })} />
                  </Field>
                  <Field label="Заказной шифр" hint="Уникален в пределах configurator'а">
                    <div className="flex gap-1.5">
                      <Input value={draft.orderCode} onChange={(v) => patch({ orderCode: v })} placeholder="ШН-2000.800.600-IP54" />
                      <IconBtn title="Сформировать автоматически" onClick={() => patch({ orderCode: suggestOrderCode(draft) })}>
                        <IcWand size={15} />
                      </IconBtn>
                    </div>
                  </Field>
                  <Field label="Наименование изделия">
                    <Input value={draft.name} onChange={(v) => patch({ name: v })} />
                  </Field>
                </div>
                <Field label="Примечание (не попадает в ТКП)" className="mt-3">
                  <Input value={draft.notes ?? ""} onChange={(v) => patch({ notes: v })} placeholder="Например: типовое решение для насосных станций" />
                </Field>
              </Section>

              {/* -------- живой предпросмотр строки ТКП -------- */}
              <div className="overflow-hidden rounded-xl border border-dark bg-dark shadow-lg">
                <div className="flex items-center justify-between border-b border-darkline px-4 py-2.5">
                  <span className="text-[10.5px] font-bold tracking-wide text-darkmute uppercase">Так это появится в ТКП заказчика</span>
                  <Badge cls="bg-accent text-white">{draft.fillItems.length > 0 ? "преднаполненный" : "пустой"}</Badge>
                </div>
                <div className="px-4 py-3.5">
                  <div className="font-mono text-[10.5px] font-bold tracking-wider text-accent">{draft.orderCode || "ШИФР НЕ ЗАДАН"}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/90">{templateDocLine(draft)}</p>
                  {draft.fillItems.length > 0 && (
                    <div className="mt-2.5 border-t border-darkline pt-2.5">
                      <div className="text-[10.5px] font-bold tracking-wide text-darkmute uppercase">Плюс отдельными строками</div>
                      <div className="mt-1.5 flex flex-col gap-1">
                        {draft.fillItems.map((f) => (
                          <div key={f.id} className="flex justify-between text-[12px] text-white/75">
                            <span className="truncate">{f.name}</span>
                            <span className="font-mono font-bold whitespace-nowrap text-white">{f.qty} {f.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-darkline bg-dark2/60 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[11.5px] text-darkmute">
                    <IcClock size={13} /> Сборка: <b className="text-white">{draft.assemblyHours} ч</b>
                  </span>
                  <span className="text-[11.5px] text-darkmute">
                    Закупочная: комплект <b className="font-mono text-white">{fmtMoney(kitTotal(draft.kit))}</b>
                    {draft.fillItems.length > 0 && <> + оборудование <b className="font-mono text-white">{fmtMoney(templateTotal(draft) - kitTotal(draft.kit))}</b></>}
                    {" "}= <b className="font-mono text-accent">{fmtMoney(templateTotal(draft))}</b>
                  </span>
                </div>
              </div>

              {/* -------- действия -------- */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  {!isNew && canDelete && (
                    <Btn variant="ghost" size="sm" onClick={() => setConfirmDel(draft)}>
                      <IcTrash size={14} /> Удалить
                    </Btn>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Btn variant="ghost" size="sm" onClick={() => setDraft(null)}>Отмена</Btn>
                  <Btn onClick={save}><IcCheck size={15} /> {isNew ? "Создать шкаф" : "Сохранить"}</Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* -------- подтверждение удаления -------- */}
      {confirmDel && (
        <Modal open onClose={() => setConfirmDel(null)} title="Удалить шаблон шкафа?">
          <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3">
            <span className="mt-0.5 text-warn"><IcAlert size={17} /></span>
            <p className="text-[12.5px] leading-relaxed text-ink2">
              Шкаф <b className="font-mono">{confirmDel.orderCode}</b> будет удалён из конфигуратора.
              Уже добавленные в ТКП позиции не изменятся (они хранятся снимками).
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Btn variant="ghost" size="sm" onClick={() => setConfirmDel(null)}>Отмена</Btn>
            <Btn variant="danger" size="sm" onClick={() => {
              if (deleteTemplate(confirmDel.id)) {
                toast(`Шкаф «${confirmDel.orderCode}» удалён`, "err");
                if (draft?.id === confirmDel.id) setDraft(null);
              }
              setConfirmDel(null);
            }}>
              <IcTrash size={14} /> Удалить
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= вспомогательные ================= */

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold tracking-wide text-mute uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Поиск по справочнику + добавление позиции в преднаполнение. */
function FillPicker({ catalog, direction, onAdd }: {
  catalog: import("../types").Equipment[];
  direction: Direction;
  onAdd: (e: import("../types").Equipment) => void;
}) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return catalog
      .filter((e) => e.category !== "Корпуса и щиты")
      .filter((e) => e.direction === direction || e.direction === "uni")
      .filter((e) => e.name.toLowerCase().includes(s) || e.sku.toLowerCase().includes(s) || e.brand.toLowerCase().includes(s))
      .slice(0, 7);
  }, [catalog, direction, q]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-[13px] text-mute"><IcSearch size={15} /></span>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setFocus(true); }}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 160)}
        placeholder="Найти оборудование: автомат, обогреватель, светильник…"
        className="h-9 w-full rounded-lg border border-line bg-paper pl-8 pr-3 text-[12.5px] outline-none transition-colors focus:border-accent"
      />
      {focus && matches.length > 0 && (
        <div className="anim-scale absolute left-0 right-0 top-10 z-20 overflow-hidden rounded-lg border border-line bg-card shadow-xl">
          {matches.map((e) => (
            <button
              key={e.id}
              type="button"
              onMouseDown={() => { onAdd(e); setQ(""); }}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-b border-line/60 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-soft/50"
            >
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-semibold text-ink">{e.name}</span>
                <span className="block font-mono text-[10px] text-mute">{e.sku} · {e.brand} · {e.category}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="font-mono text-[12px] font-bold text-ink">{fmtMoney(e.purchase)}</span>
                <span className="text-accent"><IcPlus size={14} /></span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
