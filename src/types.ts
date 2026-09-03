/* ============================================================
   ДОМЕННЫЕ ТИПЫ ТКП·Про. Единый контракт фронтенда; бэкенд
   зеркалит его в Models.cs (строковые Id, unix-мс даты —
   см. UnixMsDateTimeConverter).
   ============================================================ */

export type Direction = "nku" | "asu" | "heat";

export const DIRECTIONS: Record<Direction, { label: string; short: string; full: string; chip: string; badge: string }> = {
  nku: {
    label: "НКУ", short: "НКУ", full: "Низковольтные комплектные устройства",
    chip: "bg-steel-soft text-steel", badge: "bg-steel text-white",
  },
  asu: {
    label: "АСУ ТП", short: "АСУ", full: "Автоматизированные системы управления ТП",
    chip: "bg-accent-soft text-accent-deep", badge: "bg-accent text-white",
  },
  heat: {
    label: "Обогрев", short: "ОБОГРЕВ", full: "Системы электрообогрева",
    chip: "bg-warn-soft text-warn", badge: "bg-warn text-white",
  },
};

/** Категории справочника (фильтр на странице «Справочник»). */
export const CATEGORIES = [
  "Автоматические выключатели", "УЗО и дифавтоматы", "Контакторы и реле", "АВР",
  "Кнопки и индикация", "Шины и клеммы", "Измерения и учёт", "УЗИП и защита",
  "Блоки питания", "ПЛК и модули", "Панели оператора", "Корпуса и щиты",
  "Микроклимат", "Кабель и монтаж", "Сетевое оборудование", "Обогрев", "Прочее",
];

export type ProjectStatus = "draft" | "calc" | "sent" | "won" | "lost";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Черновик", calc: "На расчёте", sent: "Отправлено", won: "Выиграно", lost: "Проиграно",
};

export const STATUS_META: Record<ProjectStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Черновик", cls: "bg-line/70 text-ink2", dot: "bg-mute" },
  calc: { label: "На расчёте", cls: "bg-steel-soft text-steel", dot: "bg-steel" },
  sent: { label: "Отправлено", cls: "bg-accent-soft text-accent-deep", dot: "bg-accent" },
  won: { label: "Выиграно", cls: "bg-ok-soft text-ok", dot: "bg-ok" },
  lost: { label: "Проиграно", cls: "bg-heat-soft text-heat", dot: "bg-heat" },
};

/** Следующий статус по воронке (кнопка «→ статус» в карточке и редакторе). */
export const NEXT_STATUS: Record<ProjectStatus, ProjectStatus> = {
  draft: "calc", calc: "sent", sent: "won", won: "won", lost: "lost",
};

/* ------------------------- справочник ------------------------- */

export interface Equipment {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  /** "uni" — пригодно для всех направлений. */
  direction: Direction | "uni";
  unit: string;
  /** Закупочная цена, ₽ (база наценки — новая модель цен). */
  purchase: number;
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
  /** Снимок закупочной цены на момент добавления. */
  purchase: number;
}

/** Позиция справочника, удалённая в «корзину» (хранится 90 дней). */
export interface DeletedEquipment {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  direction: Direction | "uni";
  unit: string;
  purchase: number;
  attrs?: string;
  deletedAt: number;
  deletedBy: string;
}

/* --------------------- секционирование ------------------------ */

export type SegmentKind = "input" | "feeders" | "control" | "busbar" | "cable" | "custom";

export interface CabinetSegment {
  id: string;
  kind: SegmentKind;
  name: string;
  /** Перегородки, образующие отсек (0–4). */
  partitions: number;
}

/** Форма внутреннего разделения по ГОСТ IEC 61439-2. */
export type SeparationForm = "1" | "2a" | "2b" | "3a" | "3b" | "4a" | "4b";

/* ------------------------- структура -------------------------- */

export interface Cabinet {
  id: string;
  kind: string;
  name: string;
  items: LineItem[];
  /** чел·ч производства (сборка). */
  hours: number;
  /** чел·ч проектирования. */
  designHours: number;
  /** чел·ч разработки ПО. */
  softwareHours: number;
  note?: string;
  segments?: CabinetSegment[];
  form?: SeparationForm;
}

/** Снимок версии ТКП. */
export interface ProjectVersion {
  id: string;
  ts: number;
  label: string;
  cabinets: Cabinet[];
  calc: { eqBase: number; total: number };
}

/* -------------------------- проект ---------------------------- */

export interface Project {
  id: string;
  number: string;
  title: string;
  client: string;
  contact: string;
  direction: Direction;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
  /** Автор (Id пользователя) — задел на разделение данных. */
  owner?: string;

  cabinets: Cabinet[];
  versions: ProjectVersion[];

  /* экономика предложения */
  markup: number;        // % наценки к закупочной базе
  workMarkup: number;    // % наценки к работам
  discount: number;      // %
  vatRate: number;       // %
  showWorkLines: boolean;
  transportPct: number;  // % от оборудования

  /* себестоимость (план) */
  tzzPct: number;        // транспортно-заготовительные, %
  thirdParty: number;    // сторонние, ₽
  extraCosts: number;    // доп. затраты, ₽
  unforeseenPct: number; // непредвиденное, %
  tripCosts: number;     // командировки, ₽

  /* услуги отдельными строками */
  smrCost: number; smrSell: number;
  pnrCost: number; pnrSell: number;

  validDays: number;
  notes: string;
}

/* ----------------------- тарифы/настройки --------------------- */

export interface Rates {
  design: number;
  production: number;
  software: number;
  smr: number;
  pnr: number;
}

export interface Settings {
  /* реквизиты компании (привязаны к учётной записи на сервере) */
  companyName: string;
  tagline: string;
  requisites: string;
  manager: string;
  executor: string;
  phone: string;
  email: string;
  address: string;

  theme: "light" | "dark";
  rates: Rates;

  /** Адрес C#-бэкенда; пусто — локальный режим. */
  apiBaseUrl: string;
  /** null — ещё не проверяли. */
  apiOnline: boolean | null;
}

/* ------------------- шаблоны шкафов (Б.1) --------------------- */

export interface TemplateComponent {
  key: string;
  name: string;
  qty: number;
  unit: string;
  purchase: number;
}

export interface CabinetTemplate {
  id: string;
  /** Заказный шифр (например, ШН-200806-П1). */
  orderCode: string;
  name: string;
  direction: Direction | "uni";
  brand: string;
  mount: "floor" | "wall";
  h: number; w: number; d: number;
  ip: number;
  /** Комплект поставки корпуса. */
  kit: TemplateComponent[];
  /** Преднаполнение (АВ на микроклимат/освещение и т. п.). */
  fillItems: LineItem[];
  /** Часы сборщиков — учтены в стоимости изделия. */
  assemblyHours: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------- прочее ----------------------------- */

export const CABINET_KINDS: Record<Direction, string[]> = {
  nku: ["ГРЩ", "АВР", "ЩР", "ЩУ", "ЩИТ"],
  asu: ["Шкаф ПЛК", "Шкаф АСУ ТП", "ЩУО", "Шкаф связи"],
  heat: ["ЩУО", "ЩСУ", "Шкаф обогрева"],
};
