import type { Cabinet, Equipment, Project, Rates } from "./types";

/* ============================================================
   УТИЛИТЫ: id, форматирование, расчётное ядро, CSV, файлы.
   calcProject — единый источник правды для всех сумм в
   интерфейсе, документе и Excel-выгрузке.
   ============================================================ */

let idSeq = 0;
export const genId = (p: string) =>
  `${p}-${Date.now().toString(36)}${(idSeq++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ------------------------- форматирование ------------------------- */

const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const moneyFmt2 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const fmtMoney = (n: number) => `${moneyFmt.format(Math.round(n))} ₽`;
export const fmtMoney2 = (n: number) => `${moneyFmt2.format(n)} ₽`;
export const fmtNum = (n: number) => moneyFmt.format(n);

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

export const fmtDateShort = (ts: number) =>
  new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const roundHalf = (x: number): number => Math.round(x * 2) / 2;

/* ------------------------- расчётное ядро ------------------------- */

export interface CalcFields {
  markup: number; workMarkup: number; discount: number; vatRate: number;
  tzzPct: number; thirdParty: number; extraCosts: number; unforeseenPct: number;
  tripCosts: number; transportPct: number;
  smrCost: number; smrSell: number; pnrCost: number; pnrSell: number;
}

export interface CabCalc {
  cab: Cabinet;
  eqBase: number; // Σ цена_продажи × кол-во
  eqCost: number; // Σ закупка × кол-во — себестоимость оборудования
  markupSum: number; // наценка на оборудование
  laborCost: number; // ФОТ: часы × ставки (себестоимость работ)
  laborSell: number; // ФОТ × (1 + workMarkup) — работы в продаже
  total: number; // продажная стоимость шкафа
  posCount: number;
}

export interface ProjCalc {
  cabs: CabCalc[];
  eqBase: number;
  eqCost: number;
  markupSum: number;
  laborCost: number;
  laborSell: number;
  laborHours: number; // Σ всех чел·ч (сборка + проектирование + ПО)
  cabinetsSell: number; // Σ продажных стоимостей шкафов
  tzzSum: number; // транспортно-заготовительные (себестоимость)
  plannedCost: number; // плановая себестоимость с непредвиденными
  unforeseenSum: number;
  totalCost: number; // полная себестоимость проекта (+ командировки + СМР/ПНР)
  transportSum: number; // доставка до заказчика (в продаже)
  sellBase: number; // шкафы + СМР + ПНР + доставка
  discountSum: number;
  afterDiscount: number;
  vatSum: number;
  total: number; // ИТОГО к оплате
  profit: number;
  marginPct: number; // рентабельность продаж, %
  markupPct: number; // наценка к себестоимости, %
  posCount: number;
}

/**
 * Формулы (см. DOCS.md):
 *  Шкаф:  eqBase = Σ цена×кол-во;  laborCost = Σ часы_роли × ставка_роли;
 *         laborSell = laborCost × (1 + workMarkup/100);
 *         sell = eqBase×(1+markup/100) + laborSell.
 *  Проект: себестоимость = eqCost + ТЗР% + сторонние + ФОТ + доп.затраты
 *          + непредвиденные% + командировки + СМР + ПНР.
 *  Продажа = шкафы + СМР_sell + ПНР_sell + доставка% → скидка% → НДС%.
 */
export function calcProject(p: Pick<Project, "cabinets"> & CalcFields, rates: Rates): ProjCalc {
  const cabs: CabCalc[] = p.cabinets.map((cab) => {
    // НОВАЯ МОДЕЛЬ ЦЕН: база наценки = закупочная стоимость (наценка применяется один раз).
    const eqCost = cab.items.reduce((s, i) => s + i.purchase * i.qty, 0);
    const eqBase = eqCost;
    const markupSum = eqBase * (p.markup / 100);
    const laborCost = cab.hours * rates.production + cab.designHours * rates.design + cab.softwareHours * rates.software;
    const laborSell = laborCost * (1 + p.workMarkup / 100);
    return { cab, eqBase, eqCost, markupSum, laborCost, laborSell, total: eqBase + markupSum + laborSell, posCount: cab.items.length };
  });
  const eqBase = cabs.reduce((s, c) => s + c.eqBase, 0);
  const eqCost = cabs.reduce((s, c) => s + c.eqCost, 0);
  const markupSum = cabs.reduce((s, c) => s + c.markupSum, 0);
  const laborCost = cabs.reduce((s, c) => s + c.laborCost, 0);
  const laborSell = cabs.reduce((s, c) => s + c.laborSell, 0);
  const laborHours = p.cabinets.reduce((s, c) => s + c.hours + c.designHours + c.softwareHours, 0);
  const cabinetsSell = cabs.reduce((s, c) => s + c.total, 0);

  const tzzSum = eqCost * (p.tzzPct / 100);
  const unforeseenBase = eqCost + tzzSum + p.thirdParty + laborCost + p.extraCosts;
  const unforeseenSum = unforeseenBase * (p.unforeseenPct / 100);
  const plannedCost = unforeseenBase + unforeseenSum;
  const totalCost = plannedCost + p.tripCosts + p.smrCost + p.pnrCost;

  const transportSum = eqBase * (p.transportPct / 100);
  const sellBase = cabinetsSell + p.smrSell + p.pnrSell + transportSum;
  const discountSum = sellBase * (p.discount / 100);
  const afterDiscount = sellBase - discountSum;
  const vatSum = afterDiscount * (p.vatRate / 100);
  const total = afterDiscount + vatSum;
  const profit = afterDiscount - totalCost;
  const marginPct = afterDiscount > 0 ? (profit / afterDiscount) * 100 : 0;
  const markupPct = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const posCount = cabs.reduce((s, c) => s + c.posCount, 0);

  return {
    cabs, eqBase, eqCost, markupSum, laborCost, laborSell, laborHours, cabinetsSell,
    tzzSum, plannedCost, unforeseenSum, totalCost, transportSum, sellBase, discountSum,
    afterDiscount, vatSum, total, profit, marginPct, markupPct, posCount,
  };
}

/* ------------------------- CSV (импорт/экспорт прайсов) ------------------------- */

export function exportCatalogCsv(items: Equipment[]): string {
  // 8 колонок: единственная цена — закупочная (наценка добавляется при расчёте)
  const head = "артикул;наименование;бренд;категория;направление;ед;закупка;характеристики";
  const rows = items.map((e) =>
    [e.sku, e.name, e.brand, e.category, e.direction, e.unit, e.purchase, e.attrs ?? ""].join(";")
  );
  return "\uFEFF" + [head, ...rows].join("\r\n");
}

export interface CsvResult {
  items: Omit<Equipment, "id">[];
  skipped: number;
}

export function parseCatalogCsv(text: string): CsvResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { items: [], skipped: 0 };
  const delim = [";", "\t", ","].find((d) => lines[0].split(d).length >= 4) ?? ";";
  const items: Omit<Equipment, "id">[] = [];
  let skipped = 0;
  const dirMap: Record<string, Equipment["direction"]> = {
    nku: "nku", нку: "nku", asu: "asu", асу: "asu", heat: "heat",
    обогрев: "heat", электрообогрев: "heat", uni: "uni", универсальное: "uni", "-": "uni",
  };
  for (let idx = 0; idx < lines.length; idx++) {
    const cells = lines[idx].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (idx === 0 && /артикул|sku|наименование/i.test(cells[0])) continue;
    if (cells.length < 6) { skipped++; continue; }
    // 8 колонок: закупка — c[6] (единственная цена, обязательна), характеристики — c[7]
    const [sku, name, brand, category, direction, unit, purchase, attrs] = cells;
    const p = Number(String(purchase).replace(",", ".").replace(/\s/g, ""));
    if (!sku || !name || Number.isNaN(p)) { skipped++; continue; }
    items.push({
      sku, name, brand: brand || "—", category: category || "Прочее",
      direction: dirMap[(direction || "uni").toLowerCase()] ?? "uni",
      unit: unit || "шт", purchase: p, attrs: attrs || undefined,
    });
  }
  return { items, skipped };
}

/* ------------------------- файлы ------------------------- */

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
