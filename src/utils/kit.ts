/* ============================================================
   КОНФИГУРАТОР СОСТАВНЫХ ШКАФОВ (чистая логика, без React).
   По образцу PROVENTO и конфигуратора DKC CQE / CQE N: корпус
   собирается как комплект — каркас (стойки), крыша/основание,
   боковые и монтажные панели, двери, траверсы, цоколи.

   «Стена к стене»: на ряд из N шкафов нужно N+1 боковых панелей
   (вместо 2×N по отдельности) и N−1 комплектов соединения.

   Модуль не знает про React и HTTP — при переносе на сервер
   зеркалируется в C# (KitEngine.cs) без изменений контракта
   (см. DOCS.md, принципы архитектуры).
   ============================================================ */

export interface KitInput {
  systemId: string;
  h: number;
  w: number;
  d: number;
  /** дверей на шкаф (для напольных 1 или 2; настенные — всегда 1) */
  doors: number;
  /** шкафы стыкуются в ряд «стена к стене» */
  wallRow: boolean;
  /** шкафов в ряду (учитывается при wallRow) */
  rowSize: number;
  /** нужны ли цоколи (только напольные системы) */
  pedestal: boolean;
}

export type KitGroup = "frame" | "skin" | "door" | "mount" | "base" | "joint";

export const KIT_GROUP_LABEL: Record<KitGroup, string> = {
  frame: "Каркас",
  skin: "Обшивка",
  door: "Двери",
  mount: "Монтаж",
  base: "Цоколь",
  joint: "Стыковка ряда",
};

/** Позиция комплекта — готова к превращению в LineItem (snapshot закупочной цены). */
export interface KitLine {
  key: string; // стабильный ключ (eqId для LineItem-снимка)
  sku: string;
  name: string;
  unit: string;
  qty: number;
  purchase: number; // закупочная цена за единицу, ₽
  group: KitGroup;
}

export interface KitSystem {
  id: string;
  name: string;
  short: string; // для имени шкафа: «CQE 1800×600×400»
  brand: string;
  mount: "floor" | "wall";
  ip: number;
  note: string;
  heights: number[];
  widths: number[];
  depths: number[];
  maxDoors: number;
  prices: KitPrices;
}

export interface KitPrices {
  /** каркас/рама, за комплект на один шкаф */
  frame: (h: number) => number;
  /** крыша (напольные) */
  roof?: (w: number) => number;
  /** основание с кабельным вводом (напольные) */
  base?: (w: number) => number;
  /** боковая панель, за штуку */
  panelSide: (h: number, d: number) => number;
  /** монтажная панель, за штуку */
  panelMount: (w: number, h: number) => number;
  /** дверь, за штуку */
  door: (w: number, h: number) => number;
  /** траверса (задняя), за штуку — 2 на шкаф */
  traverse?: (w: number) => number;
  /** цоколь 100 мм, за штуку */
  pedestal?: (w: number, d: number) => number;
  /** комплект соединения шкафов в ряд, за стык */
  joint?: number;
}

/* ---------------- вспомогательное: ближайший типоразмер ---------------- */

const nearest = (m: Record<number, number>, v: number): number => {
  const keys = Object.keys(m).map(Number);
  let best = keys[0];
  for (const k of keys) if (Math.abs(k - v) < Math.abs(best - v)) best = k;
  return m[best];
};

const round10 = (x: number) => Math.round(x / 10) * 10;

/* ---------------- ценовые таблицы (закупочные, ₽) ---------------- */

const CQE: KitSystem = {
  id: "cqe",
  name: "CQE — напольный сборный",
  short: "CQE",
  brand: "DKC",
  mount: "floor",
  ip: 54,
  note: "Сборный каркас 1800–2200 мм, IP54. Для ГРЩ, ВРУ, АВР и шкафов АСУ, стыкуется в ряд.",
  heights: [1800, 2000, 2200],
  widths: [600, 800, 1000, 1200],
  depths: [400, 600, 800],
  maxDoors: 2,
  prices: {
    frame: (h) => nearest({ 1800: 5400, 2000: 5900, 2200: 6400 }, h),
    roof: (w) => nearest({ 600: 2100, 800: 2500, 1000: 2950, 1200: 3400 }, w),
    base: (w) => nearest({ 600: 2400, 800: 2850, 1000: 3350, 1200: 3900 }, w),
    panelSide: (h, d) =>
      nearest(
        {
          1800: nearest({ 400: 1450, 600: 1700, 800: 1950 }, d),
          2000: nearest({ 400: 1600, 600: 1900, 800: 2150 }, d),
          2200: nearest({ 400: 1750, 600: 2050, 800: 2350 }, d),
        },
        h
      ),
    panelMount: (w, h) =>
      round10(nearest({ 600: 2050, 800: 2550, 1000: 3050, 1200: 3550 }, w) * nearest({ 1800: 1, 2000: 1.08, 2200: 1.16 }, h)),
    door: (w, h) =>
      round10(nearest({ 600: 3100, 800: 3700, 1000: 4400, 1200: 5100 }, w) * nearest({ 1800: 1, 2000: 1.07, 2200: 1.14 }, h)),
    traverse: (w) => nearest({ 600: 430, 800: 540, 1000: 660, 1200: 780 }, w),
    pedestal: (w, d) =>
      nearest(
        {
          600: nearest({ 400: 1900, 600: 2200, 800: 2500 }, d),
          800: nearest({ 400: 2300, 600: 2650, 800: 3000 }, d),
          1000: nearest({ 400: 2700, 600: 3100, 800: 3500 }, d),
          1200: nearest({ 400: 3100, 600: 3550, 800: 4000 }, d),
        },
        w
      ),
    joint: 890,
  },
};

const CQEN: KitSystem = {
  id: "cqen",
  name: "CQE N — навесной",
  short: "CQE N",
  brand: "DKC",
  mount: "wall",
  ip: 66,
  note: "Навесной корпус 400–1000 мм, IP66. Для щитов управления, учёта и локальной автоматики.",
  heights: [400, 600, 800, 1000],
  widths: [300, 400, 500, 600, 800],
  depths: [150, 200, 250, 300],
  maxDoors: 1,
  prices: {
    /* рама + задняя стенка — единый корпус */
    frame: (h) => nearest({ 400: 1900, 600: 2600, 800: 3300, 1000: 4100 }, h),
    /* цена от площади, базовая точка 300×400 */
    panelSide: (h, d) => round10(((h * d) / (600 * 200)) * 640),
    panelMount: (w, h) => round10(((w * h) / (300 * 400)) * 480),
    door: (w, h) => round10(((w * h) / (300 * 400)) * 780),
    joint: 490,
  },
};

export const KIT_SYSTEMS: KitSystem[] = [CQE, CQEN];

export const findKitSystem = (id: string): KitSystem =>
  KIT_SYSTEMS.find((s) => s.id === id) ?? CQE;

export const defaultKitInput = (systemId: string): Pick<KitInput, "h" | "w" | "d" | "doors"> => {
  const s = findKitSystem(systemId);
  return {
    h: s.heights[Math.floor(s.heights.length / 2)],
    w: s.widths[0],
    d: s.depths[0],
    doors: 1,
  };
};

/* ---------------- сборка комплекта ---------------- */

export function buildKit(input: KitInput): KitLine[] {
  const s = findKitSystem(input.systemId);
  const P = s.prices;
  const rows = Math.max(1, Math.round(input.rowSize));
  const inRow = input.wallRow && rows > 1;
  const out: KitLine[] = [];
  const push = (l: KitLine) => l.qty > 0 && out.push(l);

  const sku = (suffix: string) => `${s.short.replace(/\s+/g, "").toUpperCase()}-${suffix}`;
  const dims = `${input.h}×${input.w}×${input.d}`;

  /* ---- каркас ---- */
  if (s.mount === "floor") {
    push({
      key: `kit-${s.id}-frame-${input.h}`, sku: sku(`${input.h}-KRK`),
      name: `Каркас ${s.short} ${input.h} мм (комплект 4 стойки)`,
      unit: "компл.", qty: 1, purchase: P.frame(input.h), group: "frame",
    });
    push({
      key: `kit-${s.id}-roof-${input.w}`, sku: sku(`${input.w}-KRSH`),
      name: `Крыша ${s.short} ${input.w} мм`,
      unit: "шт", qty: 1, purchase: P.roof!(input.w), group: "frame",
    });
    push({
      key: `kit-${s.id}-base-${input.w}`, sku: sku(`${input.w}-OSN`),
      name: `Основание ${s.short} ${input.w} мм (с кабельным вводом)`,
      unit: "шт", qty: 1, purchase: P.base!(input.w), group: "frame",
    });
    push({
      key: `kit-${s.id}-trav-${input.w}`, sku: sku(`${input.w}-TRV`),
      name: `Траверса задняя ${s.short} ${input.w} мм`,
      unit: "шт", qty: 2, purchase: P.traverse!(input.w), group: "frame",
    });
  } else {
    push({
      key: `kit-${s.id}-frame-${input.h}`, sku: sku(`${input.h}-KRP`),
      name: `Корпус ${s.short} ${input.h} мм (рама + задняя стенка)`,
      unit: "компл.", qty: 1, purchase: P.frame(input.h), group: "frame",
    });
  }

  /* ---- обшивка: боковые панели, «стена к стене» → ряд+1 ---- */
  push({
    key: `kit-${s.id}-side-${input.h}-${input.d}`, sku: sku(`PB-${input.h}-${input.d}`),
    name: `Панель боковая ${s.short} ${input.h}×${input.d} мм`,
    unit: "шт",
    qty: inRow ? rows + 1 : 2,
    purchase: P.panelSide(input.h, input.d),
    group: "skin",
  });

  /* ---- монтаж ---- */
  push({
    key: `kit-${s.id}-mount-${input.w}-${input.h}`, sku: sku(`PM-${input.w}-${input.h}`),
    name: `Панель монтажная ${s.short} ${input.w}×${input.h} мм`,
    unit: "шт", qty: 1, purchase: P.panelMount(input.w, input.h), group: "mount",
  });

  /* ---- двери ---- */
  const doors = Math.min(Math.max(1, Math.round(input.doors)), s.maxDoors);
  push({
    key: `kit-${s.id}-door-${input.w}-${input.h}`, sku: sku(`DR-${input.w}-${input.h}`),
    name: `Дверь ${s.short} ${input.w}×${input.h} мм (петли, замок, уплотнение)`,
    unit: "шт", qty: doors, purchase: P.door(input.w, input.h), group: "door",
  });

  /* ---- цоколи (напольные, по числу шкафов ряда) ---- */
  if (s.mount === "floor" && input.pedestal && P.pedestal) {
    push({
      key: `kit-${s.id}-ped-${input.w}-${input.d}`, sku: sku(`COK-${input.w}-${input.d}`),
      name: `Цоколь ${s.short} ${input.w}×${input.d} мм, 100 мм, с фланцами`,
      unit: "шт", qty: inRow ? rows : 1, purchase: P.pedestal(input.w, input.d), group: "base",
    });
  }

  /* ---- стыковка ряда ---- */
  if (inRow && P.joint) {
    push({
      key: `kit-${s.id}-joint`, sku: sku("JOIN"),
      name: `Комплект соединения ${s.short} (шины, метизы, стыковые уплотнения)`,
      unit: "компл.", qty: rows - 1, purchase: P.joint, group: "joint",
    });
  }

  return out;
}

/** Итоговая закупочная стоимость комплекта. */
export const kitTotal = (lines: KitLine[]): number =>
  lines.reduce((sum, l) => sum + l.purchase * l.qty, 0);

/** Человекочасы на сборку комплекта (растет с габаритом и стыковкой ряда). */
export function kitAssemblyHours(input: KitInput): number {
  const s = findKitSystem(input.systemId);
  const rows = input.wallRow ? Math.max(2, Math.round(input.rowSize)) : 1;
  const size = (input.h * input.w) / 1e6; // м² фронтальной проекции
  const perCab = s.mount === "floor" ? 1.6 + size * 1.4 : 0.8 + size * 1.1;
  const joints = rows > 1 ? (rows - 1) * 0.6 : 0;
  const pedestals = s.mount === "floor" && input.pedestal ? rows * 0.4 : 0;
  return Math.round((perCab * rows + joints + pedestals) * 10) / 10;
}

/** Человекочитаемое имя собранного корпуса (для названия шкафа). */
export function kitLabel(input: KitInput): string {
  const s = findKitSystem(input.systemId);
  return `${s.short} ${input.h}×${input.w}×${input.d}, IP${s.ip}`;
}
