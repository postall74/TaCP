import type { Equipment, LineItem, Project, Rates } from "./types";

/* ============================================================
   УТИЛИТЫ И РАСЧЁТНОЕ ЯДРО. Чистые функции — без React/HTTP.
   Зеркало расчёта на сервере — CalcEngine.cs (сценарии общих
   тестов: utils.test.ts ⇄ CalcEngineTests.cs).
   ============================================================ */

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";

/** Деньги с копейками (строки панели экономики). */
export const fmtMoney2 = (n: number) =>
  new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + " ₽";

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });

export const fmtDateShort = (ts: number) =>
  new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

let seq = 0;
export const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

let seq = 0;
export const genId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Округление до 0,5 (часы сборки). */
export const roundHalf = (x: number) => Math.round(x * 2) / 2;

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ------------------------- расчётное ядро ------------------------- */

export interface CalcFields {
  markup: number; workMarkup: number; discount: number; vatRate: number;
  transportPct: number; tzzPct: number; thirdParty: number; extraCosts: number;
  unforeseenPct: number; tripCosts: number; smrCost: number; smrSell: number;
  pnrCost: number; pnrSell: number;
}

export interface CabCalc {
  cab: Project["cabinets"][number];
  eqBase: number;      // закупочная база = себестоимость оборудования
  eqCost: number;
  markupSum: number;
  laborCost: number;   // работы по ставкам (ФОТ)
  laborSell: number;   // работы в продаже
  total: number;
  posCount: number;
}

export interface ProjCalc {
  cabs: CabCalc[];
  eqBase: number;
  eqCost: number;
  posCount: number;        // позиций во всех шкафах
  markupSum: number;
  cabinetsSell: number;    // шкафы в продаже (база + наценка)
  laborCost: number;
  laborSell: number;
  laborHours: number;
  eqSell: number;          // оборудование в продаже
  transportSum: number;
  smrPnrSell: number;
  sellBase: number;        // база продажи до скидки
  baseSum: number;         // = sellBase (синоним для читаемости)
  discountSum: number;
  afterDiscount: number;   // выручка без НДС
  vatSum: number;
  total: number;           // ИТОГО с НДС
  tzzSum: number;
  unforeseenSum: number;
  plannedCost: number;     // плановая себестоимость
  totalCost: number;       // = plannedCost (синоним)
  profit: number;
  marginPct: number;       // рентабельность к выручке
  markupPct: number;       // наценка к себестоимости
}

/**
 * НОВАЯ МОДЕЛЬ ЦЕН: база наценки — ЗАКУПОЧНАЯ стоимость (наценка
 * применяется один раз). Продажа = оборудование×(1+наценка) +
 * работы×(1+наценка работ) + доставка% + СМР/ПНР → скидка% → НДС%.
 */
export function calcProject(p: Pick<Project, "cabinets"> & CalcFields, rates: Rates): ProjCalc {
  const cabs: CabCalc[] = p.cabinets.map((cab) => {
    const eqBase = cab.items.reduce((s, i) => s + i.purchase * i.qty, 0);
    const markupSum = eqBase * (p.markup / 100);
    const laborCost =
      cab.hours * rates.production + cab.designHours * rates.design + cab.softwareHours * rates.software;
    const laborSell = laborCost * (1 + p.workMarkup / 100);
    return { cab, eqBase, eqCost: eqBase, markupSum, laborCost, laborSell, total: eqBase + markupSum + laborSell, posCount: cab.items.length };
  });

  const eqBase = cabs.reduce((s, c) => s + c.eqBase, 0);
  const eqCost = cabs.reduce((s, c) => s + c.eqCost, 0);
  const posCount = cabs.reduce((s, c) => s + c.posCount, 0);
  const markupSum = cabs.reduce((s, c) => s + c.markupSum, 0);
  const cabinetsSell = eqBase + markupSum;
  const laborCost = cabs.reduce((s, c) => s + c.laborCost, 0);
  const laborSell = cabs.reduce((s, c) => s + c.laborSell, 0);
  const laborHours = p.cabinets.reduce((s, c) => s + c.hours + c.designHours + c.softwareHours, 0);

  const eqSell = cabinetsSell;
  const transportSum = eqSell * (p.transportPct / 100);
  const smrPnrSell = p.smrSell + p.pnrSell;
  const sellBase = cabinetsSell + laborSell + transportSum + smrPnrSell;
  const discountSum = sellBase * (p.discount / 100);
  const afterDiscount = sellBase - discountSum;
  const vatSum = afterDiscount * (p.vatRate / 100);
  const total = afterDiscount + vatSum;

  /* плановая себестоимость: закупка + ТЗР + ФОТ + сторонние/доп/командировки
     + СМР/ПНР, сверху — непредвиденные расходы */
  const tzzSum = eqCost * (p.tzzPct / 100);
  const costBase = eqCost + tzzSum + laborCost + p.thirdParty + p.extraCosts + p.tripCosts + p.smrCost + p.pnrCost;
  const unforeseenSum = costBase * (p.unforeseenPct / 100);
  const plannedCost = costBase + unforeseenSum;
  const profit = afterDiscount - plannedCost;
  const marginPct = afterDiscount > 0 ? (profit / afterDiscount) * 100 : 0;
  const markupPct = plannedCost > 0 ? (profit / plannedCost) * 100 : 0;

  return {
    cabs, eqBase, eqCost, posCount, markupSum, cabinetsSell,
    laborCost, laborSell, laborHours, eqSell, transportSum, smrPnrSell,
    sellBase, baseSum: sellBase, discountSum, afterDiscount, vatSum, total,
    tzzSum, unforeseenSum, plannedCost, totalCost: plannedCost,
    profit, marginPct, markupPct,
  };
}

/* ---------------------- CSV справочника ---------------------- */

/** Разбор CSV «артикул;наименование;бренд;категория;направление;ед;закупка;характеристики»
    (8 колонок, только закупочная цена; числа — с русской запятой;
    направления — русские «нку/асу/обогрев»). Зеркало — CatalogCsv.cs. */
export function parseCatalogCsv(text: string): { items: Omit<Equipment, "id">[]; skipped: number } {
  const items: Omit<Equipment, "id">[] = [];
  let skipped = 0;
  const dirMap: Record<string, Equipment["direction"]> = {
    "нку": "nku", "nku": "nku", "асу": "asu", "асу тп": "asu", "asu": "asu",
    "обогрев": "heat", "heat": "heat", "uni": "uni", "уни": "uni",
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^артикул/i.test(line) || /^sku/i.test(line)) continue; // шапка
    const cells = line.split(";").map((c) => c.trim());
    if (cells.length < 7) { skipped++; continue; }
    const [sku, name, brand, category, directionRaw, unit, purchaseRaw] = cells;
    const purchase = Number((purchaseRaw ?? "").replace(/\s|\u00a0/g, "").replace(",", "."));
    if (!sku || !name || !Number.isFinite(purchase)) { skipped++; continue; }
    const direction = dirMap[directionRaw.toLowerCase()] ?? "uni";
    items.push({ sku, name, brand: brand || "—", category: category || "Прочее", direction, unit: unit || "шт", purchase, attrs: cells[7] || "" });
  }
  return { items, skipped };
}

export const exportCatalogCsv = (items: Equipment[]) =>
  ["Артикул;Наименование;Бренд;Категория;Направление;Ед;Закупка;Характеристики"]
    .concat(items.map((e) =>
      [e.sku, e.name, e.brand, e.category, e.direction, e.unit, e.purchase.toFixed(2).replace(".", ","), e.attrs ?? ""].join(";")))
    .join("\n");
