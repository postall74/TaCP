import type { LineItem } from "../types";

/* ============================================================
   КОНФИГУРАТОР СОСТАВНЫХ ШКАФОВ — чистая логика (без React/HTTP).
   По образцу PROVENTO и конфигуратора DKC CQE N: корпус шкафа —
   это комплект узлов (каркас, крыша, основание, траверсы, панели,
   двери, цоколи). CQE снят с производства — актуальная серия CQE N
   (напольная IP54 и навесная IP66); из напольных также доступен
   PROVENTO ШРС (EKF).

   Порядок подбора (см. Wizard): тип (напольный/навесной) →
   система → габариты (нет типового — ближайшие или ручной ввод) →
   составной ряд (2+ корпусов, «стена к стене»: панели = N+1,
   стыки = N−1, цоколи = N) → дополнительные траверсы.
   ============================================================ */

export interface KitSystem {
  id: string;
  name: string;
  brand: string;
  mount: "floor" | "wall";
  ip: number;
  note: string;
  heights: number[];
  widths: number[];
  depths: number[];
  maxDoors: number;
  k: number; // ценовой коэффициент серии
}

export const KIT_SYSTEMS: KitSystem[] = [
  {
    id: "cqen-floor", name: "CQE N", brand: "DKC", mount: "floor", ip: 54, maxDoors: 2, k: 1,
    note: "Напольный, актуальное поколение (прежний CQE снят с производства)",
    heights: [1800, 2000, 2200], widths: [600, 800, 1000, 1200], depths: [400, 600, 800],
  },
  {
    id: "cqen-wall", name: "CQE N", brand: "DKC", mount: "wall", ip: 66, maxDoors: 1, k: 1,
    note: "Навесной, повышенная защита для уличной установки",
    heights: [400, 600, 800, 1000], widths: [300, 400, 600, 800], depths: [150, 200, 250, 300],
  },
  {
    id: "provento", name: "PROVENTO ШРС", brand: "EKF", mount: "floor", ip: 54, maxDoors: 2, k: 0.85,
    note: "Напольный модульной сборки — экономичная альтернатива",
    heights: [1800, 2000, 2200], widths: [600, 800, 1000], depths: [400, 600],
  },
];

export interface KitInput {
  systemId: string;
  h: number;
  w: number;
  d: number;
  doors: number;
  /** Корпусов в составном шкафу («стена к стене»): 1 — одиночный, 2+ — ряд. */
  joined: number;
  pedestal: boolean;
  /** Дополнительные монтажные траверсы сверх базовых двух (верх/низ), шт. */
  extraTraverses: number;
}

export type KitGroup = "frame" | "skin" | "mount" | "door" | "base" | "joint";

export interface KitLine {
  key: string;
  sku: string;
  name: string;
  qty: number;
  purchase: number; // закупочная за ед.
  group: KitGroup;
}

export const KIT_GROUP_LABEL: Record<KitGroup, string> = {
  frame: "Каркас",
  skin: "Обшивка",
  mount: "Монтаж",
  door: "Двери",
  base: "Цоколь",
  joint: "Соединение",
};

const r10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);

export const findKitSystem = (id: string): KitSystem =>
  KIT_SYSTEMS.find((s) => s.id === id) ?? KIT_SYSTEMS[0];

interface NodePrices {
  corpus: number; frame: number; roof: number; base: number; trav: number;
  side: number; mount: number; door: number; ped: number; joint: number;
}

/** Цены узлов по габаритам (закупочные, ₽). Напольный и навесной — разные составы. */
function nodePrices(sys: KitSystem, h: number, w: number, d: number): NodePrices {
  const k = sys.k;
  if (sys.mount === "wall") {
    return {
      corpus: r10((3600 + 2.2 * (h - 400) + 2.6 * (w - 300) + 1.4 * (d - 150)) * k),
      side: r10((1050 + 1.3 * (h - 400) + 1.6 * (d - 150)) * k),
      mount: r10((950 + 1.2 * (h - 400) + 1.4 * (w - 300)) * k),
      door: r10((1500 + 1.5 * (h - 400) + 1.8 * (w - 300)) * k),
      joint: r10((900 + 1.1 * (w - 300) + 0.8 * (d - 150)) * k),
      frame: 0, roof: 0, base: 0, trav: 0, ped: 0,
    };
  }
  return {
    corpus: 0,
    frame: r10((8200 + 22 * (h - 1800)) * k),
    roof: r10((2400 + 3.2 * (w - 600) + 2.1 * (d - 400)) * k),
    base: r10((2900 + 3.4 * (w - 600) + 2.2 * (d - 400)) * k),
    trav: r10((1150 + 1.9 * (w - 600)) * k),
    side: r10((1900 + 1.6 * (h - 1800) + 2.4 * (d - 400)) * k),
    mount: r10((1700 + 1.5 * (h - 1800) + 1.8 * (w - 600)) * k),
    door: r10((3200 + 1.7 * (h - 1800) + 2.0 * (w - 600)) * k),
    ped: r10((1900 + 2.0 * (w - 600) + 1.5 * (d - 400)) * k),
    joint: r10((1400 + 1.6 * (w - 600) + 1.2 * (d - 400)) * k),
  };
}

/**
 * Состав комплекта. Составной ряд из N корпусов («стена к стене»):
 * каркасы/крыши/основания/траверсы/монтажные панели/двери — по числу
 * корпусов; боковых панелей N+1 (вместо 2N); стыковых комплектов N−1;
 * цоколей N. Дополнительные траверсы — отдельной строкой.
 */
export function buildKit(input: KitInput): KitLine[] {
  const sys = findKitSystem(input.systemId);
  const n = Math.max(1, Math.min(6, Math.round(input.joined)));
  const extra = Math.max(0, Math.min(20, Math.round(input.extraTraverses)));
  const p = nodePrices(sys, input.h, input.w, input.d);
  const tag = `${sys.name} ${input.h}×${input.w}×${input.d}`;
  const lines: KitLine[] = [];

  if (sys.mount === "wall") {
    lines.push({ key: `wall-${input.h}-${input.w}-${input.d}`, sku: `${sys.name} КОРПУС ${input.h}×${input.w}×${input.d}`, name: `Корпус ${tag} (рама + задняя стенка), IP${sys.ip}`, qty: n, purchase: p.corpus, group: "frame" });
    lines.push({ key: `side-${input.h}-${input.d}`, sku: `${sys.name} ПБ ${input.h}×${input.d}`, name: `Панель боковая ${tag}`, qty: n + 1, purchase: p.side, group: "skin" });
    lines.push({ key: `mount-${input.h}-${input.w}`, sku: `${sys.name} МП ${input.h}×${input.w}`, name: `Панель монтажная ${tag}`, qty: n, purchase: p.mount, group: "mount" });
    lines.push({ key: `door-${input.h}-${input.w}`, sku: `${sys.name} ДВ ${input.h}×${input.w}`, name: `Дверь ${tag}`, qty: n, purchase: p.door, group: "door" });
    if (n > 1) lines.push({ key: `joint-${input.w}-${input.d}`, sku: `${sys.name} СТЫК ${input.w}`, name: `Комплект стыковой (соединение корпусов)`, qty: n - 1, purchase: p.joint, group: "joint" });
    return lines;
  }

  lines.push({ key: `frame-${input.h}`, sku: `${sys.name} КАРКАС ${input.h}`, name: `Каркас (4 стойки) ${tag}`, qty: n, purchase: p.frame, group: "frame" });
  lines.push({ key: `roof-${input.w}-${input.d}`, sku: `${sys.name} КРЫША ${input.w}×${input.d}`, name: `Крыша ${tag}`, qty: n, purchase: p.roof, group: "frame" });
  lines.push({ key: `base-${input.w}-${input.d}`, sku: `${sys.name} ДНО ${input.w}×${input.d}`, name: `Основание с кабельным вводом ${tag}`, qty: n, purchase: p.base, group: "frame" });
  lines.push({ key: `trav-${input.w}`, sku: `${sys.name} ТРАВЕРСА ${input.w}`, name: `Траверса монтажная ${tag}`, qty: 2 * n, purchase: p.trav, group: "frame" });
  if (extra > 0) lines.push({ key: `trav-x-${input.w}`, sku: `${sys.name} ТРАВЕРСА ${input.w} (доп.)`, name: `Траверса монтажная (дополнительная) ${tag}`, qty: extra, purchase: p.trav, group: "frame" });
  lines.push({ key: `side-${input.h}-${input.d}`, sku: `${sys.name} ПБ ${input.h}×${input.d}`, name: `Панель боковая ${tag}`, qty: n + 1, purchase: p.side, group: "skin" });
  lines.push({ key: `mount-${input.h}-${input.w}`, sku: `${sys.name} МП ${input.h}×${input.w}`, name: `Панель монтажная ${tag}`, qty: n, purchase: p.mount, group: "mount" });
  const doors = Math.max(1, Math.min(sys.maxDoors, Math.round(input.doors)));
  lines.push({ key: `door-${input.h}-${input.w}`, sku: `${sys.name} ДВ ${input.h}×${input.w}`, name: `Дверь ${tag}`, qty: n * doors, purchase: p.door, group: "door" });
  if (input.pedestal) lines.push({ key: `ped-${input.w}-${input.d}`, sku: `${sys.name} ЦОКОЛЬ ${input.w}×${input.d}`, name: `Цоколь 100 мм ${tag}`, qty: n, purchase: p.ped, group: "base" });
  if (n > 1) lines.push({ key: `joint-${input.w}-${input.d}`, sku: `${sys.name} СТЫК ${input.w}`, name: `Комплект стыковой (соединение корпусов)`, qty: n - 1, purchase: p.joint, group: "joint" });
  return lines;
}

export const kitTotal = (lines: KitLine[]): number => lines.reduce((s, l) => s + l.qty * l.purchase, 0);

/** Рекомендованные часы сборки комплекта (ориентир для шага «Работы»). */
export function kitAssemblyHours(input: KitInput): number {
  const sys = findKitSystem(input.systemId);
  const n = Math.max(1, Math.min(6, Math.round(input.joined)));
  const doors = sys.mount === "wall" ? n : n * Math.max(1, Math.min(sys.maxDoors, Math.round(input.doors)));
  const per = sys.mount === "wall" ? 1.5 : 3.5;
  const h =
    per * n +
    (n + 1) * 0.3 + // боковые панели
    doors * 0.4 +
    (input.pedestal ? n * 0.3 : 0) +
    (n > 1 ? (n - 1) * 0.3 : 0) +
    Math.max(0, Math.round(input.extraTraverses)) * 0.15;
  return Math.round(h * 2) / 2;
}

/** Человекочитаемая метка корпуса для названий и документов. */
export function kitLabel(input: KitInput): string {
  const sys = findKitSystem(input.systemId);
  const base = `${sys.name} ${input.h}×${input.w}×${input.d}, IP${sys.ip}`;
  const n = Math.max(1, Math.min(6, Math.round(input.joined)));
  return n > 1 ? `${base} · составной, ${n} корп.` : base;
}

/** Ближайший типовой габарит из сетки системы (когда запрашиваемого нет). */
export function nearestDims(sys: KitSystem, h: number, w: number, d: number): { h: number; w: number; d: number } {
  let best = { h: sys.heights[0], w: sys.widths[0], d: sys.depths[0], dist: Infinity };
  for (const hh of sys.heights)
    for (const ww of sys.widths)
      for (const dd of sys.depths) {
        const dist = Math.abs(hh - h) / 100 + Math.abs(ww - w) / 100 + Math.abs(dd - d) / 100;
        if (dist < best.dist) best = { h: hh, w: ww, d: dd, dist };
      }
  return { h: best.h, w: best.w, d: best.d };
}

/** Есть ли в сетке системы точный габарит. */
export function hasExactDims(sys: KitSystem, h: number, w: number, d: number): boolean {
  return sys.heights.includes(h) && sys.widths.includes(w) && sys.depths.includes(d);
}

/** Преобразование комплекта в позиции шкафа (снапшоты, как справочные). */
export function kitLinesToItems(lines: KitLine[]): LineItem[] {
  return lines.map((l) => ({
    id: l.key,
    eqId: `kit-${l.key}`,
    sku: l.sku,
    name: l.name,
    brand: "Комплект шкафа",
    unit: "шт",
    qty: l.qty,
    purchase: l.purchase,
  }));
}
