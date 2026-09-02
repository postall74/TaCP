import type { CabinetTemplate, TemplateComponent } from "../types";
import { roundHalf } from "../utils";

/* ============================================================
   ЛОГИКА ШАБЛОНОВ ШКАФОВ (дорожная карта Б.1) — чистые функции.
   По образцу ПРОВЕНТО ШРС и DKC CQE N: корпус = комплект узлов
   (рама с потолочной панелью, панели кабельного ввода, траверсы,
   двери с замками и ключами, задняя/боковые/монтажная панели,
   цоколь). Преднаполненный шаблон = корпус + АВ на микроклимат
   и освещение. Часы сборки учитываются в стоимости изделия.
   ============================================================ */

const r10 = (x: number) => Math.max(10, Math.round(x / 10) * 10);

/** Дверей по ширине: от 1000 мм — две распашные. */
export const doorCount = (w: number): number => (w >= 1000 ? 2 : 1);

/** Монтажных траверс по высоте: база 2 (верх/низ) + 1 от 2000 мм. */
export const traverseCount = (h: number): number => 2 + (h >= 2000 ? 1 : 0);

/** Базовый комплект поставки корпуса по габариту. */
export function baseKit(mount: "floor" | "wall", h: number, w: number, d: number): TemplateComponent[] {
  const tag = `${h}×${w}×${d}`;
  if (mount === "wall") {
    return [
      { key: "w-corpus", name: `Корпус цельносварной ${tag} (задняя стенка несъёмная)`, qty: 1, unit: "шт", purchase: r10(3600 + 2.2 * (h - 400) + 2.6 * (w - 300) + 1.4 * (d - 150)) },
      { key: "w-door", name: `Дверь ${tag}`, qty: 1, unit: "шт", purchase: r10(1500 + 1.5 * (h - 400) + 1.8 * (w - 300)) },
      { key: "w-lock", name: "Замок дверной с ключом", qty: 1, unit: "компл.", purchase: 540 },
      { key: "w-mount", name: `Панель монтажная ${tag}`, qty: 1, unit: "шт", purchase: r10(950 + 1.2 * (h - 400) + 1.4 * (w - 300)) },
      { key: "w-bracket", name: "Кронштейн настенного крепления", qty: 4, unit: "шт", purchase: 120 },
    ];
  }
  const doors = doorCount(w);
  return [
    { key: "f-frame", name: `Рама с потолочной панелью ${tag}`, qty: 1, unit: "шт", purchase: r10(8200 + 22 * (h - 1800) + 6 * (w - 600)) },
    { key: "f-gland", name: "Панель кабельного ввода (дно)", qty: 1, unit: "шт", purchase: r10(2900 + 3.4 * (w - 600) + 2.2 * (d - 400)) },
    { key: "f-trav", name: `Траверса монтажная ${tag}`, qty: traverseCount(h), unit: "шт", purchase: r10(1150 + 1.9 * (w - 600)) },
    { key: "f-door", name: `Дверь ${tag}`, qty: doors, unit: "шт", purchase: r10(3200 + 1.7 * (h - 1800) + 2.0 * (w - 600)) },
    { key: "f-lock", name: "Замок дверной с ключом", qty: doors, unit: "компл.", purchase: 620 },
    { key: "f-rear", name: "Панель задняя", qty: 1, unit: "шт", purchase: r10(1900 + 1.6 * (h - 1800) + 2.1 * (w - 600)) },
    { key: "f-side", name: `Панель боковая ${tag}`, qty: 2, unit: "шт", purchase: r10(1700 + 1.6 * (h - 1800) + 2.4 * (d - 400)) },
    { key: "f-mount", name: `Панель монтажная ${tag}`, qty: 1, unit: "шт", purchase: r10(1700 + 1.5 * (h - 1800) + 1.8 * (w - 600)) },
    { key: "f-ped", name: `Цоколь 100 мм с фланцами (Ш${w}×Г${d})`, qty: 1, unit: "шт", purchase: r10(1900 + 2.0 * (w - 600) + 1.5 * (d - 400)) },
  ];
}

/** Закупочная стоимость комплекта корпуса. */
export const kitTotal = (kit: TemplateComponent[]): number =>
  kit.reduce((s, k) => s + k.qty * k.purchase, 0);

/** Полная закупочная стоимость изделия: корпус + преднаполнение. */
export const templateTotal = (t: Pick<CabinetTemplate, "kit" | "fillItems">): number =>
  kitTotal(t.kit) + t.fillItems.reduce((s, i) => s + i.qty * i.purchase, 0);

/** Короткая метка габарита: «2000×800×600 · IP54». */
export const templateLabel = (t: Pick<CabinetTemplate, "h" | "w" | "d" | "ip">): string =>
  `${t.h}×${t.w}×${t.d} · IP${t.ip}`;

/** Наименование по умолчанию по типу монтажа. */
export const suggestName = (mount: "floor" | "wall"): string =>
  mount === "floor" ? "Шкаф напольный распределительный" : "Шкаф навесной распределительный";

/** Авто-заказной шифр: ШН/ШВ-В.Ш.Г-IPxx[-П]. */
export function suggestOrderCode(p: {
  mount: "floor" | "wall"; h: number; w: number; d: number; ip: number;
  fillItems: { id?: string }[];
}): string {
  const prefix = p.mount === "floor" ? "ШН" : "ШВ";
  const fill = p.fillItems.length > 0 ? "-П" : "";
  return `${prefix}-${p.h}.${p.w}.${p.d}-IP${p.ip}${fill}`;
}

/** Рекомендованные часы сборки по типу монтажа и габариту. */
export function autoAssemblyHours(mount: "floor" | "wall", h: number, w: number): number {
  if (mount === "wall") return roundHalf(1.5 + (h - 400) / 600);
  return roundHalf(3 + ((h - 1800) / 200) * 0.5 + (doorCount(w) === 2 ? 0.5 : 0));
}

/**
 * Строка изделия для ТКП заказчика, ровно в требуемой форме:
 * «Шкаф напольный распределительный габаритами 2000×800×600 мм (В×Ш×Г),
 *  степень защиты IP54. Комплект поставки: рама с потолочной панелью; …»
 */
export function templateDocLine(
  t: Pick<CabinetTemplate, "name" | "h" | "w" | "d" | "ip" | "kit"> & { mount?: "floor" | "wall" },
): string {
  const kit = t.kit.map((k) => (k.qty > 1 ? `${k.name} — ${k.qty} шт` : k.name)).join("; ");
  return `${t.name} габаритами ${t.h}×${t.w}×${t.d} мм (В×Ш×Г), степень защиты IP${t.ip}. Комплект поставки: ${kit}.`;
}
