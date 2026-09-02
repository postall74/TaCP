/* ============================================================
   ОБЩИЕ УТИЛИТЫ: форматирование и генерация идентификаторов.
   ============================================================ */

/** Деньги: 12 340 ₽ (ru-RU, без копеек). */
export const fmtMoney = (n: number): string =>
  `${Math.round(n).toLocaleString("ru-RU")} ₽`;

let seq = 0;
/** Короткий уникальный id с префиксом (tpl-, fill-, k-…). */
export const genId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

/** Округление до 0,5 (часы сборки). */
export const roundHalf = (x: number): number => Math.round(x * 2) / 2;
