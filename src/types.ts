/* ============================================================
   ДОМЕННЫЕ ТИПЫ конфигуратора шкафов.
   ============================================================ */

export type Direction = "nku" | "asu" | "uni";

/** Направления работ — ключи используют компоненты и фильтры. */
export const DIRECTIONS: Record<Direction, { label: string }> = {
  nku: { label: "НКУ" },
  asu: { label: "АСУ ТП" },
  uni: { label: "Универсальное" },
};

/** Позиция справочника оборудования. */
export interface Equipment {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  direction: Direction;
  unit: string;
  purchase: number; // закупочная цена, ₽
  attrs?: string;
}

/** Позиция состава (снапшот цены — как в ТКП). */
export interface LineItem {
  id: string;
  eqId: string;
  sku: string;
  name: string;
  brand: string;
  unit: string;
  qty: number;
  purchase: number;
}

/** Компонент комплекта поставки корпуса (рама, дверь, траверса…). */
export interface TemplateComponent {
  key: string;
  name: string;
  qty: number;
  unit: string;
  purchase: number; // за ед., ₽
}

/** Шаблон шкафа с заказным шифром (пустой или преднаполненный). */
export interface CabinetTemplate {
  id: string;
  orderCode: string; // заказной шифр: ШН-2000.800.600-IP54[-П]
  name: string; // «Шкаф напольный распределительный»
  direction: Direction;
  brand: string; // ПРОВЕНТО, DKC…
  mount: "floor" | "wall";
  h: number;
  w: number;
  d: number;
  ip: number;
  kit: TemplateComponent[]; // комплект поставки корпуса
  fillItems: LineItem[]; // преднаполнение (АВ на микроклимат/освещение)
  assemblyHours: number; // часы сборки — учтены в стоимости изделия
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type Role = "admin" | "manager" | "engineer";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  position?: string;
  roles: Role[];
}

export interface Toast {
  id: string;
  msg: string;
  kind: "ok" | "err" | "info";
}
