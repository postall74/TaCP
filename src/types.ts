/* ============================================================
   ДОМЕННЫЕ ТИПЫ ТКП·Про (прототип — контракт совпадает с основной
   веткой: даты unix-мс, строковые Id, снапшоты цен в позициях).
   ============================================================ */

export type Direction = "nku" | "asu" | "heat";

export const DIRECTIONS: Record<Direction, { label: string; short: string }> = {
  nku: { label: "НКУ — низковольтные комплектные устройства", short: "НКУ" },
  asu: { label: "АСУ ТП — автоматизация технологических процессов", short: "АСУ ТП" },
  heat: { label: "Электрообогрев", short: "Обогрев" },
};

export interface Equipment {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  direction: Direction | "uni";
  unit: string;
  purchase: number; // закупочная цена, ₽
  ratedCurrent?: number;
  attrs?: string;
}

export interface LineItem {
  id: string;
  eqId: string;
  sku: string;
  name: string;
  brand: string;
  unit: string;
  qty: number;
  purchase: number; // снимок закупочной цены
}

export type SegmentKind = "input" | "feeders" | "control" | "busbar" | "cable" | "custom";
export interface CabinetSegment { id: string; kind: SegmentKind; name: string; partitions: number }
export type SeparationForm = "1" | "2a" | "2b" | "3a" | "3b" | "4a" | "4b";

export interface Cabinet {
  id: string;
  kind: string;
  name: string;
  items: LineItem[];
  hours: number;
  designHours: number;
  softwareHours: number;
  note?: string;
  segments?: CabinetSegment[];
  form?: SeparationForm;
}

export type ProjectStatus = "draft" | "calc" | "sent" | "won" | "lost";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Черновик", calc: "На расчёте", sent: "Отправлено", won: "Выиграно", lost: "Проиграно",
};

export interface ProjectVersion {
  id: string;
  ts: number;
  label: string;
  cabinets: Cabinet[];
  calc: { eqBase: number; total: number };
}

export interface Rates { design: number; production: number; software: number }

export interface Project {
  id: string;
  number: string;
  title: string;
  client: string;
  contact: string;
  direction: Direction;
  status: ProjectStatus;
  createdAt: number; // unix-мс
  updatedAt: number;
  markup: number; // % наценки к закупке
  workMarkup: number; // % наценки на работы
  discount: number;
  vatRate: number;
  showWorkLines: boolean;
  validDays: number;
  notes: string;
  versions: ProjectVersion[];
  cabinets: Cabinet[];
}

export const CABINET_KINDS: Record<Direction, string[]> = {
  nku: ["ГРЩ", "ВРУ", "АВР", "ЩУ", "ЩО", "ЩС"],
  asu: ["Шкаф ПЛК", "ЩУО", "Шкаф телемеханики"],
  heat: ["ЩУО", "Шкаф обогрева", "ЩС обогрева"],
};
