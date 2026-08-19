import { useMemo, useState } from "react";
import { useStore } from "../store";
import { CATEGORIES, DIRECTIONS, type Direction, type Equipment } from "../types";
import {
  downloadText,
  exportCatalogCsv,
  fmtMoney,
  genId,
  parseCatalogCsv,
  plural,
} from "../utils";
import { Badge, Btn, Field, IconBtn, Input, Modal, NumInput, Select, Textarea, cx } from "./ui";
import {
  IcBox,
  IcDatabase,
  IcDownload,
  IcPencil,
  IcPlus,
  IcSearch,
  IcTrash,
  IcUpload,
} from "./icons";

const DIR_OPTS = [
  { value: "nku", label: "НКУ" },
  { value: "asu", label: "АСУ ТП / АСУ Э" },
  { value: "heat", label: "Электрообогрев" },
  { value: "uni", label: "Универсальное" },
];

const dirBadge = (d: Direction | "uni") =>
  d === "uni" ? (
    <span className="rounded bg-line/60 px-1.5 py-0.5 text-[10.5px] font-bold text-ink2 uppercase">универс.</span>
  ) : (
    <Badge cls={DIRECTIONS[d].badge}>{DIRECTIONS[d].label}</Badge>
  );

export default function CatalogPage() {
  const catalog = useStore((s) => s.catalog);
  const upsertEquipment = useStore((s) => s.upsertEquipment);
  const deleteEquipment = useStore((s) => s.deleteEquipment);
  const importEquipment = useStore((s) => s.importEquipment);
  const toast = useStore((s) => s.toast);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("all");
  const [dir, setDir] = useState("all");
  const [editTarget, setEditTarget] = useState<Equipment | "new" | null>(null);
  const [delTarget, setDelTarget] = useState<Equipment | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const cats = useMemo(() => [...new Set(catalog.map((e) => e.category))].sort((a, b) => a.localeCompare(b, "ru")), [catalog]);
  const brands = useMemo(() => [...new Set(catalog.map((e) => e.brand))].sort((a, b) => a.localeCompare(b, "ru")), [catalog]);

  const list = catalog.filter((e) => {
    if (cat !== "all" && e.category !== cat) return false;
    if (brand !== "all" && e.brand !== brand) return false;
    if (dir !== "all" && e.direction !== dir) return false;
    const s = `${e.sku} ${e.name} ${e.brand} ${e.attrs ?? ""}`.toLowerCase();
    return q.trim() === "" || s.includes(q.trim().toLowerCase());
  });

  return (
    <div className="pb-10">
      <div className="anim-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-steel" />
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-mute uppercase">
              EquipmentCatalog · CRUD + импорт прайсов
            </span>
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Справочник оборудования</h1>
          <p className="mt-1 text-[13.5px] text-mute">
            Номенклатура с закупочными и продажными ценами, категориями и направлениями применения
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <IcUpload size={14} /> Импорт CSV
          </Btn>
          <Btn
            variant="outline"
            size="sm"
            onClick={() => {
              downloadText("equipment-catalog.csv", exportCatalogCsv(catalog), "text/csv;charset=utf-8");
              toast("Каталог выгружен в CSV");
            }}
          >
            <IcDownload size={14} /> Экспорт CSV
          </Btn>
          <Btn size="sm" onClick={() => setEditTarget("new")}>
            <IcPlus size={14} /> Позиция
          </Btn>
        </div>
      </div>

      {/* фильтры */}
      <div className="anim-up mt-5 flex flex-wrap items-center gap-2" style={{ animationDelay: "70ms" }}>
        <div className="relative w-72">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-mute">
            <IcSearch size={15} />
          </span>
          <Input value={q} onChange={setQ} placeholder="Артикул, название, характеристики…" className="pl-9" />
        </div>
        <Select value={cat} onChange={setCat} options={[{ value: "all", label: "Все категории" }, ...cats.map((c) => ({ value: c, label: c }))]} className="w-52" />
        <Select value={brand} onChange={setBrand} options={[{ value: "all", label: "Все бренды" }, ...brands.map((b) => ({ value: b, label: b }))]} className="w-44" />
        <Select value={dir} onChange={setDir} options={[{ value: "all", label: "Все направления" }, ...DIR_OPTS]} className="w-44" />
        <span className="ml-auto font-mono text-[11.5px] font-semibold text-mute">
          {list.length} из {catalog.length} {plural(catalog.length, "позиции", "позиций", "позиций")}
        </span>
      </div>

      {/* таблица */}
      <div className="anim-up mt-3 overflow-hidden rounded-xl border border-line bg-card" style={{ animationDelay: "110ms" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line bg-paper/70 text-[10px] font-bold tracking-wide text-mute uppercase">
                <th className="py-2.5 pl-4">Артикул</th>
                <th className="py-2.5">Наименование</th>
                <th className="py-2.5">Бренд</th>
                <th className="py-2.5">Категория</th>
                <th className="py-2.5">Направление</th>
                <th className="py-2.5">Ед.</th>
                <th className="py-2.5 text-right">Закупка</th>
                <th className="py-2.5 pr-2 text-right">Цена продажи</th>
                <th className="w-20 py-2.5 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="group border-b border-line/60 transition-colors last:border-b-0 hover:bg-paper/70">
                  <td className="py-2.5 pl-4 font-mono text-[11.5px] font-semibold whitespace-nowrap text-ink2">{e.sku}</td>
                  <td className="max-w-[340px] py-2.5 pr-3">
                    <div className="truncate text-[13px] font-semibold text-ink">{e.name}</div>
                    {e.attrs && <div className="truncate text-[10.5px] text-mute">{e.attrs}</div>}
                  </td>
                  <td className="py-2.5 pr-3 text-[12px] whitespace-nowrap text-ink2">{e.brand}</td>
                  <td className="py-2.5 pr-3 text-[12px] whitespace-nowrap text-mute">{e.category}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{dirBadge(e.direction)}</td>
                  <td className="py-2.5 pr-3 font-mono text-[11.5px] text-mute">{e.unit}</td>
                  <td className="py-2.5 text-right font-mono text-[12px] text-mute tabular-nums">{fmtMoney(e.purchase)}</td>
                  <td className="py-2.5 pr-2 text-right font-mono text-[12.5px] font-bold text-ink tabular-nums">{fmtMoney(e.price)}</td>
                  <td className="py-2.5 pr-2 text-right">
                    <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <IconBtn title="Редактировать" onClick={() => setEditTarget(e)}>
                        <IcPencil size={14} />
                      </IconBtn>
                      <IconBtn title="Удалить" danger onClick={() => setDelTarget(e)}>
                        <IcTrash size={14} />
                      </IconBtn>
                    </span>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[13px] text-mute">
                    <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-dark text-steel">
                      <IcBox size={18} />
                    </span>
                    По заданным фильтрам позиций не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <EquipmentModal target={editTarget} onClose={() => setEditTarget(null)} onSave={(e) => {
        upsertEquipment(e);
        toast(editTarget === "new" ? `Позиция «${e.sku}» добавлена` : "Позиция обновлена");
        setEditTarget(null);
      }} />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={(items) => {
        const n = importEquipment(items);
        toast(`Импортировано ${n} ${plural(n, "позиция", "позиции", "позиций")}`);
        setImportOpen(false);
      }} />

      <Modal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        title="Удалить позицию из справочника?"
        w="max-w-md"
        footer={
          <>
            <Btn variant="outline" onClick={() => setDelTarget(null)}>Отмена</Btn>
            <Btn variant="danger" onClick={() => {
              if (delTarget) {
                deleteEquipment(delTarget.id);
                toast("Позиция удалена из справочника", "err");
              }
              setDelTarget(null);
            }}>
              <IcTrash size={14} /> Удалить
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-ink2">
          <b>{delTarget?.sku}</b> — «{delTarget?.name}» будет удалена из справочника. В уже созданных ТКП позиции
          сохраняются (цены зафиксированы снимком при добавлении).
        </p>
      </Modal>
    </div>
  );
}

/* ---------------- редактирование позиции ---------------- */

function EquipmentModal({
  target,
  onClose,
  onSave,
}: {
  target: Equipment | "new" | null;
  onClose: () => void;
  onSave: (e: Equipment) => void;
}) {
  const toast = useStore((s) => s.toast);
  const isNew = target === "new";
  const base: Equipment =
    target && target !== "new"
      ? target
      : { id: genId("eq"), sku: "", name: "", brand: "", category: CATEGORIES[0], direction: "nku", unit: "шт", purchase: 0, price: 0, attrs: "" };
  const [f, setF] = useState<Equipment>(base);

  // синхронизация при смене target
  const [seen, setSeen] = useState(target);
  if (target !== seen) {
    setSeen(target);
    setF(target && target !== "new" ? target : { ...base, id: genId("eq") });
  }

  if (!target) return null;

  const valid = f.sku.trim() && f.name.trim() && f.price > 0;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={isNew ? "Новая позиция справочника" : `Редактирование · ${base.sku}`}
      w="max-w-2xl"
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>Отмена</Btn>
          <Btn
            disabled={!valid}
            onClick={() => {
              if (!valid) {
                toast("Заполните артикул, название и цену продажи", "err");
                return;
              }
              onSave({ ...f, attrs: f.attrs?.trim() || undefined });
            }}
          >
            {isNew ? <IcPlus size={14} /> : <IcPencil size={14} />} {isNew ? "Добавить" : "Сохранить"}
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Артикул">
          <Input value={f.sku} onChange={(v) => setF({ ...f, sku: v })} placeholder="Например: iK60N C16 1P" autoFocus={isNew} />
        </Field>
        <Field label="Производитель">
          <Input value={f.brand} onChange={(v) => setF({ ...f, brand: v })} placeholder="Schneider Electric" />
        </Field>
        <Field label="Наименование" className="col-span-2">
          <Input value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Автоматический выключатель 1P C16" />
        </Field>
        <Field label="Категория (тип)">
          <Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Направление">
          <Select value={f.direction} onChange={(v) => setF({ ...f, direction: v as Equipment["direction"] })} options={DIR_OPTS} />
        </Field>
        <Field label="Ед. измерения">
          <Input value={f.unit} onChange={(v) => setF({ ...f, unit: v })} placeholder="шт / м / компл." />
        </Field>
        <Field label="Характеристики">
          <Input value={f.attrs ?? ""} onChange={(v) => setF({ ...f, attrs: v })} placeholder="6 кА, 230 В" />
        </Field>
        <Field label="Цена закупки, ₽">
          <NumInput value={f.purchase} onChange={(v) => setF({ ...f, purchase: Math.max(0, v) })} step={10} />
        </Field>
        <Field label="Цена продажи, ₽">
          <NumInput value={f.price} onChange={(v) => setF({ ...f, price: Math.max(0, v) })} step={10} />
        </Field>
      </div>
      {f.purchase > 0 && f.price > 0 && (
        <div className="mt-3 rounded-md bg-ok-soft px-3 py-2 font-mono text-[11.5px] text-ok">
          Маржа позиции: {(((f.price - f.purchase) / f.price) * 100).toFixed(1)} % · наценка{" "}
          {(((f.price - f.purchase) / f.purchase) * 100).toFixed(0)} %
        </div>
      )}
    </Modal>
  );
}

/* ---------------- импорт CSV ---------------- */

const CSV_SAMPLE = `артикул;наименование;бренд;категория;направление;ед;закупка;цена;характеристики
KM1-40;Контактор КМ1-40 40А 230В;IEK;Контакторы и реле;нку;шт;1450;2290;AC-3
PLC-200;Контроллер ПЛК-200 Ethernet;ОВЕН;ПЛК и модули;асу;шт;29800;39400;CODESYS
HC-25;Кабель греющий 25 Вт/м;ССТ;Греющий кабель;обогрев;м;240;350;саморег.`;

function ImportModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (items: Omit<Equipment, "id">[]) => void;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseCatalogCsv(text), [text]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Импорт прайс-листа (CSV)"
      w="max-w-2xl"
      footer={
        <>
          <Btn variant="ghost" onClick={() => setText(CSV_SAMPLE)}>
            <IcDatabase size={14} /> Вставить пример
          </Btn>
          <Btn variant="outline" onClick={onClose}>Отмена</Btn>
          <Btn disabled={parsed.items.length === 0} onClick={() => { onImport(parsed.items); setText(""); }}>
            <IcUpload size={14} /> Импортировать {parsed.items.length > 0 ? `(${parsed.items.length})` : ""}
          </Btn>
        </>
      }
    >
      <p className="mb-2 text-[12px] leading-relaxed text-mute">
        Вставьте содержимое CSV/Excel-выгрузки. Разделители: «;», «,» или табуляция. Колонки:{" "}
        <span className="font-mono text-[11px] text-ink2">артикул; наименование; бренд; категория; направление; ед; закупка; цена; характеристики</span>.
        Первая строка-заголовок пропускается автоматически.
      </p>
      <Textarea rows={8} value={text} onChange={setText} placeholder={CSV_SAMPLE} />
      <div className={cx(
        "mt-2 flex items-center justify-between rounded-md px-3 py-2 font-mono text-[11.5px]",
        parsed.items.length ? "bg-ok-soft text-ok" : "bg-paper text-mute"
      )}>
        <span>Распознано позиций: <b>{parsed.items.length}</b></span>
        {parsed.skipped > 0 && <span className="text-warn">пропущено строк: {parsed.skipped}</span>}
      </div>
    </Modal>
  );
}
