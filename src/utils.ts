import type { Project, Rates } from "./types";

export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n)) + " ₽";

export const fmtNum = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);

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

/* ------------------------- расчётное ядро ------------------------- */

export interface CabCalc {
  cab: Project["cabinets"][number];
  eqBase: number;      // закупочная база
  laborCost: number;   // работы по ставкам
  laborSell: number;   // работы в продаже
  total: number;       // шкаф в продаже (база+наценка+работы)
  posCount: number;
}

export interface ProjCalc {
  cabs: CabCalc[];
  eqBase: number;
  markupSum: number;
  laborCost: number;
  laborSell: number;
  eqSell: number;      // оборудование в продаже
  total: number;       // итог до НДС
  totalVat: number;    // итог с НДС
}

export function calcProject(p: Pick<Project, "cabinets" | "markup" | "workMarkup" | "vatRate">, rates: Rates): ProjCalc {
  const cabs: CabCalc[] = p.cabinets.map((cab) => {
    const eqBase = cab.items.reduce((s, i) => s + i.purchase * i.qty, 0);
    const laborCost = cab.hours * rates.production + cab.designHours * rates.design + cab.softwareHours * rates.software;
    const laborSell = laborCost * (1 + p.workMarkup / 100);
    return { cab, eqBase, laborCost, laborSell, total: eqBase * (1 + p.markup / 100) + laborSell, posCount: cab.items.length };
  });
  const eqBase = cabs.reduce((s, c) => s + c.eqBase, 0);
  const markupSum = eqBase * (p.markup / 100);
  const laborCost = cabs.reduce((s, c) => s + c.laborCost, 0);
  const laborSell = cabs.reduce((s, c) => s + c.laborSell, 0);
  const eqSell = eqBase + markupSum;
  const total = eqSell + laborSell;
  return { cabs, eqBase, markupSum, laborCost, laborSell, eqSell, total, totalVat: total * (1 + p.vatRate / 100) };
}
