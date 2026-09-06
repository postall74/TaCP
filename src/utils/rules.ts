import type { Cabinet, Equipment, LineItem, Project } from "../types";

/* ============================================================
   ДВИЖОК ПРОВЕРКИ СОВМЕСТИМОСТИ (инженерные валидации).

   Каждое правило — чистая функция (шкаф|проект, контекст) -> Issue[].
   Контекст несёт справочник (чтобы знать категорию и номинальный ток
   позиции — в LineItem их нет, это снимок цены) и проект целиком
   (для межшкафных правил, например «панель оператора без ПЛК»).

   Номинальные токи аппаратов хранятся в справочнике (Equipment.ratedCurrent,
   накатываются из таблицы CURRENT в data/catalog.ts).
   ============================================================ */

export type Severity = "error" | "warn" | "info";

export interface Issue {
  /** уникальный id для стабильных ключей React и дедупликации */
  id: string;
  severity: Severity;
  cabinetId?: string;
  cabinetName?: string;
  text: string;
  hint?: string;
}

export interface ValidateCtx {
  catalog: Equipment[];
  project: Project;
}

export const SEVERITY_META: Record<Severity, { label: string; badge: string; rank: number }> = {
  error: { label: "Ошибка", badge: "bg-heat-soft text-heat", rank: 0 },
  warn: { label: "Внимание", badge: "bg-warn-soft text-warn", rank: 1 },
  info: { label: "Подсказка", badge: "bg-steel-soft text-steel", rank: 2 },
};

/* ---------------- вспомогательное ---------------- */

const byId = (ctx: ValidateCtx) => {
  const m = new Map<string, Equipment>();
  ctx.catalog.forEach((e) => m.set(e.id, e));
  return m;
};

/** Справочная карточка позиции (по eqId, фолбэк — по артикулу). */
const eqOf = (it: LineItem, map: Map<string, Equipment>, catalog: Equipment[]): Equipment | undefined =>
  (it.eqId && map.get(it.eqId)) || catalog.find((e) => e.sku === it.sku);

const CAT = {
  breaker: "Автоматические выключатели",
  rcd: "УЗО и дифавтоматы",
  switch: "Рубильники и переключатели",
  contactor: "Контакторы и реле",
  uzip: "УЗИП и защита",
  bus: "Шины и клеммы",
  plc: "ПЛК и модули",
  psu: "Блоки питания",
  hmi: "Панели оператора",
  heatCable: "Греющий кабель",
  thermo: "Управление обогревом",
};

/** Силовой аппарат с номинальным током (АВ, УЗО/диф, рубильник, контактор). */
const isDevice = (eq?: Equipment) =>
  !!eq &&
  eq.ratedCurrent !== undefined &&
  [CAT.breaker, CAT.rcd, CAT.switch, CAT.contactor].includes(eq.category);

/** именно автоматический выключатель / дифавтомат */
const isBreaker = (eq?: Equipment) => !!eq && [CAT.breaker, CAT.rcd].includes(eq.category);

/** Шина (а не клемма/DIN-рейка): имя начинается с «Шина» или артикул ШИ/PS/ШМ. */
const isBusbar = (eq?: Equipment) =>
  !!eq &&
  eq.category === CAT.bus &&
  (/^Шина/i.test(eq.name) || /^(ШИ|PS|ШМ|ШМТ)/i.test(eq.sku));

const has = (cab: Cabinet, pred: (eq?: Equipment) => boolean, map: Map<string, Equipment>, catalog: Equipment[]) =>
  cab.items.some((it) => pred(eqOf(it, map, catalog)));

const issue = (
  id: string,
  severity: Severity,
  text: string,
  cab?: Cabinet,
  hint?: string
): Issue => ({ id, severity, text, hint, cabinetId: cab?.id, cabinetName: cab?.name });

/* ---------------- правила на каждый шкаф ---------------- */

/** 1. Отходящий аппарат мощнее шины — «автомат 100 А на шине 63 А».
    Вводной аппарат (самый мощный) исключаем: гребёнки/шины питают отходящие
    группы, а ввод подключается напрямую — иначе были бы ложные срабатывания. */
const ruleBreakerOverBus = (cab: Cabinet, ctx: ValidateCtx): Issue[] => {
  const map = byId(ctx);
  const devices = cab.items
    .map((it) => ({ it, eq: eqOf(it, map, ctx.catalog) }))
    .filter(({ eq }) => isDevice(eq));
  const buses = cab.items
    .map((it) => ({ it, eq: eqOf(it, map, ctx.catalog) }))
    .filter(({ eq }) => isBusbar(eq) && eq!.ratedCurrent !== undefined);

  // один аппарат = только вводной, сравнивать не с чем
  if (devices.length < 2 || !buses.length) return [];

  const sorted = [...devices].sort((a, b) => b.eq!.ratedCurrent! - a.eq!.ratedCurrent!);
  const outgoing = sorted.slice(1); // без вводного (максимального)
  const dev = outgoing[0];
  const bus = buses.reduce((a, b) => (a.eq!.ratedCurrent! <= b.eq!.ratedCurrent! ? a : b));

  if (dev.eq!.ratedCurrent! > bus.eq!.ratedCurrent!) {
    return [
      issue(
        `${cab.id}-brk-bus`,
        "error",
        `${dev.eq!.name} (${dev.eq!.ratedCurrent} А) — номинал выше, чем у шины ${bus.eq!.name} (${bus.eq!.ratedCurrent} А).`,
        cab,
        "Замените шину на более мощную (ШМТ 40×4 до 250 А) или снизьте номинал отходящего аппарата."
      ),
    ];
  }
  return [];
};

/** 2. Много автоматов, но нет соединительной шины. */
const ruleManyBreakersNoBus = (cab: Cabinet, ctx: ValidateCtx): Issue[] => {
  const map = byId(ctx);
  const breakers = cab.items.filter((it) => isBreaker(eqOf(it, map, ctx.catalog)));
  const anyBus = cab.items.some((it) => isBusbar(eqOf(it, map, ctx.catalog)));
  if (breakers.length >= 3 && !anyBus) {
    return [
      issue(
        `${cab.id}-no-bus`,
        "info",
        `${breakers.length} автомата(ов) без соединительной шины — монтаж перемычками менее надёжен.`,
        cab,
        "Добавьте гребёнку PS-63 3P или медную шину ШМТ."
      ),
    ];
  }
  return [];
};

/** 3. УЗИП без вводного автомата/рубильника перед ним. */
const ruleUzipNoBreaker = (cab: Cabinet, ctx: ValidateCtx): Issue[] => {
  const map = byId(ctx);
  const hasUzip = has(cab, (eq) => eq?.category === CAT.uzip, map, ctx.catalog);
  const hasIn = has(cab, (eq) => !!eq && [CAT.breaker, CAT.switch].includes(eq.category), map, ctx.catalog);
  if (hasUzip && !hasIn) {
    return [
      issue(
        `${cab.id}-uzip`,
        "warn",
        "УЗИП установлен без вводного автомата или рубильника.",
        cab,
        "Перед УЗИП нужен вводной АВ/рубильник — иначе его нельзя безопасно отключить для замены."
      ),
    ];
  }
  return [];
};

/** 4. ПЛК в шкафу без блока питания 24 В. */
const rulePlcNoPsu = (cab: Cabinet, ctx: ValidateCtx): Issue[] => {
  const map = byId(ctx);
  const hasPlc = has(cab, (eq) => eq?.category === CAT.plc && /контроллер|ПЛК/i.test(eq.name + eq.sku), map, ctx.catalog);
  const hasPsu = has(cab, (eq) => eq?.category === CAT.psu, map, ctx.catalog);
  if (hasPlc && !hasPsu) {
    return [
      issue(
        `${cab.id}-plc-psu`,
        "warn",
        "Контроллер установлен без блока питания 24 В DC в этом шкафу.",
        cab,
        "Добавьте DRP-120-24 (5 А) или DRP-240-24 (10 А) — ПЛК и модули питаются от 24 В."
      ),
    ];
  }
  return [];
};

/** 5. Панель оператора — а ПЛК нет во всём проекте. */
const ruleHmiNoPlc = (cab: Cabinet, ctx: ValidateCtx): Issue[] => {
  const map = byId(ctx);
  const hasHmi = has(cab, (eq) => eq?.category === CAT.hmi, map, ctx.catalog);
  if (!hasHmi) return [];
  const plcSomewhere = ctx.project.cabinets.some((c) =>
    c.items.some((it) => {
      const eq = eqOf(it, map, ctx.catalog);
      return eq?.category === CAT.plc;
    })
  );
  if (!plcSomewhere) {
    return [
      issue(
        `${cab.id}-hmi-plc`,
        "warn",
        "Панель оператора есть, а контроллера нет ни в одном шкафу проекта.",
        cab,
        "Панель работает в паре с ПЛК — добавьте контроллер (например ПЛК110-24)."
      ),
    ];
  }
  return [];
};

/** 6. Пустой шкаф. */
const ruleEmpty = (cab: Cabinet): Issue[] =>
  cab.items.length === 0
    ? [issue(`${cab.id}-empty`, "info", "Шкаф пока пуст — оборудование ещё не добавлено.", cab)]
    : [];

/* ---------------- секционирование (ГОСТ IEC 61439-2) ---------------- */

const FORM_RANK: Record<string, number> = { "1": 1, "2a": 2, "2b": 2, "3a": 3, "3b": 3, "4a": 4, "4b": 4 };

/** 7. Заявлена форма ≥2, но шинного отсека в составе нет. */
const ruleFormNoBusbar = (cab: Cabinet): Issue[] => {
  if (!cab.form || (FORM_RANK[cab.form] ?? 1) < 2) return [];
  const hasBusbar = (cab.segments ?? []).some((s) => s.kind === "busbar");
  if (hasBusbar) return [];
  return [
    issue(
      `${cab.id}-form-busbar`,
      "warn",
      `Форма разделения ${cab.form} требует отделения шин, но шинного отсека в шкафу нет.`,
      cab,
      "Добавьте «Шинный отсек» в панели «Секционирование» этого шкафа."
    ),
  ];
};

/** 8. Форма ≥3 при одном или нуле функциональных отсеков. */
const ruleFormFewSegments = (cab: Cabinet): Issue[] => {
  if (!cab.form || (FORM_RANK[cab.form] ?? 1) < 3) return [];
  const n = (cab.segments ?? []).filter((s) => s.kind !== "busbar").length;
  if (n >= 2) return [];
  return [
    issue(
      `${cab.id}-form-segments`,
      "warn",
      `Форма ${cab.form} отделяет функциональные блоки друг от друга, а отсеков всего ${n}.`,
      cab,
      "Разбейте шкаф минимум на два функциональных отсека (ввод, отходящие линии, управление…)."
    ),
  ];
};

/* ---------------- правила на весь проект ---------------- */

/** 7. Греющий кабель без терморегулятора. */
const ruleHeatNoThermo = (ctx: ValidateCtx): Issue[] => {
  const map = byId(ctx);
  const all = ctx.project.cabinets.flatMap((c) => c.items);
  const hasCable = all.some((it) => eqOf(it, map, ctx.catalog)?.category === CAT.heatCable);
  const hasThermo = all.some((it) => eqOf(it, map, ctx.catalog)?.category === CAT.thermo);
  if (hasCable && !hasThermo) {
    return [
      issue(
        "proj-heat-thermo",
        "warn",
        "В проекте есть греющий кабель, но нет ни одного терморегулятора.",
        undefined,
        "Без регулирования кабель будет греть постоянно — добавьте РТД-16 или E5CC."
      ),
    ];
  }
  return [];
};

/* ---------------- публичный API ---------------- */

const PER_CABINET = [ruleBreakerOverBus, ruleManyBreakersNoBus, ruleUzipNoBreaker, rulePlcNoPsu, ruleHmiNoPlc];

/** Проверить один шкаф (используется для мгновенной реакции при добавлении позиции). */
export function validateCabinet(cab: Cabinet, ctx: ValidateCtx): Issue[] {
  return [
    ...PER_CABINET.flatMap((r) => r(cab, ctx)),
    ...ruleEmpty(cab),
    ...ruleFormNoBusbar(cab),
    ...ruleFormFewSegments(cab),
  ].sort((a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank);
}

/** Проверить весь проект. */
export function validateProject(ctx: ValidateCtx): Issue[] {
  const perCab = ctx.project.cabinets.flatMap((c) => validateCabinet(c, ctx));
  const proj = ruleHeatNoThermo(ctx);
  return [...perCab, ...proj].sort(
    (a, b) => SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank
  );
}

/** Сводка по уровням для бейджей. */
export function summarize(issues: Issue[]) {
  return {
    error: issues.filter((i) => i.severity === "error").length,
    warn: issues.filter((i) => i.severity === "warn").length,
    info: issues.filter((i) => i.severity === "info").length,
    total: issues.length,
  };
}
