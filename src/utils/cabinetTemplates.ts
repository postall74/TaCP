import type { CabinetTemplate, TemplateComponent } from "../types";

/* ============================================================
   КОНФИГУРАТОР ПУСТЫХ И ПРЕДНАПОЛНЕННЫХ ШКАФОВ — чистая логика
   (дорожная карта Б.1). Без React/HTTP: параметрический комплект
   поставки по габаритам, цены узлов, сборная строка для ТКП
   заказчика, заказные шифры, часы сборки.
   ============================================================ */

const r10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);

/** Траверс по высоте: база 2 + по одной на каждые 500 мм сверх 1800. */
export const traverseCount = (h: number) => 2 + Math.max(0, Math.ceil((h - 1800) / 500));

/** Дверей: при ширине от 1000 мм — две (распашные), иначе одна. */
export const doorCount = (w: number) => (w >= 1000 ? 2 : 1);

/**
 * Базовый комплект поставки по габаритам. Состав — по типовым
 * спецификациям напольных шкафов: рама с потолочной панелью,
 * панели кабельного ввода, траверсы, двери, панель задняя,
 * панель монтажная, ключ, цоколь, панели боковые.
 */
export function baseKit(mount: "floor" | "wall", h: number, w: number, d: number): TemplateComponent[] {
  if (mount === "wall") {
    return [
      { key: "corpus", name: "Корпус сварной (рама, стенки, задняя панель)", qty: 1, unit: "шт", purchase: r10(3600 + 2.2 * (h - 400) + 2.6 * (w - 300) + 1.4 * (d - 150)) },
      { key: "door", name: `Дверь с замком (${h}×${w})`, qty: 1, unit: "шт", purchase: r10(1500 + 1.5 * (h - 400) + 1.8 * (w - 300)) },
      { key: "mount", name: `Панель монтажная (${h - 60}×${w - 60})`, qty: 1, unit: "шт", purchase: r10(950 + 1.2 * (h - 400) + 1.4 * (w - 300)) },
      { key: "key", name: "Ключ от замка двери", qty: 2, unit: "шт", purchase: 150 },
      { key: "bracket", name: "Кронштейн настенного крепления", qty: 4, unit: "шт", purchase: 240 },
    ];
  }
  const doors = doorCount(w);
  const traverses = traverseCount(h);
  return [
    { key: "frame", name: "Рама с потолочной панелью", qty: 1, unit: "шт", purchase: r10(8500 + 22 * (h - 1800) + 1.6 * (w - 600)) },
    { key: "cable", name: "Панель кабельного ввода", qty: 2, unit: "шт", purchase: r10(850 + 1.2 * (w - 600) + 0.6 * (d - 400)) },
    { key: "trav", name: "Траверса монтажная", qty: traverses, unit: "шт", purchase: r10(1150 + 1.9 * (w - 600)) },
    { key: "door", name: `Дверь с замком (${h}×${Math.round(w / doors)})`, qty: doors, unit: "шт", purchase: r10(3200 + 1.7 * (h - 1800) + 2.0 * (w / doors - 600)) },
    { key: "rear", name: "Панель задняя", qty: 1, unit: "шт", purchase: r10(1500 + 1.4 * (h - 1800) + 1.6 * (w - 600)) },
    { key: "mount", name: "Панель монтажная", qty: 1, unit: "шт", purchase: r10(1700 + 1.5 * (h - 1800) + 1.8 * (w - 600)) },
    { key: "key", name: "Ключ от замка двери", qty: 2, unit: "шт", purchase: 150 },
    { key: "ped", name: "Цоколь 100 мм с фланцами", qty: 1, unit: "шт", purchase: r10(1900 + 2.0 * (w - 600) + 1.5 * (d - 400)) },
    { key: "side", name: "Панель боковая", qty: 2, unit: "шт", purchase: r10(1900 + 1.6 * (h - 1800) + 2.4 * (d - 400)) },
  ];
}

export const kitTotal = (kit: TemplateComponent[]) => kit.reduce((s, k) => s + k.qty * k.purchase, 0);

export const templateTotal = (t: Pick<CabinetTemplate, "kit" | "fillItems">) =>
  kitTotal(t.kit) + t.fillItems.reduce((s, i) => s + i.qty * i.purchase, 0);

/** Рекомендованные часы сборки изделия (ориентир при создании шаблона). */
export function autoAssemblyHours(mount: "floor" | "wall", h: number, w: number): number {
  if (mount === "wall") return 1.5;
  const base = 3.5;
  const extra =
    0.3 * 2 + // панели кабельного ввода
    0.15 * traverseCount(h) +
    0.4 * doorCount(w) +
    0.5 + // цоколь
    0.3 * 2 + // боковые панели
    0.3; // задняя + монтажная
  const big = h > 2000 || w >= 1000 ? 0.5 : 0;
  return Math.round((base + extra + big) * 2) / 2;
}

/** Автоматический заказной шифр: ШН/ЩН-В.Ш.Г-IPxx(-П для преднаполненных). */
export function suggestOrderCode(t: Pick<CabinetTemplate, "mount" | "h" | "w" | "d" | "ip" | "fillItems">): string {
  const prefix = t.mount === "floor" ? "ШН" : "ЩН";
  const fill = t.fillItems.length > 0 ? "-П" : "";
  return `${prefix}-${t.h}.${t.w}.${t.d}-IP${t.ip}${fill}`;
}

/** Автоматическое наименование изделия по типу монтажа. */
export const suggestName = (mount: "floor" | "wall") =>
  mount === "floor" ? "Шкаф напольный распределительный" : "Шкаф навесной распределительный";

/**
 * Сборная строка для документа ТКП заказчика — ровно то, что просил
 * заказчик: «Шкаф напольный распределительный габаритами В×Ш×Г,
 * соответствие степени защиты IPxx. Комплект поставки: …».
 */
export function templateDocLine(t: Pick<CabinetTemplate, "name" | "mount" | "h" | "w" | "d" | "ip" | "kit">): string {
  const dims = `${t.h}×${t.w}×${t.d}`;
  const parts = t.kit
    .map((k) => (k.qty > 1 ? `${k.name} — ${k.qty} ${k.unit}` : k.name))
    .join("; ");
  return `${t.name} габаритами ${dims}, соответствие степени защиты IP${t.ip}. Комплект поставки: ${parts}.`;
}

/** Короткая метка для списков и карточек. */
export const templateLabel = (t: Pick<CabinetTemplate, "h" | "w" | "d" | "ip" | "mount">) =>
  `${t.mount === "floor" ? "Напольный" : "Навесной"} ${t.h}×${t.w}×${t.d} · IP${t.ip}`;
