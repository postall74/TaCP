import type { CabinetSegment, LineItem, SegmentKind, SeparationForm } from "../types";
import { findEq } from "../data/catalog";
import { genId } from "../utils";

/* ============================================================
   СЕКЦИОНИРОВАНИЕ ШКАФОВ (ГОСТ IEC 61439-2) — чистая логика.
   Отсек = перегородки (параметрическая позиция, цена от высоты
   шкафа) + типовой комплект по типу отсека (позиции справочника).
   Позиции попадают в cabinet.items снапшотами — расчётное ядро
   (calcProject) и экономику не трогаем: единый источник сумм.
   ============================================================ */

export const PARTITION_PRICE_PER_M = 1400; // ₽ за погонный метр высоты перегородки (закупка)

/** Метаданные форм разделения: что форма требует от состава отсеков. */
export const FORM_META: Record<SeparationForm, { label: string; desc: string; needBusbar: boolean; minSegments: number }> = {
  "1":  { label: "Форма 1", desc: "без внутреннего разделения — всё в одном объёме", needBusbar: false, minSegments: 0 },
  "2a": { label: "Форма 2a", desc: "шины отделены от функциональных блоков", needBusbar: true, minSegments: 1 },
  "2b": { label: "Форма 2b", desc: "шины отделены, выводы в общем объёме с блоками", needBusbar: true, minSegments: 1 },
  "3a": { label: "Форма 3a", desc: "блоки отделены друг от друга и от шин; выводы с блоками", needBusbar: true, minSegments: 2 },
  "3b": { label: "Форма 3b", desc: "блоки отделены друг от друга и от шин; выводы отделены от блоков", needBusbar: true, minSegments: 2 },
  "4a": { label: "Форма 4a", desc: "выводы отделены и находятся внутри отсека блока", needBusbar: true, minSegments: 3 },
  "4b": { label: "Форма 4b", desc: "выводы отделены и находятся в отдельном отсеке", needBusbar: true, minSegments: 3 },
};

export const SEGMENT_PRESETS: { kind: SegmentKind; name: string; partitions: number; hint: string }[] = [
  { kind: "input", name: "Вводной отсек", partitions: 1, hint: "вводной аппарат, учёт, УЗИП" },
  { kind: "feeders", name: "Отсек отходящих линий", partitions: 1, hint: "отходящие автоматы, УЗО, гребёнки" },
  { kind: "control", name: "Отсек управления", partitions: 2, hint: "ПЛК, БП, клеммы, реле" },
  { kind: "busbar", name: "Шинный отсек", partitions: 1, hint: "главные шины и шинодержатели" },
  { kind: "cable", name: "Кабельный отсек", partitions: 1, hint: "кабельные присоединения, трассы" },
];

/** Цена перегородки: погонный метр × высота шкафа (минимум 400 мм). */
export function partitionPrice(heightMm: number): number {
  const h = Math.max(400, heightMm) / 1000;
  return Math.round((PARTITION_PRICE_PER_M * h) / 10) * 10;
}

const liFromCatalog = (eqId: string, qty: number): LineItem | null => {
  const e = findEq(eqId);
  if (!e || qty <= 0) return null;
  return { id: genId("seg"), eqId, sku: e.sku, name: e.name, brand: e.brand, unit: e.unit, qty, purchase: e.purchase };
};

/** Типовой комплект отсека (позиции справочника, снапшоты). */
export function segmentKit(kind: SegmentKind): LineItem[] {
  switch (kind) {
    case "input":
      return [liFromCatalog("din-rail", 1), liFromCatalog("bus-n", 1)].filter((x): x is LineItem => !!x);
    case "feeders":
      return [liFromCatalog("din-rail", 1), liFromCatalog("bus-3p", 1)].filter((x): x is LineItem => !!x);
    case "control":
      return [liFromCatalog("din-rail", 2), liFromCatalog("term-4", 20)].filter((x): x is LineItem => !!x);
    case "busbar":
      return [liFromCatalog("holder-1", 4)].filter((x): x is LineItem => !!x);
    default:
      return []; // кабельный/пользовательский — только перегородки
  }
}

export interface SegmentBuild {
  lines: LineItem[];
  partitionQty: number;
  partitionsSum: number;
  hours: number; // рекомендованное добавление к часам сборки
}

/** Состав позиций для набора отсеков: перегородки + комплекты (дедупликация по eqId). */
export function buildSegmentLines(segments: CabinetSegment[], heightMm: number): SegmentBuild {
  const map = new Map<string, LineItem>();
  const add = (it: LineItem | null) => {
    if (!it) return;
    const ex = map.get(it.eqId);
    if (ex) ex.qty += it.qty;
    else map.set(it.eqId, { ...it });
  };

  const partitionQty = segments.reduce((s, x) => s + Math.max(0, Math.min(4, Math.round(x.partitions))), 0);
  if (partitionQty > 0) {
    add({
      id: genId("seg"), eqId: "seg-partition", sku: "ПЕРЕГОРОДКА-ВН",
      name: `Перегородка внутренняя (h ${heightMm} мм), оцинк. сталь`,
      brand: "—", unit: "шт", qty: partitionQty, purchase: partitionPrice(heightMm),
    });
  }
  for (const s of segments) for (const it of segmentKit(s.kind)) add(it);

  const lines = [...map.values()];
  return {
    lines,
    partitionQty,
    partitionsSum: lines.filter((l) => l.eqId === "seg-partition").reduce((s, l) => s + l.qty * l.purchase, 0),
    hours: Math.round(partitionQty * 0.5 * 2) / 2, // 0,5 ч на перегородку
  };
}

/** Слияние позиций сегментов с текущим составом шкафа (qty суммируется по eqId). */
export function mergeSegmentItems(current: LineItem[], lines: LineItem[]): LineItem[] {
  const res = current.map((x) => ({ ...x }));
  for (const l of lines) {
    const ex = res.find((x) => x.eqId === l.eqId);
    if (ex) ex.qty += l.qty;
    else res.push(l);
  }
  return res;
}

/** Дефолтная высота шкафа для расчёта перегородок, когда габарит не задан. */
export const DEFAULT_CABINET_HEIGHT = 1800;
