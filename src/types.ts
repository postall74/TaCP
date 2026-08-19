/* ------------------------------------------------------------------ */
/*  Доменная модель «ТКП Про».                                        */
/*  Соответствие будущей схеме PostgreSQL:                             */
/*    Users          -> Settings (менеджер) [до внедрения auth]        */
/*    Projects       -> Project                                     */
/*    EquipmentCatalog -> Equipment                                  */
/*    ProjectStructure -> Cabinet + LineItem                          */
/* ------------------------------------------------------------------ */

export type Direction = "nku" | "asu" | "heat";

export interface Equipment {
  id: string;
  sku: string; // артикул
  name: string; // наименование
  brand: string; // производитель
  category: string; // категория (type: circuit_breaker, plc, ...)
  direction: Direction | "uni"; // направление применения
  unit: string; // ед. изм.
  purchase: number; // цена закупки (внутренняя)
  price: number; // цена продажи (базовая)
  attrs?: string; // характеристики
}

export interface LineItem {
  id: string;
  eqId: string; // ссылка на справочник
  sku: string;
  name: string;
  brand: string;
  unit: string;
  qty: number;
  price: number; // зафиксированная цена за ед.
  purchase: number; // закупочная для расчёта маржи
}

export interface Cabinet {
  id: string;
  kind: string; // ГРЩ, АВР, Шкаф ПЛК...
  name: string; // «Шкаф №1 — Ввод»
  note?: string;
  hours: number; // нормо-часы сборки/монтажа
  items: LineItem[];
}

export type ProjectStatus = "draft" | "sent" | "approved";

export interface CalcFields {
  markup: number; // наценка на оборудование, %
  hourRate: number; // ставка нормо-часа, ₽
  complexity: number; // коэффициент сложности сборки
  discount: number; // скидка, %
  vat: boolean; // НДС 20 % сверху
}

export interface Project extends CalcFields {
  id: string;
  number: string; // ТКП-2026-001
  title: string;
  client: string;
  contact: string;
  direction: Direction;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  validDays: number; // срок действия предложения
  notes: string; // условия оплаты/поставки
  cabinets: Cabinet[];
  versions: ProjectVersion[];
}

export interface ProjectVersion {
  id: string;
  label: string;
  createdAt: number;
  total: number;
  cabinets: Cabinet[];
  calc: CalcFields;
}

export interface Settings {
  companyName: string;
  tagline: string;
  requisites: string;
  manager: string;
  phone: string;
  email: string;
  address: string;
}

export interface Toast {
  id: string;
  msg: string;
  tone: "ok" | "err" | "info";
}

/* ------------------- справочные константы ------------------- */

export const DIRECTIONS: Record<
  Direction,
  { label: string; full: string; badge: string; dot: string }
> = {
  nku: {
    label: "НКУ",
    full: "Низковольтные комплектные устройства",
    badge: "bg-accent-soft text-accent-deep",
    dot: "bg-accent",
  },
  asu: {
    label: "АСУ ТП / АСУ Э",
    full: "Автоматизированные системы управления",
    badge: "bg-steel-soft text-steel",
    dot: "bg-steel",
  },
  heat: {
    label: "Электрообогрев",
    full: "Системы электрического обогрева",
    badge: "bg-heat-soft text-heat",
    dot: "bg-heat",
  },
};

export const CABINET_KINDS: Record<Direction, string[]> = {
  nku: ["ГРЩ", "ВРУ", "ЩР", "ЩУ", "ЩО", "Щит АВР"],
  asu: ["Шкаф ПЛК", "Шкаф ПТК", "Шкаф связи", "IT-шкаф", "ЩУ", "Шкаф питания"],
  heat: ["ЩУО", "Щит питания обогрева", "Секция обогрева"],
};

export const CATEGORIES: string[] = [
  "Автоматические выключатели",
  "УЗО и дифавтоматы",
  "Контакторы и реле",
  "Рубильники и переключатели",
  "УЗИП и защита",
  "Измерения и учёт",
  "Блоки питания",
  "Корпуса и щиты",
  "Шины и клеммы",
  "Кабель и монтаж",
  "ПЛК и модули",
  "Панели оператора",
  "Датчики",
  "Преобразователи частоты",
  "Сетевое оборудование",
  "Серверы и ПО",
  "Греющий кабель",
  "Управление обогревом",
  "Монтаж обогрева",
];

export const STATUS_META: Record<ProjectStatus, { label: string; cls: string }> = {
  draft: { label: "Черновик", cls: "bg-line/60 text-ink2" },
  sent: { label: "Отправлено", cls: "bg-warn-soft text-warn" },
  approved: { label: "Согласовано", cls: "bg-ok-soft text-ok" },
};
