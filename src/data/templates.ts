import type { Cabinet, Direction, LineItem } from "../types";
import { findEq } from "./catalog";

/* ============================================================
   ТИПОВЫЕ ШАБЛОНЫ ТКП — стартовые конфигурации для мастера
   создания проекта. Цены берутся снимком из справочника.
   ============================================================ */

let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const li = (eqId: string, qty: number): LineItem => {
  const e = findEq(eqId);
  if (!e) throw new Error(`Нет позиции ${eqId} в справочнике`);
  return {
    id: nid("li"), eqId, sku: e.sku, name: e.name, brand: e.brand, unit: e.unit,
    qty, purchase: e.purchase,
  };
};

const cab = (
  kind: string, name: string,
  hours: { prod: number; design: number; soft: number },
  items: LineItem[], note?: string
): Cabinet => ({
  id: nid("cab"), kind, name,
  hours: hours.prod, designHours: hours.design, softwareHours: hours.soft,
  items, note,
});

export interface Tpl {
  key: string;
  title: string;
  direction: Direction;
  desc: string;
  build: () => Cabinet[];
  summary: string;
}

export const TEMPLATES: Tpl[] = [
  {
    key: "nku-shr",
    title: "Распределительный щит, 6 групп",
    direction: "nku",
    desc: "ГРЩ/ЩР на вводе 100 А: учёт, УЗИП, 6 отходящих групп, УЗО на мокрые группы.",
    summary: "1 шкаф · 14 позиций",
    build: () => [
      cab("ЩР", "ЩР-1 — Распределительный щит", { prod: 10, design: 4, soft: 0 }, [
        li("brk-nsx100", 1),
        li("sw-load63", 1),
        li("uzp-t2", 1),
        li("meter-231", 1),
        li("ct-100", 3),
        li("amm-din", 1),
        li("brk-2p32", 6),
        li("rcd-4030", 2),
        li("bus-3p", 2),
        li("bus-n", 2),
        li("term-set", 1),
        li("din-rail", 3),
        li("wire-pv", 25),
        li("box-floor", 1),
      ]),
    ],
  },
  {
    key: "nku-avr",
    title: "Щит АВР на два ввода",
    direction: "nku",
    desc: "Автоматическое переключение двух вводов по схеме 1-0-2 с контролем фаз.",
    summary: "1 шкаф · 13 позиций",
    build: () => [
      cab("АВР", "АВР-2 — Автоматический ввод резерва", { prod: 14, design: 6, soft: 0 }, [
        li("brk-nsx100", 2),
        li("sw-rev100", 1),
        li("rp-time", 2),
        li("rp-24", 4),
        li("amm-din", 1),
        li("meter-231", 1),
        li("ct-100", 2),
        li("bus-3p", 1),
        li("bus-n", 1),
        li("term-set", 1),
        li("wire-pv", 20),
        li("giland", 1),
        li("box-shmp", 1),
      ]),
    ],
  },
  {
    key: "asu-base",
    title: "АСУ ТП базовая (ПЛК + связь)",
    direction: "asu",
    desc: "Шкаф ПЛК с модулями ввода-вывода и панелью оператора + шкаф связи с промышленным Ethernet.",
    summary: "2 шкафа · 21 позиция",
    build: () => [
      cab("Шкаф ПЛК", "Шкаф ПЛК-1 — Контроллерный", { prod: 16, design: 12, soft: 24 }, [
        li("box-asu", 1),
        li("plc-110", 1),
        li("di-16", 2),
        li("do-16", 1),
        li("ai-8", 1),
        li("psu-10", 1),
        li("hmi-10", 1),
        li("rp-24", 4),
        li("term-set", 3),
        li("din-rail", 4),
        li("wire-pv", 30),
        li("giland", 2),
      ]),
      cab("Шкаф связи", "Шкаф СВ-1 — Коммуникационный", { prod: 6, design: 4, soft: 0 }, [
        li("box-shmp", 1),
        li("sw-ind", 1),
        li("mc-1", 2),
        li("patch-24", 1),
        li("psu-5", 1),
        li("ups-1000", 1),
        li("term-set", 1),
        li("din-rail", 2),
        li("wire-pv", 15),
      ]),
    ],
  },
  {
    key: "heat-pipe",
    title: "Обогрев трубопровода",
    direction: "heat",
    desc: "Щит управления обогревом на 2 зоны + кабельная секция: саморегулирующийся кабель 30 Вт/м.",
    summary: "2 секции · 17 позиций",
    build: () => [
      cab("ЩУО", "ЩУО-1 — Щит управления обогревом", { prod: 6, design: 3, soft: 0 }, [
        li("box-heat", 1),
        li("thermo-din", 2),
        li("sens-heat", 2),
        li("dif-1630", 2),
        li("amm-din", 1),
        li("bus-n", 1),
        li("term-set", 1),
        li("din-rail", 1),
        li("wire-pv", 10),
      ]),
      cab("Секция обогрева", "Секция Н-1 — Кабельная трасса, 120 м", { prod: 12, design: 2, soft: 0 }, [
        li("hc-30", 120),
        li("splice-kit", 6),
        li("tape", 4),
        li("sens-heat", 2),
      ]),
    ],
  },
];

export const tplById = (key: string): Tpl | undefined => TEMPLATES.find((t) => t.key === key);

export const buildTemplateCabinets = (key: string): Cabinet[] => {
  const t = tplById(key);
  return t ? t.build() : [];
};
