import type { CalcFields, Cabinet, Equipment, Project, Settings } from "./types";
import { DIRECTIONS } from "./types";

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
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/* ------------------------- расчётное ядро ------------------------- */

export interface CabCalc {
  cab: Cabinet;
  eqBase: number; // Σ цена×кол-во
  eqCost: number; // Σ закупка×кол-во
  markupSum: number;
  work: number; // нормо-часы × ставка × сложность
  total: number;
  posCount: number;
}

export interface ProjCalc {
  cabs: CabCalc[];
  eqBase: number;
  eqCost: number;
  markupSum: number;
  work: number;
  subtotal: number;
  discountSum: number;
  afterDiscount: number;
  vatSum: number;
  total: number;
  profit: number;
  marginPct: number;
  posCount: number;
}

export function calcProject(p: Pick<Project, "cabinets"> & CalcFields): ProjCalc {
  const cabs: CabCalc[] = p.cabinets.map((cab) => {
    const eqBase = cab.items.reduce((s, i) => s + i.price * i.qty, 0);
    const eqCost = cab.items.reduce((s, i) => s + i.purchase * i.qty, 0);
    const markupSum = eqBase * (p.markup / 100);
    const work = cab.hours * p.hourRate * p.complexity;
    return { cab, eqBase, eqCost, markupSum, work, total: eqBase + markupSum + work, posCount: cab.items.length };
  });
  const eqBase = cabs.reduce((s, c) => s + c.eqBase, 0);
  const eqCost = cabs.reduce((s, c) => s + c.eqCost, 0);
  const markupSum = cabs.reduce((s, c) => s + c.markupSum, 0);
  const work = cabs.reduce((s, c) => s + c.work, 0);
  const subtotal = eqBase + markupSum + work;
  const discountSum = subtotal * (p.discount / 100);
  const afterDiscount = subtotal - discountSum;
  const vatSum = p.vat ? afterDiscount * 0.2 : 0;
  const total = afterDiscount + vatSum;
  const profit = afterDiscount - eqCost;
  const marginPct = afterDiscount > 0 ? (profit / afterDiscount) * 100 : 0;
  const posCount = cabs.reduce((s, c) => s + c.posCount, 0);
  return { cabs, eqBase, eqCost, markupSum, work, subtotal, discountSum, afterDiscount, vatSum, total, profit, marginPct, posCount };
}

/* ------------------------- CSV (импорт/экспорт прайсов) ------------------------- */

export function exportCatalogCsv(items: Equipment[]): string {
  const head = "артикул;наименование;бренд;категория;направление;ед;закупка;цена;характеристики";
  const rows = items.map((e) =>
    [e.sku, e.name, e.brand, e.category, e.direction, e.unit, e.purchase, e.price, e.attrs ?? ""].join(";")
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
    nku: "nku",
    нку: "nku",
    asu: "asu",
    асу: "asu",
    heat: "heat",
    обогрев: "heat",
    электрообогрев: "heat",
    uni: "uni",
    универсальное: "uni",
    "-": "uni",
  };
  for (let idx = 0; idx < lines.length; idx++) {
    const cells = lines[idx].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (idx === 0 && /артикул|sku|наименование/i.test(cells[0])) continue; // заголовок
    if (cells.length < 6) {
      skipped++;
      continue;
    }
    const [sku, name, brand, category, direction, unit, purchase, price, attrs] = cells;
    const p = Number(String(purchase).replace(",", ".").replace(/\s/g, ""));
    const s = Number(String(price).replace(",", ".").replace(/\s/g, ""));
    if (!sku || !name || Number.isNaN(s)) {
      skipped++;
      continue;
    }
    items.push({
      sku,
      name,
      brand: brand || "—",
      category: category || "Прочее",
      direction: dirMap[(direction || "uni").toLowerCase()] ?? "uni",
      unit: unit || "шт",
      purchase: Number.isNaN(p) ? 0 : p,
      price: s,
      attrs: attrs || undefined,
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

/* ------------------------- документ Word (HTML) ------------------------- */

export function buildDocHtml(p: Project, calc: ProjCalc, s: Settings): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const num = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
  const money = (n: number) => `${num(n)} ₽`;

  let tables = "";
  calc.cabs.forEach((c, ci) => {
    tables += `<h3 style="margin:22px 0 8px;font-size:14px;">${ci + 1}. ${esc(c.cab.name)} <span style="color:#666;font-weight:normal;">(${esc(c.cab.kind)})</span></h3>`;
    tables += `<table><thead><tr><th style="width:34px">№</th><th>Наименование</th><th style="width:70px">Кол-во</th><th style="width:42px">Ед.</th><th style="width:110px">Цена за ед.</th><th style="width:120px">Сумма</th></tr></thead><tbody>`;
    c.cab.items.forEach((it, ii) => {
      tables += `<tr><td>${ii + 1}</td><td>${esc(it.name)}<br/><span style="color:#777;font-size:11px;">${esc(it.sku)} · ${esc(it.brand)}</span></td><td style="text-align:center">${num(it.qty)}</td><td style="text-align:center">${esc(it.unit)}</td><td style="text-align:right">${money(it.price)}</td><td style="text-align:right">${money(it.price * it.qty)}</td></tr>`;
    });
    tables += `<tr><td colspan="5" style="text-align:right;font-weight:bold">Оборудование по разделу ${ci + 1}</td><td style="text-align:right;font-weight:bold">${money(c.eqBase + c.markupSum)}</td></tr>`;
    if (c.cab.hours > 0) {
      tables += `<tr><td colspan="5" style="text-align:right">Сборка и монтаж — ${num(c.cab.hours)} нормо-ч × ${num(p.hourRate * p.complexity)} ₽/ч</td><td style="text-align:right">${money(c.work)}</td></tr>`;
    }
    tables += `<tr><td colspan="5" style="text-align:right;font-weight:bold">Итого по разделу ${ci + 1}</td><td style="text-align:right;font-weight:bold">${money(c.total)}</td></tr>`;
    tables += `</tbody></table>`;
  });

  const dirMeta = DIRECTIONS[p.direction];
  const notes = p.notes
    ? p.notes
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => `${i + 1}. ${esc(l)}`)
        .join("<br/>")
    : "";

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${p.number} — ${esc(p.title)}</title>
<style>
  body{font-family:'Times New Roman',Times,serif;color:#111;font-size:12.5px;line-height:1.5;margin:0;padding:24px 28px;}
  table{width:100%;border-collapse:collapse;margin-top:4px;}
  th,td{border:1px solid #888;padding:5px 8px;font-size:12px;}
  th{background:#f0f0f0;text-align:left;}
  h1{font-size:19px;margin:18px 0 2px;text-align:center;}
  h3{break-after:avoid;}
  .head{display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:10px;}
  .meta{margin:14px 0;font-size:12.5px;}
  .tot td{font-size:12.5px;}
</style></head><body>
<div class="head">
  <div><b style="font-size:15px">${esc(s.companyName)}</b><br/><span style="color:#555">${esc(s.tagline)}</span><br/>
  <span style="font-size:11px;color:#555">${esc(s.address)} · тел. ${esc(s.phone)} · ${esc(s.email)}</span></div>
  <div style="text-align:right;font-size:11px;color:#555;white-space:pre-line">${esc(s.requisites)}</div>
</div>
<h1>ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № ${p.number}</h1>
<p style="text-align:center;margin:2px 0 14px;color:#555;">${esc(dirMeta.full)} · «${esc(p.title)}»</p>
<table class="meta" style="border:none;width:auto;"><tbody style="border:none">
<tr><td style="border:none;padding:1px 14px 1px 0;color:#555">Заказчик:</td><td style="border:none;padding:1px 0"><b>${esc(p.client || "—")}</b>${p.contact ? `, ${esc(p.contact)}` : ""}</td></tr>
<tr><td style="border:none;padding:1px 14px 1px 0;color:#555">Дата:</td><td style="border:none;padding:1px 0">${fmtDate(Date.now())}</td></tr>
<tr><td style="border:none;padding:1px 14px 1px 0;color:#555">Действительно:</td><td style="border:none;padding:1px 0">в течение ${p.validDays} календарных дней</td></tr>
</tbody></table>
${tables}
<h3 style="margin:24px 0 8px;font-size:14px;">Сводная стоимость</h3>
<table class="tot">
<tr><td style="text-align:right">Оборудование</td><td style="text-align:right;width:150px">${money(calc.eqBase)}</td></tr>
${p.markup > 0 ? `<tr><td style="text-align:right">Наценка на оборудование (${num(p.markup)} %)</td><td style="text-align:right">${money(calc.markupSum)}</td></tr>` : ""}
<tr><td style="text-align:right">Сборка, монтаж и пусконаладка</td><td style="text-align:right">${money(calc.work)}</td></tr>
${p.discount > 0 ? `<tr><td style="text-align:right">Скидка (${num(p.discount)} %)</td><td style="text-align:right">− ${money(calc.discountSum)}</td></tr>` : ""}
${p.vat ? `<tr><td style="text-align:right">НДС 20 %</td><td style="text-align:right">${money(calc.vatSum)}</td></tr>` : `<tr><td style="text-align:right">НДС</td><td style="text-align:right">не облагается</td></tr>`}
<tr><td style="text-align:right;font-size:14px"><b>ИТОГО${p.vat ? " (с НДС)" : ""}</b></td><td style="text-align:right;font-size:14px"><b>${money(calc.total)}</b></td></tr>
</table>
${notes ? `<h3 style="margin:22px 0 6px;font-size:14px;">Условия предложения</h3><p style="margin:0">${notes}</p>` : ""}
<p style="margin:34px 0 0">С уважением, ${esc(s.manager)}<br/>${esc(s.companyName)}, тел. ${esc(s.phone)}, ${esc(s.email)}</p>
<div style="margin-top:36px;display:flex;justify-content:space-between"><div style="border-top:1px solid #111;width:220px;text-align:center;padding-top:2px">подпись</div><div style="border-top:1px solid #111;width:220px;text-align:center;padding-top:2px">М.П.</div></div>
</body></html>`;
}
