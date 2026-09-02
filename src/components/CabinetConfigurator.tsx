import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { CabinetTemplate, LineItem, TemplateComponent } from "../types";
import { DIRECTIONS } from "../types";
import { fmtMoney, genId } from "../utils";
import {
  autoAssemblyHours, baseKit, doorCount, kitTotal, suggestName, suggestOrderCode,
  templateDocLine, templateLabel, templateTotal, traverseCount,
} from "../utils/cabinetTemplates";
import { can, denyReason } from "../utils/roles";
import { Badge, Btn, EmptyState, Field, IconBtn, Input, Modal, NumInput, Seg, Select, Stepper, Textarea, cx } from "./ui";
import { IcBox, IcCopy, IcLayers, IcPencil, IcPlus, IcTrash, IcWand } from "./icons";

/* ============================================================
   КОНФИГУРАТОР ПУСТЫХ И ПРЕДНАПОЛНЕННЫХ ШКАФОВ (дорожная карта Б.1).
   Шаблон = корпус (пустой) или корпус + преднаполнение (несколько
   АВ на распределение питания микроклимата/освещения) + заказный
   шифр. В ТКП изделие вставляется одной строкой: наименование,
   габариты, IP, «Комплект поставки: …»; часы сборщиков уже учтены
   в стоимости изделия.
   ============================================================ */

const MOUNTS: { v: "floor" | "wall"; label: string; heights: number[]; widths: number[]; depths: number[] }[] = [
  { v: "floor", label: "Напольный", heights: [1800, 2000, 2200], widths: [600, 800, 1000, 1200], depths: [400, 600, 800] },
  { v: "wall", label: "Навесной", heights: [400, 600, 800, 1000], widths: [300, 400, 600, 800], depths: [150, 200, 250, 300] },
];

interface DraftTpl {
  id: string;
  orderCode: string;
  name: string;
  direction: "nku" | "asu" | "uni";
  brand: string;
  mount: "floor" | "wall";
  h: number; w: number; d: number; ip: number;
  kit: TemplateComponent[];
  fillItems: LineItem[];
  assemblyHours: number;
  note: string;
  autoCode: boolean;
  autoName: boolean;
}

const blank = (): DraftTpl => ({
  id: genId("tpl"), orderCode: "", name: suggestName("floor"), direction: "nku", brand: "ПРОВЕНТО",
  mount: "floor", h: 2000, w: 800, d: 600, ip: 54,
  kit: baseKit("floor", 2000, 800, 600), fillItems: [], assemblyHours: autoAssemblyHours("floor", 2000, 800),
  note: "", autoCode: true, autoName: true,
});

export default function CabinetConfigurator() {
  const templates = useStore((s) => s.templates);
  const upsertTemplate = useStore((s) => s.upsertTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const catalog = useStore((s) => s.catalog);
  const user = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);

  const [q, setQ] = useState("");
  const [fMount, setFMount] = useState<"any" | "floor" | "wall">("any");
  const [edit, setEdit] = useState<DraftTpl | null>(null);
  const [del, setDel] = useState<CabinetTemplate | null>(null);

  const canEdit = can(user, "catalog.edit");
  const canDelete = can(user, "catalog.delete");
  const pool = useMemo(
    () => catalog.filter((e) => ["Автоматические выключатели", "УЗО и дифавтоматы", "Контакторы и реле", "Блоки питания"].includes(e.category)),
    [catalog]
  );

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return templates.filter((t) => {
      if (fMount !== "any" && t.mount !== fMount) return false;
      if (!s) return true;
      return [t.orderCode, t.name, t.brand, `${t.h}x${t.w}`, `${t.h}×${t.w}`].some((x) => x.toLowerCase().includes(s));
    });
  }, [templates, q, fMount]);

  const startNew = () => {
    if (!canEdit) { toast(denyReason(user, "catalog.edit"), "err"); return; }
    setEdit(blank());
  };
  const startEdit = (t: CabinetTemplate) => {
    if (!canEdit) { toast(denyReason(user, "catalog.edit"), "err"); return; }
    setEdit({ ...t, note: t.note ?? "", autoCode: false, autoName: false });
  };

  const save = () => {
    if (!edit) return;
    if (!edit.orderCode.trim()) { toast("Укажите заказной шифр", "err"); return; }
    if (edit.kit.length === 0) { toast("Комплект поставки пуст — добавьте компоненты", "err"); return; }
    const t: CabinetTemplate = {
      id: edit.id, orderCode: edit.orderCode.trim(), name: edit.name.trim() || suggestName(edit.mount),
      direction: edit.direction, brand: edit.brand.trim(), mount: edit.mount,
      h: edit.h, w: edit.w, d: edit.d, ip: edit.ip,
      kit: edit.kit, fillItems: edit.fillItems, assemblyHours: edit.assemblyHours,
      note: edit.note.trim() || undefined,
      createdAt: templates.find((x) => x.id === edit.id)?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    upsertTemplate(t);
    toast(edit.fillItems.length > 0 ? `Преднаполненный шкаф «${t.orderCode}» сохранён` : `Пустой шкаф «${t.orderCode}» сохранён`);
    setEdit(null);
  };

  const confirmDelete = () => {
    if (!del) return;
    if (deleteTemplate(del.id)) toast(`Шаблон «${del.orderCode}» удалён`);
    setDel(null);
  };

  const copyDocLine = (t: CabinetTemplate) => {
    const line = templateDocLine(t);
    void navigator.clipboard?.writeText(line).catch(() => undefined);
    toast("Строка для ТКП скопирована в буфер обмена", "info");
  };

  return (
    <div className="anim-step">
      {/* ---------- заголовок ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-dark text-white"><IcLayers size={19} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] font-bold text-ink">Конфигуратор шкафов</h2>
          <p className="text-[11.5px] text-mute">Пустые и преднаполненные корпуса с заказным шифром — вставляются в ТКП одной позицией с комплектом поставки и часами сборки в цене</p>
        </div>
        <Btn onClick={startNew} title={canEdit ? undefined : denyReason(user, "catalog.edit")}>
          <IcPlus size={14} /> Новый шаблон
        </Btn>
      </div>

      {/* ---------- фильтры ---------- */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Input value={q} onChange={setQ} placeholder="Поиск: шифр, габарит, бренд…" />
        </div>
        <Seg
          value={fMount}
          onChange={(v) => setFMount(v as typeof fMount)}
          options={[{ value: "any", label: "Все" }, { value: "floor", label: "Напольные" }, { value: "wall", label: "Навесные" }]}
        />
        <span className="text-[11.5px] font-semibold text-mute">{list.length} из {templates.length}</span>
      </div>

      {/* ---------- список ---------- */}
      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<IcBox size={22} />} title="Шаблонов нет" text="Создайте пустой или преднаполненный шкаф — он появится здесь и будет доступен в ТКП.">
            <Btn onClick={startNew}><IcPlus size={14} /> Создать первый шаблон</Btn>
          </EmptyState>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {list.map((t) => (
            <div key={t.id} className="group rounded-xl border border-line bg-card p-4 transition-all duration-150 hover:border-line2 hover:shadow-md">
              <div className="flex items-start gap-3">
                <div className={cx("flex h-11 w-9 shrink-0 items-end justify-center rounded-md border border-line2 bg-gradient-to-b from-line/40 to-line/80 pb-1", t.mount === "wall" && "h-9")}>
                  <span className="mb-1 h-3 w-4 rounded-[2px] border border-dark/40 bg-paper" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-bold text-accent-deep">{t.orderCode}</span>
                    <Badge cls={t.fillItems.length > 0 ? "bg-accent-soft text-accent-deep" : "bg-steel-soft text-steel"}>
                      {t.fillItems.length > 0 ? `преднаполненный · ${t.fillItems.length} поз` : "пустой"}
                    </Badge>
                    <Badge cls="bg-dark text-white">{DIRECTIONS[t.direction].label}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-[12.5px] font-semibold text-ink">{t.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10.5px] text-mute">
                    <span>{templateLabel(t)}</span>
                    <span>{t.brand || "—"}</span>
                    <span>{t.assemblyHours} ч сборки</span>
                  </div>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-[13.5px] font-bold text-ink">{fmtMoney(templateTotal(t))}</span>
                  <span className="text-[9px] font-semibold tracking-wide text-mute uppercase">закупка</span>
                </span>
              </div>

              <div className="mt-2.5 rounded-md border border-dashed border-line bg-paper/60 px-3 py-2 text-[11px] leading-relaxed text-ink2">
                <span className="font-bold text-mute">Комплект поставки: </span>
                {t.kit.map((k) => (k.qty > 1 ? `${k.name} — ${k.qty} шт` : k.name)).join("; ")}
              </div>

              <div className="mt-2.5 flex items-center gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
                <Btn size="xs" variant="outline" onClick={() => copyDocLine(t)}><IcCopy size={12} /> Строка для ТКП</Btn>
                <span className="ml-auto" />
                {canEdit && <IconBtn title="Редактировать" onClick={() => startEdit(t)}><IcPencil size={14} /></IconBtn>}
                {canDelete && <IconBtn title="Удалить" danger onClick={() => setDel(t)}><IcTrash size={14} /></IconBtn>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- создание / редактирование ---------- */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit && templates.some((x) => x.id === edit.id) ? "Редактирование шаблона шкафа" : "Новый шаблон шкафа"} w="max-w-3xl"
        footer={edit && (
          <>
            <Btn variant="ghost" onClick={() => setEdit(null)}>Отмена</Btn>
            <Btn onClick={save}><IcWand size={14} /> Сохранить шаблон</Btn>
          </>
        )}>
        {edit && <TplForm d={edit} set={(p) => setEdit((s) => (s ? { ...s, ...p } : s))} pool={pool} />}
      </Modal>

      {/* ---------- подтверждение удаления ---------- */}
      <Modal open={!!del} onClose={() => setDel(null)} title="Удалить шаблон?" w="max-w-md"
        footer={del && (
          <>
            <Btn variant="ghost" onClick={() => setDel(null)}>Отмена</Btn>
            <Btn variant="danger" onClick={confirmDelete}><IcTrash size={14} /> Удалить</Btn>
          </>
        )}>
        {del && (
          <div className="text-[12.5px] leading-relaxed text-ink2">
            Шаблон <b className="font-mono text-ink">{del.orderCode}</b> ({templateLabel(del)}) будет удалён.
            Уже вставленные в ТКП позиции не изменятся — они хранятся снимками.
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============================================================
   Форма шаблона: монтаж → габариты → IP → комплект поставки
   (авто) → преднаполнение → часы → заказной шифр.
   ============================================================ */
function TplForm({ d, set, pool }: {
  d: DraftTpl;
  set: (p: Partial<DraftTpl>) => void;
  pool: { id: string; sku: string; name: string; brand: string; unit: string; purchase: number; category: string }[];
}) {
  const mount = MOUNTS.find((m) => m.v === d.mount) ?? MOUNTS[0];
  const kitSum = kitTotal(d.kit);
  const fillSum = d.fillItems.reduce((s, i) => s + i.qty * i.purchase, 0);
  const autoHours = autoAssemblyHours(d.mount, d.h, d.w);
  const suggestedCode = suggestOrderCode({ mount: d.mount, h: d.h, w: d.w, d: d.d, ip: d.ip, fillItems: d.fillItems });

  const setDims = (patch: Partial<Pick<DraftTpl, "mount" | "h" | "w" | "d">>) => {
    const m = patch.mount ?? d.mount;
    const mm = MOUNTS.find((x) => x.v === m) ?? MOUNTS[0];
    const h = patch.h ?? (mm.heights.includes(d.h) ? d.h : mm.heights[0]);
    const w = patch.w ?? (mm.widths.includes(d.w) ? d.w : mm.widths[0]);
    const dd = patch.d ?? (mm.depths.includes(d.d) ? d.d : mm.depths[0]);
    set({
      mount: m, h, w, d: dd,
      kit: baseKit(m, h, w, dd),
      assemblyHours: autoAssemblyHours(m, h, w),
      orderCode: d.autoCode ? suggestOrderCode({ mount: m, h, w, d: dd, ip: d.ip, fillItems: d.fillItems }) : d.orderCode,
      name: d.autoName ? suggestName(m) : d.name,
    });
  };

  const setIp = (ip: number) =>
    set({ ip, orderCode: d.autoCode ? suggestOrderCode({ mount: d.mount, h: d.h, w: d.w, d: d.d, ip, fillItems: d.fillItems }) : d.orderCode });

  const addFill = (eqId: string) => {
    const e = pool.find((x) => x.id === eqId);
    if (!e) return;
    const ex = d.fillItems.find((x) => x.eqId === eqId);
    set({
      fillItems: ex
        ? d.fillItems.map((x) => (x.eqId === eqId ? { ...x, qty: x.qty + 1 } : x))
        : [...d.fillItems, { id: genId("fill"), eqId, sku: e.sku, name: e.name, brand: e.brand, unit: e.unit, qty: 1, purchase: e.purchase }],
      orderCode: d.autoCode ? suggestOrderCode({ mount: d.mount, h: d.h, w: d.w, d: d.d, ip: d.ip, fillItems: [...d.fillItems, { id: "x" } as LineItem] }) : d.orderCode,
    });
  };

  const setFillQty = (eqId: string, qty: number) =>
    set({
      fillItems: qty <= 0
        ? d.fillItems.filter((x) => x.eqId !== eqId)
        : d.fillItems.map((x) => (x.eqId === eqId ? { ...x, qty } : x)),
    });

  return (
    <div className="grid gap-4">
      {/* монтаж + бренд + направление */}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Тип монтажа">
          <Seg value={d.mount} onChange={(v) => setDims({ mount: v as DraftTpl["mount"] })}
            options={MOUNTS.map((m) => ({ value: m.v, label: m.label }))} />
        </Field>
        <Field label="Производитель корпусов">
          <Input value={d.brand} onChange={(v) => set({ brand: v })} placeholder="ПРОВЕНТО, DKC…" />
        </Field>
        <Field label="Направление работ">
          <Select value={d.direction} onChange={(v) => set({ direction: v as DraftTpl["direction"] })}
            options={(Object.keys(DIRECTIONS) as (keyof typeof DIRECTIONS)[]).map((k) => ({ value: k, label: DIRECTIONS[k].label }))} />
        </Field>
      </div>

      {/* габариты + IP */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Высота, мм">
          <Select value={String(d.h)} onChange={(v) => setDims({ h: Number(v) })} options={mount.heights.map((x) => ({ value: String(x), label: String(x) }))} />
        </Field>
        <Field label="Ширина, мм">
          <Select value={String(d.w)} onChange={(v) => setDims({ w: Number(v) })} options={mount.widths.map((x) => ({ value: String(x), label: String(x) }))} />
        </Field>
        <Field label="Глубина, мм">
          <Select value={String(d.d)} onChange={(v) => setDims({ d: Number(v) })} options={mount.depths.map((x) => ({ value: String(x), label: String(x) }))} />
        </Field>
        <Field label="Степень защиты">
          <Select value={String(d.ip)} onChange={(v) => setIp(Number(v))}
            options={[31, 54, 55, 65, 66].map((x) => ({ value: String(x), label: `IP${x}` }))} />
        </Field>
      </div>

      <div className="rounded-lg border border-line bg-paper/60 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink2">
        {d.mount === "floor"
          ? <>Напольный {d.h}×{d.w}×{d.d}: дверей — <b className="text-ink">{doorCount(d.w)}</b>{d.w >= 1000 && " (распашные)"}, траверс — <b className="text-ink">{traverseCount(d.h)}</b>, цоколь 100 мм с фланцами.</>
          : <>Навесной {d.h}×{d.w}×{d.d}: цельносварной корпус, 1 дверь, кронштейны настенного крепления в комплекте.</>}
      </div>

      {/* комплект поставки */}
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Комплект поставки (корпус)</div>
          <span className="font-mono text-[12px] font-bold text-ink">{fmtMoney(kitSum)}</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-lg border border-line">
          {d.kit.map((k) => (
            <div key={k.key} className="flex items-center gap-2.5 border-b border-line/60 px-3 py-1.5 text-[12px] last:border-b-0">
              <input
                value={k.name}
                onChange={(e) => set({ kit: d.kit.map((x) => (x.key === k.key ? { ...x, name: e.target.value } : x)) })}
                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold text-ink outline-none hover:border-line focus:border-steel focus:bg-card"
              />
              <Stepper value={k.qty} onChange={(v) => set({ kit: d.kit.map((x) => (x.key === k.key ? { ...x, qty: Math.max(1, Math.round(v)) } : x)) })} />
              <span className="w-20 text-right font-mono text-[11.5px] font-semibold text-mute">{fmtMoney(k.qty * k.purchase)}</span>
              <IconBtn title="Убрать из комплекта" danger onClick={() => set({ kit: d.kit.filter((x) => x.key !== k.key) })}>
                <IcTrash size={13} />
              </IconBtn>
            </div>
          ))}
          {d.kit.length === 0 && <div className="px-3 py-2 text-[12px] text-mute">Компонентов нет — добавьте ниже или смените габариты (комплект пересчитается).</div>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Input value="" onChange={() => undefined} placeholder="Название компонента…" className="h-8 w-56 text-[12px]" />
          <Btn size="sm" variant="outline" onClick={() => {
            const name = (document.querySelector<HTMLInputElement>('input[placeholder="Название компонента…"]'))?.value?.trim();
            if (!name) return;
            set({ kit: [...d.kit, { key: `custom-${genId("k")}`, name, qty: 1, unit: "шт", purchase: 500 }] });
          }}><IcPlus size={13} /> Добавить компонент</Btn>
          <span className="text-[10.5px] text-mute">цена нового компонента — 500 ₽ (отредактируйте ниже в списке)</span>
        </div>
      </div>

      {/* преднаполнение */}
      <div>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Преднаполнение (АВ на микроклимат/освещение…)</div>
          <span className="font-mono text-[12px] font-bold text-ink">{fmtMoney(fillSum)}</span>
        </div>
        {d.fillItems.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg border border-line">
            {d.fillItems.map((f) => (
              <div key={f.eqId} className="flex items-center gap-2.5 border-b border-line/60 px-3 py-1.5 text-[12px] last:border-b-0">
                <span className="min-w-0 flex-1 truncate font-semibold text-ink2">{f.name}</span>
                <Stepper value={f.qty} onChange={(v) => setFillQty(f.eqId, Math.round(v))} />
                <span className="w-20 text-right font-mono text-[11.5px] font-semibold text-mute">{fmtMoney(f.qty * f.purchase)}</span>
                <IconBtn title="Убрать" danger onClick={() => setFillQty(f.eqId, 0)}><IcTrash size={13} /></IconBtn>
              </div>
            ))}
          </div>
        )}
        <div className="mt-1.5 max-w-md">
          <Select value="" onChange={(v) => v && addFill(v)}
            options={[{ value: "", label: "＋ Добавить позицию из справочника…" }, ...pool.map((e) => ({ value: e.id, label: `${e.sku} — ${e.name.slice(0, 48)} · ${fmtMoney(e.purchase)}` }))]} />
        </div>
      </div>

      {/* часы + шифр */}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Часы сборки изделия, ч" hint={`Рекомендовано по габариту: ${autoHours} ч — включаются в стоимость изделия`}>
          <NumInput value={d.assemblyHours} step={0.5} onChange={(v) => set({ assemblyHours: Math.max(0, v) })} />
        </Field>
        <Field label="Заказной шифр" hint={d.autoCode ? `авто: ${suggestedCode}` : "свой шифр"}>
          <div className="flex gap-1.5">
            <Input value={d.orderCode} onChange={(v) => set({ orderCode: v, autoCode: false })} placeholder="ШН-2000.800.600-IP54" />
            <Btn size="sm" variant="outline" onClick={() => set({ orderCode: suggestedCode, autoCode: true })} title="Подставить автоматический шифр"><IcWand size={13} /></Btn>
          </div>
        </Field>
      </div>

      <Field label="Наименование изделия" hint={d.autoName ? "по типу монтажа" : "своё наименование"}>
        <Input value={d.name} onChange={(v) => set({ name: v, autoName: false })} placeholder="Шкаф напольный распределительный" />
      </Field>

      <Field label="Примечание (необязательно)">
        <Textarea value={d.note} onChange={(v) => set({ note: v })} rows={2} placeholder="Например: под освещение и обогрев шкафа уличной установки" />
      </Field>

      {/* превью строки для ТКП */}
      <div className="rounded-lg border border-accent/40 bg-accent-soft/40 px-3.5 py-2.5">
        <div className="text-[10px] font-bold tracking-wide text-accent-deep uppercase">Так изделие попадёт в ТКП заказчика</div>
        <div className="mt-1 text-[12px] leading-relaxed text-ink">
          {templateDocLine({ name: d.name || suggestName(d.mount), mount: d.mount, h: d.h, w: d.w, d: d.d, ip: d.ip, kit: d.kit })}
        </div>
        <div className="mt-1.5 font-mono text-[11px] font-bold text-accent-deep">
          Итого изделие: {fmtMoney(kitSum + fillSum)} (закупка) · {d.assemblyHours} ч сборки в цене
        </div>
      </div>
    </div>
  );
}
