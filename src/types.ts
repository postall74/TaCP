/* ============================================================
   ДОМЕННАЯ МОДЕЛЬ
   Повторяет будущую схему PostgreSQL (см. DOCS.md и backend/):
   Projects (1) -> ProjectStructure/Cabinets (N) -> LineItems (N)
   EquipmentCatalog — справочник, Versions — снимки ТКП.
   ============================================================ */

export type Direction = "nku" | "asu" | "heat";
export type ProjectStatus = "draft" | "calc" | "sent" | "won" | "lost";
export type Theme = "light" | "dark";

/** Справочник оборудования (EquipmentCatalog).
    НОВАЯ МОДЕЛЬ ЦЕН: единственная цена — закупочная (purchase).
    Цена продажи = purchase × (1 + проект.markup/100) — считается один раз при расчёте. */
/** Позиция из «корзины» справочника: удалена, но хранится 90 дней (таблица
    deleted_equipment). Проекты, где она использована, показывают пометку
    «удалено из справочника · осталось N дней» и предлагают замену-аналог. */
export interface DeletedEquipment extends Equipment {
  deletedAt: number; // unix-мс
  deletedBy?: string;
}

export interface Equipment {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  direction: Direction | "uni";
  unit: string;
  purchase: number; // закупочная цена — единственная цена справочника (наценка добавляется при расчёте)
  attrs?: string; // характеристики: "напольный, IP54", "4-20 мА"…
  /** Номинальный ток, А — для проверки совместимости (см. utils/rules.ts). Заполняется из таблицы токов в каталоге. */
  ratedCurrent?: number;
}

/** Позиция в составе шкафа — снимок ЗАКУПОЧНОЙ цены из справочника на момент добавления.
    Цена продажи не хранится — вычисляется от purchase и наценки проекта. */
export interface LineItem {
  id: string;
  eqId: string;
  sku: string;
  name: string;
  brand: string;
  unit: string;
  qty: number;
  purchase: number; // закупочная цена (снимок)
}

/** Функциональный отсек шкафа (секционирование по ГОСТ IEC 61439-2).
    Перегородки отсека — параметрические позиции: их стоимость и типовой
    комплект вычисляет utils/segments.ts, в items они попадают снапшотами. */
export type SegmentKind = "input" | "feeders" | "control" | "busbar" | "cable" | "custom";

export interface CabinetSegment {
  id: string;
  kind: SegmentKind;
  name: string; // «Вводной отсек», «Отходящие линии»…
  partitions: number; // перегородки, образующие отсек (0–4)
}

/** Форма внутреннего разделения по ГОСТ IEC 61439-2. */
export type SeparationForm = "1" | "2a" | "2b" | "3a" | "3b" | "4a" | "4b";

export type CabinetDoorElementKind =
  | "lamp"
  | "button"
  | "selector"
  | "start-stop-pair"
  | "emergency-stop";
export type CabinetDoorLampTone = "green" | "amber" | "red" | "neutral";
export type CabinetDoorLabelSide = "above" | "below";

export interface CabinetDoorElement {
  id: string;
  kind: CabinetDoorElementKind;
  tone?: CabinetDoorLampTone;
  label: string;
  /** Индекс дверцы: 0..doorCount-1. */
  door: number;
  /** Нормализованная координата внутри дверцы: целое число 0..1000. */
  x: number;
  /** Нормализованная координата внутри дверцы: целое число 0..1000. */
  y: number;
}

/** cabinet-door-layout-v1: пользовательский эскиз, не физический чертёж. */
export interface CabinetDoorLayout {
  schema: "cabinet-door-layout-v1";
  doorCount: 1 | 2;
  labelSide: CabinetDoorLabelSide;
  elements: CabinetDoorElement[];
}

/** Будущая схема читается как opaque-данные и не должна перезаписываться v1-клиентом. */
export interface UnsupportedCabinetDoorLayout {
  schema: string;
  [key: string]: unknown;
}

export interface CabinetDoorPlacementGeometry {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
}

export interface CabinetDoorLeafGeometry {
  /** Индекс полотна, совпадает с door в cabinet-door-layout-v1. */
  door: number;
  /** Положение полотна в общей фронтальной системе координат, мм. */
  originXmm: number;
  originYmm: number;
  widthMm: number;
  heightMm: number;
  /** Область, которой соответствуют нормализованные координаты layout 0..1000. */
  placement: CabinetDoorPlacementGeometry;
}

/** cabinet-door-geometry-v1: введённая инженером физическая геометрия дверцы. */
export interface CabinetDoorGeometry {
  schema: "cabinet-door-geometry-v1";
  units: "mm";
  view: "outside-front";
  leaves: CabinetDoorLeafGeometry[];
}

/** Будущая схема читается как opaque-данные и не перезаписывается v1-клиентом. */
export interface UnsupportedCabinetDoorGeometry {
  schema: string;
  [key: string]: unknown;
}

/** Шкаф / секция / линейка (ProjectStructure). hours — сборка (производство). */
export interface Cabinet {
  id: string;
  kind: string; // ГРЩ, АВР, Шкаф ПЛК, ЩУО, ЗИП…
  name: string;
  items: LineItem[];
  hours: number; // чел·ч производства (сборка)
  designHours: number; // чел·ч проектирования
  softwareHours: number; // чел·ч разработки ПО
  note?: string;
  /** Секционирование: функциональные отсеки. Пусто/нет — шкаф без разделения (форма 1). */
  segments?: CabinetSegment[];
  /** Заявленная форма разделения (выводится в документ и на структурную схему). */
  form?: SeparationForm;
  /** Сохраняемый пользовательский эскиз дверцы. У legacy-шкафов отсутствует. */
  doorLayout?: CabinetDoorLayout | UnsupportedCabinetDoorLayout;
  /** Физическая геометрия полотен для размерного вида. У legacy-шкафов отсутствует. */
  doorGeometry?: CabinetDoorGeometry | UnsupportedCabinetDoorGeometry;
}

/** Снимок версии ТКП. */
export interface ProjectVersion {
  id: string;
  ts: number;
  label: string;
  cabinets: Cabinet[];
  calc: { eqBase: number; total: number };
}

/** Метаданные ТКП + все расчётные параметры проекта. */
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

  cabinets: Cabinet[];

  // Наценки и скидки
  markup: number; // % на оборудование
  workMarkup: number; // % на работы (ФОТ -> стоимость работ в продаже)
  discount: number; // % от суммы предложения
  vatRate: number; // % НДС (0 = без НДС)
  showWorkLines: boolean; // показывать работы отдельной строкой в ТКП

  // Себестоимость (плановая)
  tzzPct: number; // транспортно-заготовительные, % от стоимости оборудования
  thirdParty: number; // услуги сторонних организаций, ₽
  extraCosts: number; // дополнительные затраты, ₽
  unforeseenPct: number; // непредвиденные, % от плановой себестоимости
  tripCosts: number; // командировочные, ₽

  // Услуги и доставка
  smrCost: number; // шеф-монтаж: себестоимость
  smrSell: number; // шеф-монтаж: стоимость продажи
  pnrCost: number; // пусконаладка: себестоимость
  pnrSell: number; // пусконаладка: стоимость продажи
  transportPct: number; // доставка до заказчика, % от оборудования

  validDays: number; // срок действия предложения
  notes: string; // условия предложения
  versions: ProjectVersion[];
}

/** Ставки чел·часов по ролям (для себестоимости и расчёта по производству). */
export interface Rates {
  design: number;
  production: number;
  software: number;
  smr: number;
  pnr: number;
}

/** Реквизиты компании для документов + настройки интерфейса. */
export interface Settings {
  companyName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  requisites: string;
  manager: string;
  executor: string; // исполнитель — выводится в подпись документа
  theme: Theme;
  rates: Rates;
  /** URL C#-бэкенда (ASP.NET Core). Пустая строка = локальный режим (localStorage). */
  apiBaseUrl: string;
  /** Результат последней проверки подключения: null — не проверялось. */
  apiOnline: boolean | null;
}

export const CATEGORIES = [
  "Автоматические выключатели",
  "УЗО и дифавтоматы",
  "Рубильники и переключатели",
  "Контакторы и реле",
  "УЗИП и защита",
  "Измерения и учёт",
  "Блоки питания",
  "Корпуса и щиты",
  "Микроклимат",
  "Шины и клеммы",
  "Кабель и монтаж",
  "Кнопки и индикация",
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

export const CABINET_KINDS: Record<Direction, string[]> = {
  nku: ["ГРЩ", "ВРУ", "ЩР", "АВР", "ЩУ", "Щит освещения", "Щит учёта", "ЗИП"],
  asu: ["Шкаф ПЛК", "Шкаф связи", "Шкаф IT", "Шкаф питания", "Пульт управления", "ЗИП"],
  heat: ["ЩУО", "Шкаф обогрева", "Секция обогрева", "Кабельная трасса", "ЗИП"],
};

export const STATUS_META: Record<ProjectStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Черновик", cls: "bg-line/70 text-ink2", dot: "bg-mute" },
  calc: { label: "На расчёте", cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  sent: { label: "Отправлено", cls: "bg-steel-soft text-steel", dot: "bg-steel" },
  won: { label: "Выиграно", cls: "bg-ok-soft text-ok", dot: "bg-ok" },
  lost: { label: "Проиграно", cls: "bg-heat-soft text-heat", dot: "bg-heat" },
};

export const NEXT_STATUS: Record<ProjectStatus, ProjectStatus> = {
  draft: "calc",
  calc: "sent",
  sent: "won",
  won: "draft",
  lost: "draft",
};

export const DIRECTIONS: Record<Direction, { label: string; full: string; badge: string; chip: string }> = {
  nku: {
    label: "НКУ",
    full: "Низковольтные комплектные устройства",
    badge: "bg-steel-soft text-steel",
    chip: "bg-steel text-white",
  },
  asu: {
    label: "АСУ ТП / АСУ Э",
    full: "Автоматизированные системы управления",
    badge: "bg-ok-soft text-ok",
    chip: "bg-ok text-white",
  },
  heat: {
    label: "Электрообогрев",
    full: "Системы электрообогрева",
    badge: "bg-heat-soft text-heat",
    chip: "bg-heat text-white",
  },
};
