import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useStore } from "../store";
import { findEq } from "../data/catalog";
import type { Cabinet, CabinetSegment, Equipment, LineItem, Project, SeparationForm } from "../types";
import { CABINET_KINDS, DIRECTIONS } from "../types";
import { fmtMoney, genId } from "../utils";
import {
  buildKit, kitTotal, kitAssemblyHours, kitLabel, kitLinesToItems, findKitSystem,
  nearestDims, hasExactDims, KIT_SYSTEMS, KIT_GROUP_LABEL,
} from "../utils/kit";
import { buildSegmentLines, FORM_META, segmentsForForm } from "../utils/segments";
import { Btn, Field, Input, NumInput, Select, Toggle, cx } from "./ui";
import { IcAlert, IcArrowLeft, IcCheck, IcChevronRight, IcWand, IcX } from "./icons";

/* ============================================================
   МАСТЕР ПОДБОРА — пошаговый инженерный опросник (14 шагов).
   Корпус: тип (напольный/навесной) → система (CQE N — DKC,
   PROVENTO — EKF; прежний CQE снят с производства) → габариты
   (нет типового — ближайшие или ручной ввод) → составной ряд
   (2+ корпусов «стена к стене»: панели N+1, стыки N−1, цоколи N)
   → доп. траверсы. АВР — до вводов: 2/3/5 вводов, 1-ф/3-ф.
   Заземление: TN-S/TN-C-S/TT/IT (шин PE — сколько нужно, для IT —
   контроль изоляции). УЗИП: силовые + RS-485/Ethernet/каналы ПЛК.
   Кнопки и индикация — отдельный опросник с визуальным макетом
   дверцы. Приборы: амперметры/вольтметры на вводе и отходящих.
   Шины — в т.ч. секционированные. Микроклимат: вентиляторы,
   решётки, обогрев, кондиционирование. ПЛК — с барьерами
   искрозащиты и преобразователями сигналов. Секционирование —
   опросник форм 1/2a/3a/3b/4a/4b по ГОСТ IEC 61439-2. Работы,
   ЗИП (мин. 1 шт), транспорт, сводка.
   ============================================================ */

interface Draft {
  kind: string;
  cabNeed: boolean;
  cabMode: "kit" | "catalog" | "manual";
  /* составной комплект */
  cabMountKit: "floor" | "wall";
  kitSystem: string;
  kitH: number; kitW: number; kitD: number; kitDoors: number;
  joined: number;        // корпусов в составном шкафу (1 — одиночный)
  extraTrav: number;     // дополнительные траверсы, шт
  pedestalKit: boolean;
  customDim: boolean; customName: string; customPrice: number;
  /* готовый из справочника */
  cabMount: "any" | "floor" | "wall";
  cabIp: "any" | "31" | "54" | "65" | "66" | "67";
  cabId: string | null;
  /* ручной ввод */
  manualOn: boolean; manualName: string; manualPrice: number;

  on: Record<string, boolean>;

  /* АВР — до вводов и линий */
  avrKind: "bavr" | "contactors" | "switch";
  avrInputs: 2 | 3 | 5;
  avrPhase: "1ph" | "3ph";
  ctrlLines: number;

  /* ввод, отходящие, учёт, заземление */
  mainId: string;
  out1p: number; out1pId: string;
  out3p: number; out3pId: string;
  rcd: number;
  meter: boolean;
  ground: "tn-s" | "tn-c-s" | "tt" | "it";
  peBuses: number;
  itMonitor: boolean;

  /* УЗИП: силовые + слаботочные */
  uzpKind: "none" | "t2" | "t12";
  uzpRs: number; uzpEth: number; uzpIo: number;

  /* кнопки и индикация (+ интерактивная дверца) */
  buttons: number; btnStop: number; lamps: number; switches: number;
  lineBtns: number;
  avrInd: boolean;
  /** Позиции элементов на дверце (координаты viewBox макета), ключ — стабильный id элемента. */
  doorPos: Record<string, { x: number; y: number }>;
  /** Свои подписи элементов (переопределяют названия по умолчанию). */
  doorLabels: Record<string, string>;
  /** Подписи элементов: под элементом или над ним. */
  doorLabelSide: "below" | "above";

  /* измерительные приборы */
  ammIn: number; voltIn: number; ammOut: number;
  /** Измерители параметров сети на вводе (Wiren Board WB-MAP), шт. */
  netIn: number;
  netInKind: "map3e" | "map12h";
  /** Тип амперметра на отходящих: DIN-рейка или панельный (под ТТ). */
  ammOutKind: "din" | "panel";
  /** ТТ на канал: 3 — трёхфазный (поканально на каждую фазу), 1 — однофазный. */
  ctPerChannel: 1 | 3;
  ctId: "ct-63" | "ct-100" | "ct-150";

  /* шины */
  busNeed: boolean; busCurrent: number; busSections: number;

  /* компоновка (только для готовых корпусов из справочника) */
  wallRow: boolean; rowSize: number; pedestal: boolean;

  /* микроклимат */
  fans: number; grilles: number; heaters: number; thermos: number; acOn: boolean;

  /* ПЛК */
  plcNeed: boolean; di: number; doN: number; ai: number; ao: number; reserve: number;
  hmiKind: "none" | "7" | "10";
  barriers: number; converters: number;

  /* секционирование (опросник форм) */
  segOn: boolean;
  segQ1: boolean; // отдельный шинный отсек?
  segQ2: boolean; // блоки отделены друг от друга?
  segQ3: "3a" | "3b" | "4a" | "4b";

  hours: number; designHours: number; softwareHours: number; separateLine: boolean;
  zipOn: boolean; zipPct: number;
  transportOn: boolean; transportPct: number;
}

const STEP_IDS = [
  "cab", "avr", "breakers", "uzp", "controls", "meters", "busbars",
  "layout", "climate", "plc", "section", "work", "zip", "summary",
] as const;
type StepId = (typeof STEP_IDS)[number];

const STEP_META: { id: StepId; title: string; desc: string }[] = [
  { id: "cab", title: "Корпус шкафа", desc: "тип, габарит, составной ряд" },
  { id: "avr", title: "АВР", desc: "2/3/5 вводов, 1-ф / 3-ф" },
  { id: "breakers", title: "Ввод и линии", desc: "автоматы, учёт, заземление" },
  { id: "uzp", title: "УЗИП", desc: "силовые, RS-485, Ethernet, I/O" },
  { id: "controls", title: "Кнопки и индикация", desc: "опросник + макет дверцы" },
  { id: "meters", title: "Измерительные приборы", desc: "WB, ТТ, амперметры" },
  { id: "busbars", title: "Шинные сборки", desc: "по току, секции" },
  { id: "layout", title: "Компоновка", desc: "стенки, цоколи" },
  { id: "climate", title: "Микроклимат", desc: "вентиляция, обогрев" },
  { id: "plc", title: "ПЛК и модули", desc: "сигналы, искрозащита" },
  { id: "section", title: "Секционирование", desc: "формы 1…4b (61439-2)" },
  { id: "work", title: "Работы и ППО", desc: "нормо-часы" },
  { id: "zip", title: "ЗИП и транспорт", desc: "% запаса, доставка" },
  { id: "summary", title: "Сводка", desc: "проверка и применение" },
];

const li = (eqId: string, qty: number): LineItem | null => {
  const e = findEq(eqId);
  if (!e || qty <= 0) return null;
  return { id: genId("li"), eqId, sku: e.sku, name: e.name, brand: e.brand, unit: e.unit, qty, purchase: e.purchase };
};

/** Объединяет повторяющиеся позиции (например, реле из разных шагов). */
const dedupe = (items: (LineItem | null)[]): LineItem[] => {
  const map = new Map<string, LineItem>();
  for (const it of items) {
    if (!it) continue;
    const ex = map.get(it.eqId);
    if (ex) ex.qty += it.qty;
    else map.set(it.eqId, { ...it });
  }
  return [...map.values()];
};

const modCount = (signals: number, channels: number, reserve: number) =>
  signals <= 0 ? 0 : Math.ceil((signals / channels) * (1 + reserve / 100));

function busSelection(current: number) {
  if (current <= 0) return null;
  if (current <= 63)
    return { label: "Гребёнки PS-63 (2 шт) + нулевые шины (2 шт)", items: [li("bus-3p", 2), li("bus-n", 2)], note: "модульные гребёнки — для токов до 63 А" };
  if (current <= 160)
    return { label: "Медная шина 25×3 — 2 м + 4 шинодержателя ШД-1", items: [li("bus-cu25", 2), li("holder-1", 4)], note: "для токов 63…160 А" };
  if (current <= 250)
    return { label: "Медная шина 40×4 — 2 м + 6 шинодержателей ШД-1", items: [li("bus-cu40", 2), li("holder-1", 6)], note: "для токов 160…250 А" };
  return { label: "Медная шина 40×4 — 4 м + 10 шинодержателей", items: [li("bus-cu40", 4), li("holder-1", 10)], note: "свыше 250 А — рекомендуется проверка сечения по ГОСТ" };
}

const ZIP_CATS = [
  "Автоматические выключатели", "УЗО и дифавтоматы", "Контакторы и реле",
  "УЗИП и защита", "Блоки питания", "ПЛК и модули", "Панели оператора",
];

/* Отсеки по форме разделения — общая логика в utils/segments.ts
   (segmentsForForm): её используют и этот опросник, и панель
   «Секционирование» на вкладке «Конструктор». */

export default function Wizard({ project, onClose }: { project: Project; onClose: () => void }) {
  const catalog = useStore((s) => s.catalog);
  const addCabinetsBulk = useStore((s) => s.addCabinetsBulk);
  const updateProject = useStore((s) => s.updateProject);
  const upsertEquipment = useStore((s) => s.upsertEquipment);
  const toast = useStore((s) => s.toast);

  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => ({
    kind: CABINET_KINDS[project.direction][0],
    cabNeed: true,
    cabMode: "kit",
    cabMountKit: "floor",
    kitSystem: "cqen-floor",
    kitH: 2000, kitW: 800, kitD: 600, kitDoors: 1,
    joined: 1, extraTrav: 0, pedestalKit: false,
    customDim: false, customName: "", customPrice: 25000,
    cabMount: "any", cabIp: "any", cabId: null,
    manualOn: false, manualName: "", manualPrice: 15000,
    on: {
      avr: false, breakers: true, uzp: false, controls: true, meters: false,
      busbars: true, layout: true, climate: false, plc: project.direction === "asu", section: false,
    },
    avrKind: "bavr", avrInputs: 2, avrPhase: "3ph", ctrlLines: 0,
    mainId: "brk-nsx100",
    out1p: 6, out1pId: "brk-c16", out3p: 2, out3pId: "brk-3p40",
    rcd: 0, meter: true,
    ground: "tn-s", peBuses: 1, itMonitor: true,
    uzpKind: "t2", uzpRs: 0, uzpEth: 0, uzpIo: 0,
    buttons: 2, btnStop: 1, lamps: 2, switches: 1, lineBtns: 0, avrInd: true,
    doorPos: {}, doorLabels: {}, doorLabelSide: "below",
    ammIn: 0, voltIn: 0, ammOut: 0,
    netIn: 0, netInKind: "map3e", ammOutKind: "din", ctPerChannel: 3, ctId: "ct-100",
    busNeed: true, busCurrent: 100, busSections: 1,
    wallRow: false, rowSize: 2, pedestal: false,
    fans: 0, grilles: 0, heaters: 0, thermos: 0, acOn: false,
    plcNeed: project.direction === "asu", di: 16, doN: 8, ai: 4, ao: 0, reserve: 20,
    hmiKind: "10", barriers: 0, converters: 0,
    segOn: false, segQ1: false, segQ2: false, segQ3: "3a",
    hours: 10, designHours: 4, softwareHours: 0, separateLine: true,
    zipOn: true, zipPct: 20,
    transportOn: false, transportPct: 2,
  }));

  const set = (patch: Partial<Draft>) => setD((s) => ({ ...s, ...patch }));
  const setOn = (k: string, v: boolean) => setD((s) => ({ ...s, on: { ...s.on, [k]: v } }));

  const meta = STEP_META[step];

  /* ---------- система комплекта по типу монтажа ---------- */
  const sys = findKitSystem(d.kitSystem);
  const mountSystems = KIT_SYSTEMS.filter((s) => s.mount === d.cabMountKit);
  const switchMount = (m: "floor" | "wall") => {
    const s = KIT_SYSTEMS.find((x) => x.mount === m);
    if (!s) return;
    set({
      cabMountKit: m, kitSystem: s.id,
      kitH: s.heights[Math.floor(s.heights.length / 2)], kitW: s.widths[0], kitD: s.depths[0],
      kitDoors: 1, joined: 1, extraTrav: 0, pedestalKit: false,
    });
  };

  /* ---------- подбор готового корпуса (режим «из справочника») ---------- */
  const enclosures = useMemo(() => catalog.filter((e) => e.category === "Корпуса и щиты"), [catalog]);
  const ipOf = (e: Equipment) => Number(/IP\s*(\d+)/i.exec(e.attrs ?? "")?.[1] ?? 0);
  const mountOf = (e: Equipment) => ((e.attrs ?? "").toLowerCase().includes("напольн") ? "floor" : "wall");
  const pool = enclosures.filter((e) => d.cabMount === "any" || mountOf(e) === d.cabMount);
  const exact = d.cabIp === "any" ? pool : pool.filter((e) => ipOf(e) === Number(d.cabIp));
  const fallback =
    exact.length === 0 && d.cabIp !== "any"
      ? pool.filter((e) => ipOf(e) > 0 && ipOf(e) < Number(d.cabIp)).sort((a, b) => ipOf(b) - ipOf(a)).slice(0, 3)
      : [];

  /* ---------- комплект корпуса (режим «составной») ---------- */
  const kitInput = {
    systemId: d.kitSystem, h: d.kitH, w: d.kitW, d: d.kitD, doors: d.kitDoors,
    joined: d.joined, pedestal: d.pedestalKit, extraTraverses: d.extraTrav,
  };
  const kitLines = useMemo(
    () => (d.cabNeed && d.cabMode === "kit" && !d.customDim ? buildKit(kitInput) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.cabNeed, d.cabMode, d.customDim, d.kitSystem, d.kitH, d.kitW, d.kitD, d.kitDoors, d.joined, d.pedestalKit, d.extraTrav]
  );
  const cabHeight = d.cabMode === "kit" ? d.kitH : 1800;
  const near = nearestDims(sys, d.kitH, d.kitW, d.kitD);

  /* ---------- секционирование ---------- */
  const segForm: SeparationForm = !d.segQ1 ? "1" : !d.segQ2 ? "2a" : d.segQ3;
  const segPresets = d.segOn ? segmentsForForm(segForm) : [];
  const segSegments: CabinetSegment[] = useMemo(
    () => segPresets.map((p) => ({ id: genId("seg"), kind: p.kind, name: p.name, partitions: p.partitions })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.segOn, segForm]
  );
  const segBuild = d.segOn ? buildSegmentLines(segSegments, cabHeight) : null;

  /* ---------- сборка результата ---------- */
  const bundle = useMemo(() => {
    const items: (LineItem | null)[] = [];
    if (d.cabNeed) {
      if (d.cabMode === "kit" && !d.customDim) {
        for (const l of kitLines)
          items.push({ id: l.key, eqId: `kit-${l.key}`, sku: l.sku, name: l.name, brand: sys.brand, unit: "шт", qty: l.qty, purchase: l.purchase });
      } else if (d.cabMode === "kit" && d.customDim && d.customName.trim()) {
        items.push({ id: genId("li"), eqId: "manual-enclosure", sku: "РУЧНОЙ-ВВОД", name: d.customName.trim(), brand: "—", unit: "шт", qty: 1, purchase: Math.max(1, d.customPrice) });
      } else if (d.cabMode === "catalog" && d.cabId) {
        items.push(li(d.cabId, 1));
      } else if (d.cabMode === "manual" && d.manualName.trim()) {
        items.push({ id: genId("li"), eqId: "manual-enclosure", sku: "РУЧНОЙ-ВВОД", name: d.manualName.trim(), brand: "—", unit: "шт", qty: 1, purchase: Math.max(1, d.manualPrice) });
      }
    }
    if (d.on.avr) {
      const kits = d.avrInputs === 2 ? 1 : 2; // 3 ввода — каскад из 2 блоков; 5 — два объединённых АВР
      if (d.avrKind === "bavr") {
        items.push(li("bavr-kit", kits));
        if (d.avrInputs === 5) items.push(li("interlock", 1));
        items.push(li("rp-24", 2 * kits));
      }
      if (d.avrKind === "contactors") {
        items.push(li("km-25", d.avrInputs));
        items.push(li("interlock", Math.max(1, d.avrInputs - 1)));
        items.push(li("rp-24", d.avrInputs));
      }
      if (d.avrKind === "switch") items.push(li("sw-rev100", 1));
      items.push(li("rp-24", d.ctrlLines));
    }
    if (d.on.breakers) {
      items.push(li(d.mainId, 1));
      items.push(li(d.out1pId, d.out1p));
      items.push(li(d.out3pId, d.out3p));
      items.push(li("rcd-4030", d.rcd));
      if (d.meter) {
        if (d.avrPhase === "1ph") items.push(li("meter-201", 1));
        else {
          items.push(li("meter-231", 1));
          items.push(li("ct-100", 3));
          items.push(li("amm-din", 1));
        }
      }
      items.push(li("pe-bus", d.peBuses));
      if (d.ground === "it" && d.itMonitor) items.push(li("imd-1", 1));
    }
    if (d.on.uzp) {
      if (d.uzpKind === "t2") items.push(li("uzp-t2", 1));
      if (d.uzpKind === "t12") items.push(li("uzp-t12", 1));
      items.push(li("uzp-rs485", d.uzpRs));
      items.push(li("uzp-eth", d.uzpEth));
      items.push(li("uzp-io", d.uzpIo));
    }
    if (d.on.controls) {
      items.push(li("btn-1", d.buttons + d.lineBtns * 2));
      items.push(li("btn-e", d.btnStop));
      items.push(li("lamp-3", d.lamps));
      items.push(li("swsel-1", d.switches));
      if (d.avrInd && d.on.avr) items.push(li("lamp-1", 3)); // Сеть 1 / Сеть 2 / Авария
    }
    if (d.on.meters) {
      /* вводные средства измерения */
      items.push(li(d.netInKind === "map3e" ? "wb-map3e" : "wb-map12h", d.netIn));
      items.push(li("amm-din", d.ammIn));
      items.push(li("volt-din", d.voltIn));
      /* отходящие линии: амперметры + трансформаторы тока поканально */
      items.push(li(d.ammOutKind === "panel" ? "amm-panel" : "amm-din", d.ammOut));
      items.push(li(d.ctId, d.ammOut * d.ctPerChannel));
    }
    if (d.on.busbars && d.busNeed) {
      const sel = busSelection(d.busCurrent);
      if (sel) {
        const mult = Math.max(1, Math.round(d.busSections));
        for (const it of sel.items) if (it) items.push({ ...it, qty: it.qty * mult });
        if (mult > 1) items.push(li("bus-joint", mult - 1));
      }
    }
    if (d.on.layout && d.cabMode === "catalog") {
      if (d.wallRow) items.push(li("panel-side", Math.max(2, d.rowSize + 1)));
      if (d.pedestal) items.push(li("pedestal-600", Math.max(1, d.rowSize)));
    }
    if (d.on.climate) {
      items.push(li("fan-120", d.fans));
      items.push(li("grille-120", d.grilles));
      items.push(li("heater-150", d.heaters));
      items.push(li("thermo-1", d.thermos));
      if (d.acOn) items.push(li("ac-unit", 1));
    }
    if (d.on.plc && d.plcNeed) {
      items.push(li("plc-110", 1));
      items.push(li("di-16", modCount(d.di, 16, d.reserve)));
      items.push(li("do-16", modCount(d.doN, 16, d.reserve)));
      items.push(li("ai-8", modCount(d.ai, 8, d.reserve)));
      items.push(li("ao-4", modCount(d.ao, 4, d.reserve)));
      items.push(li("psu-10", 1));
      items.push(li("term-set", 2));
      if (d.hmiKind === "7") items.push(li("hmi-7", 1));
      if (d.hmiKind === "10") items.push(li("hmi-10", 1));
      items.push(li("barrier-ex", d.barriers));
      items.push(li("conv-sig", d.converters));
    }
    if (segBuild) for (const l of segBuild.lines) items.push(l);

    const main = dedupe(items);

    /* ЗИП: % от количества по ключевым категориям, но не менее 1 шт */
    const zipItems: LineItem[] = [];
    if (d.zipOn && d.zipPct > 0) {
      for (const it of main) {
        const cat = findEq(it.eqId)?.category;
        if (cat && ZIP_CATS.includes(cat)) {
          const q = Math.max(1, Math.round((it.qty * d.zipPct) / 100));
          zipItems.push({ ...it, id: genId("li"), qty: q });
        }
      }
    }

    const eqSum = main.reduce((s, i) => s + i.purchase * i.qty, 0);
    const zipSum = zipItems.reduce((s, i) => s + i.purchase * i.qty, 0);
    return { main, zipItems, eqSum, zipSum };
  }, [d, kitLines, segBuild, sys.brand]);

  const enc = d.cabMode === "catalog" && d.cabId ? findEq(d.cabId) : undefined;
  const cabName = d.cabNeed
    ? d.cabMode === "kit"
      ? d.customDim && d.customName.trim()
        ? `${d.kind} — ${d.customName.trim()}`
        : `${d.kind} — ${kitLabel(kitInput)}`
      : enc
        ? `${d.kind} — ${enc.name}`
        : d.cabMode === "manual" && d.manualName.trim()
          ? `${d.kind} — ${d.manualName.trim()}`
          : `${d.kind} №${project.cabinets.length + 1}`
    : `${d.kind} (корпус заказчика)`;

  /* ---------- элементы на дверце (интерактивный макет) ----------
     Ключи стабильны, поэтому заданные вручную позиции (doorPos) и подписи
     (doorLabels) сохраняются при изменении количества. */
  const doorItems = useMemo(() => {
    const els: DoorItem[] = [];
    if (d.on.controls) {
      if (d.on.avr && d.avrInd) {
        els.push({ key: "avr-0", kind: "lamp", label: "Сеть 1", color: "#1f8a5b" });
        els.push({ key: "avr-1", kind: "lamp", label: "Сеть 2", color: "#a8770e" });
        els.push({ key: "avr-2", kind: "lamp", label: "Авария", color: "#ce4432" });
      }
      for (let i = 0; i < d.lamps; i++) els.push({ key: `lamp-${i}`, kind: "lamp", label: `Лампа ${i + 1}`, color: "#6f7b8b" });
      for (let i = 0; i < d.switches; i++) els.push({ key: `sel-${i}`, kind: "sel", label: "Режим" });
      for (let i = 0; i < d.lineBtns; i++) els.push({ key: `pair-${i}`, kind: "pair", label: `Л${i + 1} Пуск/Стоп` });
      for (let i = 0; i < d.buttons; i++) els.push({ key: `btn-${i}`, kind: "btn", label: `Кнопка ${i + 1}` });
      for (let i = 0; i < d.btnStop; i++) els.push({ key: `stop-${i}`, kind: "stop", label: "Авар. стоп" });
    }
    return els;
  }, [d.on.controls, d.on.avr, d.avrInd, d.lamps, d.switches, d.lineBtns, d.buttons, d.btnStop]);
  const doorsCount = d.cabNeed && d.cabMode === "kit" && !d.customDim && sys.mount === "floor" ? Math.max(1, Math.min(sys.maxDoors, d.kitDoors)) : 1;

  const apply = () => {
    const { main, zipItems } = bundle;
    if (main.length === 0 && zipItems.length === 0) {
      toast("Мастер ничего не добавит — включите хотя бы один шаг", "err");
      return;
    }
    /* нестандартный корпус добавляем в справочник, чтобы позиция была переиспользуемой */
    if (d.cabNeed && d.cabMode === "kit" && d.customDim && d.customName.trim()) {
      upsertEquipment({
        id: genId("eq"), sku: "РУЧНОЙ-ВВОД", name: d.customName.trim(), brand: "—",
        category: "Корпуса и щиты", direction: project.direction, unit: "шт",
        purchase: Math.max(1, d.customPrice),
        attrs: "нестандартный габарит, добавлен из мастера подбора",
      });
    }
    if (d.cabNeed && d.cabMode === "manual" && d.manualName.trim()) {
      upsertEquipment({
        id: genId("eq"), sku: "РУЧНОЙ-ВВОД", name: d.manualName.trim(), brand: "—",
        category: "Корпуса и щиты", direction: project.direction, unit: "шт",
        purchase: Math.max(1, d.manualPrice),
        attrs: "добавлено вручную из мастера подбора",
      });
    }
    const cabs: Cabinet[] = [
      {
        id: genId("cab"), kind: d.kind, name: cabName,
        items: main,
        hours: d.hours + (segBuild?.hours ?? 0),
        designHours: d.designHours, softwareHours: d.softwareHours,
        ...(d.segOn ? { segments: segSegments, form: segForm } : {}),
      },
    ];
    if (zipItems.length > 0) {
      cabs.push({ id: genId("cab"), kind: "ЗИП", name: "ЗИП — запасные части и принадлежности", items: zipItems, hours: 0, designHours: 0, softwareHours: 0 });
    }
    addCabinetsBulk(project.id, cabs);
    updateProject(project.id, {
      showWorkLines: d.separateLine,
      transportPct: d.transportOn ? d.transportPct : 0,
    });
    toast(`Добавлено: ${cabs.length} ${cabs.length === 1 ? "шкаф" : "шкафа"}, ${main.length + zipItems.length} позиций`);
    onClose();
  };

  const go = (n: number) => setStep(Math.max(0, Math.min(STEP_IDS.length - 1, n)));

  return (
    <div className="anim-backdrop fixed inset-0 z-50 flex bg-dark/60 p-4 backdrop-blur-sm lg:p-8">
      <div className="anim-scale mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl">
        {/* -------- заголовок мастера -------- */}
        <div className="flex items-center gap-3 bg-dark px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <IcWand size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[14px] font-bold text-white">Мастер подбора шкафа</div>
            <div className="truncate text-[11px] text-darkmute">
              {project.number} · «{project.title}» · <span className="uppercase">{DIRECTIONS[project.direction].label}</span>
            </div>
          </div>
          <span className="hidden font-mono text-[11.5px] font-bold text-darkmute sm:block">
            {bundle.main.length + bundle.zipItems.length} поз · {fmtMoney(bundle.eqSum + bundle.zipSum)}
          </span>
          <button onClick={onClose} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-darkmute transition-colors hover:bg-dark2 hover:text-white">
            <IcX size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* -------- рельса шагов -------- */}
          <div className="hidden w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-card p-3 md:flex">
            {STEP_META.map((s, i) => {
              const off = !["cab", "work", "zip", "summary", "breakers"].includes(s.id) && !d.on[s.id];
              const cur = i === step;
              return (
                <button
                  key={s.id}
                  onClick={() => go(i)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-all duration-150",
                    cur ? "bg-accent text-white shadow-md shadow-accent/25" : off ? "opacity-45 hover:opacity-70" : "text-ink2 hover:bg-paper"
                  )}
                >
                  <span className={cx(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold",
                    cur ? "bg-white/20 text-white" : off ? "bg-line text-mute line-through" : "bg-dark text-white"
                  )}>
                    {off ? "–" : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cx("block text-[12px] leading-tight font-bold", off && "line-through")}>{s.title}</span>
                    <span className={cx("block text-[9.5px] leading-tight", cur ? "text-white/70" : "text-mute")}>{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* -------- контент шага -------- */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-line bg-card px-5 py-3">
              <div>
                <span className="mr-2 rounded bg-dark px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">ШАГ {step + 1}/{STEP_IDS.length}</span>
                <span className="text-[14.5px] font-bold text-ink">{meta.title}</span>
              </div>
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${((step + 1) / STEP_IDS.length) * 100}%` }} />
              </div>
            </div>

            <div key={meta.id} className="anim-step min-h-0 flex-1 overflow-y-auto p-5">
              {meta.id === "cab" && (
                <StepCab
                  d={d} set={set} pool={pool} exact={exact} fallback={fallback} ipOf={ipOf} project={project}
                  mountSystems={mountSystems} switchMount={switchMount} kitLines={kitLines} near={near}
                />
              )}
              {meta.id === "avr" && (
                <StepShell on={d.on.avr} setOn={(v) => setOn("avr", v)} hint="АВР не добавляется — один ввод">
                  <div className="grid gap-2 md:grid-cols-3">
                    <ChoiceCard active={d.avrKind === "bavr"} onClick={() => set({ avrKind: "bavr" })} title="На БАВР" text="Блок автоматики с реле контроля фаз + промежуточные реле. Надёжно, без силовой коммутации контакторами" />
                    <ChoiceCard active={d.avrKind === "contactors"} onClick={() => set({ avrKind: "contactors" })} title="На контакторах" text="По контактору на ввод с механической блокировкой + реле. Классическая силовая схема" />
                    <ChoiceCard active={d.avrKind === "switch"} onClick={() => set({ avrKind: "switch" })} title="Реверсивный рубильник" text="Ручное переключение 1-0-2 с блокировкой — бюджетный вариант без автоматики (только 2 ввода)" />
                  </div>

                  <div className="mt-4">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Число вводов</div>
                    <div className="mt-1.5 grid max-w-2xl gap-2 md:grid-cols-3">
                      <ChoiceCard active={d.avrInputs === 2} onClick={() => set({ avrInputs: 2 })} title="2 ввода" text="Основной + резервный" />
                      <ChoiceCard active={d.avrInputs === 3} onClick={() => set({ avrInputs: 3 })} title="3 ввода" text="Каскад из двух блоков АВР" />
                      <ChoiceCard active={d.avrInputs === 5} onClick={() => set({ avrInputs: 5 })} title="5 вводов" text="Два АВР, объединённые между собой" />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Линии</div>
                    <div className="mt-1.5 grid max-w-md gap-2 md:grid-cols-2">
                      <ChoiceCard active={d.avrPhase === "3ph"} onClick={() => set({ avrPhase: "3ph" })} title="Трёхфазные" text="400 В, контроль чередования фаз" />
                      <ChoiceCard active={d.avrPhase === "1ph"} onClick={() => set({ avrPhase: "1ph" })} title="Однофазные" text="230 В — на шаге «Ввод и линии» подставим 1P/2P аппараты и однофазный счётчик" />
                    </div>
                  </div>

                  {d.avrKind === "switch" && d.avrInputs !== 2 && (
                    <div className="anim-scale mt-3 flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3">
                      <span className="mt-0.5 text-warn"><IcAlert size={16} /></span>
                      <div className="text-[12px] leading-relaxed text-ink2">
                        Реверсивный рубильник — только схема 1-0-2. Для {d.avrInputs} вводов выберите БАВР или контакторы.
                      </div>
                    </div>
                  )}

                  <div className="mt-4 max-w-xs">
                    <Field label="Линии управления (промежуточные реле), шт">
                      <NumInput value={d.ctrlLines} step={1} onChange={(v) => set({ ctrlLines: Math.max(0, Math.round(v)) })} />
                    </Field>
                  </div>

                  <div className="anim-scale mt-4 max-w-2xl rounded-lg border border-line bg-card p-3">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Состав АВР</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {d.avrKind === "bavr" && (
                        <>
                          <ConfChip label={`БАВР-2В ×${d.avrInputs === 2 ? 1 : 2}`} />
                          {d.avrInputs === 5 && <ConfChip label="Блокировка ×1" />}
                          <ConfChip label={`Реле ×${(d.avrInputs === 2 ? 1 : 2) * 2}`} />
                        </>
                      )}
                      {d.avrKind === "contactors" && (
                        <>
                          <ConfChip label={`Контактор 25А ×${d.avrInputs}`} />
                          <ConfChip label={`Блокировка ×${Math.max(1, d.avrInputs - 1)}`} />
                          <ConfChip label={`Реле ×${d.avrInputs}`} />
                        </>
                      )}
                      {d.avrKind === "switch" && <ConfChip label="РП-2-100 ×1" />}
                      {d.ctrlLines > 0 && <ConfChip label={`Реле управления ×${d.ctrlLines}`} />}
                    </div>
                  </div>
                </StepShell>
              )}
              {meta.id === "breakers" && (
                <StepShell on={d.on.breakers} setOn={(v) => setOn("breakers", v)} hint="Автоматы, УЗО и учёт не добавляются">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Вводной автомат" hint={d.avrPhase === "1ph" ? "Для однофазных линий — 1P/2P аппараты" : undefined}>
                      <Select
                        value={d.mainId}
                        onChange={(v) => set({ mainId: v })}
                        options={(d.avrPhase === "1ph" ? ["brk-c25", "brk-2p32", "brk-iek16"] : ["brk-iek80", "brk-nsx100", "brk-nsx250"]).map(idToOpt)}
                      />
                    </Field>
                    <Field label="УЗО (кол-во)">
                      <NumInput value={d.rcd} step={1} onChange={(v) => set({ rcd: Math.max(0, Math.round(v)) })} />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Отх. 1P/2P, шт">
                        <NumInput value={d.out1p} step={1} onChange={(v) => set({ out1p: Math.max(0, Math.round(v)) })} />
                      </Field>
                      <Field label="Номинал">
                        <Select value={d.out1pId} onChange={(v) => set({ out1pId: v })} options={["brk-c16", "brk-c25", "brk-2p32"].map(idToOpt)} />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Отх. 3P, шт">
                        <NumInput value={d.out3p} step={1} onChange={(v) => set({ out3p: Math.max(0, Math.round(v)) })} />
                      </Field>
                      <Field label="Номинал">
                        <Select value={d.out3pId} onChange={(v) => set({ out3pId: v })} options={["brk-3p40", "brk-3p63", "brk-nsx100"].map(idToOpt)} />
                      </Field>
                    </div>
                  </div>
                  <div className="mt-4">
                    <Toggle on={d.meter} onChange={(v) => set({ meter: v })} label={d.avrPhase === "1ph" ? "Учёт электроэнергии (счётчик 1-ф)" : "Учёт электроэнергии (счётчик 3-ф + 3 трансформатора тока + мультиметр)"} />
                  </div>

                  {/* заземление */}
                  <div className="mt-5 border-t border-line pt-4">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Система заземления</div>
                    <div className="mt-2 grid max-w-3xl grid-cols-2 gap-2 md:grid-cols-4">
                      {([
                        { v: "tn-s", t: "TN-S", x: "PE и N разделены" },
                        { v: "tn-c-s", t: "TN-C-S", x: "PEN разделяется на вводе" },
                        { v: "tt", t: "TT", x: "локальное заземление" },
                        { v: "it", t: "IT", x: "изолированная нейтраль" },
                      ] as const).map((g) => (
                        <ChoiceCard key={g.v} active={d.ground === g.v} onClick={() => set({ ground: g.v })} title={g.t} text={g.x} />
                      ))}
                    </div>
                    <div className="mt-3 grid max-w-xl gap-3 md:grid-cols-2">
                      <Field label="Шин заземления PE, шт" hint="Главная PE + дополнительные (по отсекам, по требованиям заказчика)">
                        <NumInput value={d.peBuses} step={1} onChange={(v) => set({ peBuses: Math.max(1, Math.round(v)) })} />
                      </Field>
                      {d.ground === "it" && (
                        <div className="pt-1">
                          <Toggle on={d.itMonitor} onChange={(v) => set({ itMonitor: v })} label="Устройство контроля изоляции (обязательно для IT)" />
                        </div>
                      )}
                    </div>
                    {d.ground === "it" && (
                      <p className="mt-2 max-w-2xl rounded-md bg-steel-soft px-3 py-2 text-[11.5px] leading-relaxed text-steel">
                        Система IT: первый замыкатель на землю не отключает питание — обязателен контроль изоляции (добавим устройство контроля) и сигнализация. Рекомендуется для непрерывных процессов.
                      </p>
                    )}
                  </div>
                </StepShell>
              )}
              {meta.id === "uzp" && (
                <StepShell on={d.on.uzp} setOn={(v) => setOn("uzp", v)} hint="УЗИП не добавляются">
                  <div className="grid gap-2 md:grid-cols-2">
                    <ChoiceCard active={d.uzpKind === "t2"} onClick={() => set({ uzpKind: "t2" })} title="УЗИП тип 2 (класс II)" text="Защита от коммутационных перенапряжений. Рекомендуется для большинства объектов с кабельным вводом" />
                    <ChoiceCard active={d.uzpKind === "t12"} onClick={() => set({ uzpKind: "t12" })} title="УЗИП тип 1+2 (класс I+II)" text="Включая защиту от прямого грозового воздействия — для воздушных вводов и молниезащищённых зданий" />
                  </div>
                  <p className="mt-3 rounded-md bg-steel-soft px-3 py-2 text-[12px] text-steel">
                    Подбор по СП 256.1325800: при воздушном вводе — тип 1+2 на вводе, при кабельном — достаточно типа 2.
                  </p>

                  <div className="mt-5 border-t border-line pt-4">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">УЗИП для слаботочных линий и каналов ПЛК</div>
                    <div className="mt-2 grid max-w-2xl grid-cols-3 gap-3">
                      <Field label="Линии RS-485, шт">
                        <NumInput value={d.uzpRs} step={1} onChange={(v) => set({ uzpRs: Math.max(0, Math.round(v)) })} />
                      </Field>
                      <Field label="Линии Ethernet, шт">
                        <NumInput value={d.uzpEth} step={1} onChange={(v) => set({ uzpEth: Math.max(0, Math.round(v)) })} />
                      </Field>
                      <Field label="Каналы ПЛК (24 В DC), шт">
                        <NumInput value={d.uzpIo} step={1} onChange={(v) => set({ uzpIo: Math.max(0, Math.round(v)) })} />
                      </Field>
                    </div>
                    <p className="mt-2 max-w-2xl text-[11.5px] leading-relaxed text-mute">
                      Импульсы приходят и по интерфейсам: RS-485 и Ethernet защищаются сигнальными УЗИП, дискретные/аналоговые каналы ПЛК — ограничителями 24 В DC (по числу каналов, подверженных наводкам).
                    </p>
                  </div>
                </StepShell>
              )}
              {meta.id === "controls" && (
                <StepShell on={d.on.controls} setOn={(v) => setOn("controls", v)} hint="Органы управления не добавляются">
                  {/* вопросы — выровненные строки в две колонки */}
                  <div className="grid max-w-3xl grid-cols-1 gap-x-10 gap-y-1 md:grid-cols-2">
                    <CountRow label="Кнопки, шт" value={d.buttons} onChange={(v) => set({ buttons: Math.max(0, Math.round(v)) })} />
                    <CountRow label="«Аварийный стоп», шт" value={d.btnStop} onChange={(v) => set({ btnStop: Math.max(0, Math.round(v)) })} />
                    <CountRow label="Лампы индикации, шт" value={d.lamps} onChange={(v) => set({ lamps: Math.max(0, Math.round(v)) })} />
                    <CountRow label="Переключатели 1-0-2, шт" value={d.switches} onChange={(v) => set({ switches: Math.max(0, Math.round(v)) })} />
                    <CountRow label="Пары «Пуск / Стоп» на линии, шт" value={d.lineBtns} onChange={(v) => set({ lineBtns: Math.max(0, Math.round(v)) })} hint="по паре на двигатель / линию (шкафы управления, АСУ ТП)" />
                    <div className="flex items-center py-1.5">
                      <Toggle
                        on={d.avrInd && d.on.avr}
                        onChange={(v) => set({ avrInd: v })}
                        label={d.on.avr ? "Индикация АВР: «Сеть 1 / Сеть 2 / Авария»" : "Индикация АВР (нужен шаг «АВР»)"}
                      />
                    </div>
                  </div>

                  {/* интерактивная дверца — во всю ширину, под вопросами */}
                  <DoorDesigner
                    items={doorItems}
                    doors={doorsCount}
                    positions={d.doorPos}
                    labels={d.doorLabels}
                    labelSide={d.doorLabelSide}
                    onMove={(key, xy) => set({ doorPos: { ...d.doorPos, [key]: xy } })}
                    onLabel={(key, text) => set({ doorLabels: { ...d.doorLabels, [key]: text } })}
                    onLabelSide={(side) => set({ doorLabelSide: side })}
                    onReset={() => set({ doorPos: {} })}
                  />
                </StepShell>
              )}
              {meta.id === "meters" && (
                <StepShell on={d.on.meters} setOn={(v) => setOn("meters", v)} hint="Измерительные приборы не добавляются">
                  <div className="max-w-2xl">
                    {/* ---- вводные средства измерения ---- */}
                    <div className="mb-1.5 text-[11px] font-bold tracking-wide text-mute uppercase">Вводные средства измерения</div>
                    <SelectRow
                      label="Измеритель параметров сети на вводе (Wiren Board WB-MAP), тип"
                      hint="U/I/P/E по фазам, cos φ, гармоника — передача по RS-485 Modbus RTU"
                      value={d.netInKind}
                      onChange={(v) => set({ netInKind: v as Draft["netInKind"] })}
                      options={[
                        { value: "map3e", label: "WB-MAP3E — трёхфазный" },
                        { value: "map12h", label: "WB-MAP12H — однофазный" },
                      ]}
                    />
                    <CountRow label="Измерителей параметров сети WB-MAP на вводе, шт" value={d.netIn} onChange={(v) => set({ netIn: Math.max(0, Math.round(v)) })} />
                    <CountRow label="Амперметры на вводе, шт" value={d.ammIn} onChange={(v) => set({ ammIn: Math.max(0, Math.round(v)) })} />
                    <CountRow label="Вольтметры на вводе, шт" value={d.voltIn} onChange={(v) => set({ voltIn: Math.max(0, Math.round(v)) })} />

                    {/* ---- средства измерения на отходящих линиях ---- */}
                    <div className="mt-5 mb-1.5 text-[11px] font-bold tracking-wide text-mute uppercase">Средства измерения на отходящих линиях</div>
                    <CountRow
                      label="Каналов с контролем тока, шт"
                      hint="Ответственные потребители: насосы, вентиляция, контуры электрообогрева"
                      value={d.ammOut}
                      onChange={(v) => set({ ammOut: Math.max(0, Math.round(v)) })}
                    />
                    <SelectRow
                      label="Тип амперметра на канал"
                      value={d.ammOutKind}
                      onChange={(v) => set({ ammOutKind: v as Draft["ammOutKind"] })}
                      options={[
                        { value: "din", label: "DIN-рейка (DM-100)" },
                        { value: "panel", label: "Панельный (Э378 100/5, под ТТ)" },
                      ]}
                    />
                    <SelectRow
                      label="Трансформатор тока, тип"
                      hint="Первичный ток подбирается под номинал отходящего аппарата"
                      value={d.ctId}
                      onChange={(v) => set({ ctId: v as Draft["ctId"] })}
                      options={[
                        { value: "ct-63", label: "Т-0666 63/5 А" },
                        { value: "ct-100", label: "Т-0666 100/5 А" },
                        { value: "ct-150", label: "Т-0666 150/5 А" },
                      ]}
                    />
                    <SelectRow
                      label="Фаз на канал (ТТ на канал)"
                      hint="3 — поканально на каждую фазу (трёхфазный), 1 — однофазный"
                      value={String(d.ctPerChannel)}
                      onChange={(v) => set({ ctPerChannel: (Number(v) === 1 ? 1 : 3) as Draft["ctPerChannel"] })}
                      options={[
                        { value: "3", label: "3 — трёхфазный" },
                        { value: "1", label: "1 — однофазный" },
                      ]}
                    />

                    {/* ---- авторасчёт ---- */}
                    {d.ammOut > 0 && (
                      <div className="anim-scale mt-4 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3">
                        <div className="text-[13px] font-bold text-ok">
                          Итого на отходящие: амперметров — {d.ammOut} шт, трансформаторов тока — {d.ammOut * d.ctPerChannel} шт
                        </div>
                        <div className="text-[11.5px] text-ink2">
                          {d.ctPerChannel === 3
                            ? "По одному ТТ на каждую фазу каждого канала (поканальный контроль тока)."
                            : "По одному ТТ на канал (однофазные линии)."}
                        </div>
                      </div>
                    )}

                    <p className="mt-3 text-[12px] leading-relaxed text-mute">
                      Все позиции — из справочника. ТТ на отходящих линиях применяются в основном в системах
                      электрообогрева для поканального измерения тока по каждой фазе.
                    </p>
                  </div>
                </StepShell>
              )}
              {meta.id === "busbars" && (
                <StepShell on={d.on.busbars} setOn={(v) => setOn("busbars", v)} hint="Шинные сборки не добавляются">
                  <Toggle on={d.busNeed} onChange={(v) => set({ busNeed: v })} label="Шинная сборка требуется" />
                  {d.busNeed && (
                    <>
                      <div className="mt-3 grid max-w-lg gap-3 md:grid-cols-2">
                        <Field label="Расчётный ток нагрузки, А" hint="По нему подберём сечение и количество шинодержателей">
                          <NumInput value={d.busCurrent} step={10} onChange={(v) => set({ busCurrent: Math.max(0, v) })} />
                        </Field>
                        <Field label="Секций главных шин" hint="Для секционированных шкафов — секция на отсек + стыки">
                          <NumInput value={d.busSections} step={1} onChange={(v) => set({ busSections: Math.max(1, Math.min(6, Math.round(v))) })} />
                        </Field>
                      </div>
                      {(() => {
                        const sel = busSelection(d.busCurrent);
                        if (!sel) return null;
                        return (
                          <div className="anim-scale mt-3 max-w-xl rounded-lg border border-ok/30 bg-ok-soft px-4 py-3">
                            <div className="text-[13px] font-bold text-ok">
                              {sel.label}{d.busSections > 1 ? ` — ×${d.busSections} секции + стыки (${d.busSections - 1} шт)` : ""}
                            </div>
                            <div className="text-[11.5px] text-ink2">
                              {sel.note}
                              {d.busSections > 1 && " · если шкаф секционирован — секции шин согласуются с отсеками (шаг «Секционирование»)"}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </StepShell>
              )}
              {meta.id === "layout" && (
                d.cabMode === "kit" && d.cabNeed ? (
                  <div className="rounded-md border border-dashed border-line2 bg-card/60 px-4 py-3">
                    <div className="text-[13px] font-bold text-ink2">Компоновка уже учтена в комплекте корпуса</div>
                    <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-mute">
                      {d.customDim
                        ? "Для нестандартного корпуса панели и цоколи уточняются по месту — добавьте их позициями из справочника на вкладке «Конструктор»."
                        : `Шкаф комплектуется как ${d.joined > 1 ? `составной ряд из ${d.joined} корпусов «стена к стене»` : "одиночный корпус"}: боковые панели (${d.joined + 1} шт), ${d.joined > 1 ? `стыковые комплекты (${d.joined - 1} шт), ` : ""}${d.pedestalKit ? `цоколи (${d.joined} шт) и ` : ""}траверсы (${2 * d.joined + d.extraTrav} шт) уже в составе на шаге «Корпус шкафа».`}
                    </p>
                  </div>
                ) : (
                  <StepShell on={d.on.layout} setOn={(v) => setOn("layout", v)} hint="Компоновочные элементы не добавляются">
                    <div className="flex flex-col gap-3">
                      <Toggle on={d.wallRow} onChange={(v) => set({ wallRow: v })} label="Шкафы ставятся «стена к стене» — общие боковые стенки" />
                      {d.wallRow && (
                        <div className="anim-scale max-w-xs">
                          <Field label="Шкафов в ряду" hint={`Боковых панелей: ${Math.max(2, d.rowSize + 1)} (вместо ${d.rowSize * 2} по отдельности)`}>
                            <NumInput value={d.rowSize} step={1} onChange={(v) => set({ rowSize: Math.max(2, Math.round(v)) })} />
                          </Field>
                        </div>
                      )}
                      <Toggle on={d.pedestal} onChange={(v) => set({ pedestal: v })} label="Цоколи для напольных шкафов (100 мм, с фланцами для кабеля)" />
                      {d.pedestal && <p className="text-[12px] text-mute">Добавим {Math.max(1, d.rowSize)} цоколь(я) — по числу напольных корпусов ряда.</p>}
                    </div>
                  </StepShell>
                )
              )}
              {meta.id === "climate" && (
                <StepShell on={d.on.climate} setOn={(v) => setOn("climate", v)} hint="Микроклимат не добавляется">
                  <div className="grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
                    <Field label="Вентиляторы, шт"><NumInput value={d.fans} step={1} onChange={(v) => set({ fans: Math.max(0, Math.round(v)) })} /></Field>
                    <Field label="Решётки с фильтром, шт"><NumInput value={d.grilles} step={1} onChange={(v) => set({ grilles: Math.max(0, Math.round(v)) })} /></Field>
                    <Field label="Обогреватели, шт"><NumInput value={d.heaters} step={1} onChange={(v) => set({ heaters: Math.max(0, Math.round(v)) })} /></Field>
                    <Field label="Термостаты / гигростаты, шт"><NumInput value={d.thermos} step={1} onChange={(v) => set({ thermos: Math.max(0, Math.round(v)) })} /></Field>
                  </div>
                  <div className="mt-4 max-w-3xl">
                    <Toggle on={d.acOn} onChange={(v) => set({ acOn: v })} label="Шкафной кондиционер (для ПЛК/частотников, высокая тепловая нагрузка)" />
                  </div>
                  {d.heaters > 0 && d.thermos === 0 && (
                    <div className="anim-scale mt-3 flex max-w-2xl items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3">
                      <span className="mt-0.5 text-warn"><IcAlert size={16} /></span>
                      <div className="text-[12px] leading-relaxed text-ink2">Обогреватели без термостата будут греть постоянно — добавьте хотя бы один термостат/гигростат.</div>
                    </div>
                  )}
                  <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-mute">
                    Типовая пара: вентилятор + решётка с фильтром (приток снизу, вытяжка сверху). Для уличных шкафов и шкафов АСУ — обогрев с гигростатом против конденсата.
                  </p>
                </StepShell>
              )}
              {meta.id === "plc" && (
                <StepShell on={d.on.plc} setOn={(v) => setOn("plc", v)} hint="Контроллерная часть не добавляется">
                  <Toggle on={d.plcNeed} onChange={(v) => set({ plcNeed: v })} label="В проекте есть ПЛК / модули ввода-вывода" />
                  {d.plcNeed && (
                    <>
                      <div className="mt-3 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-5">
                        <Field label="DI (дискр. входы)"><NumInput value={d.di} step={1} onChange={(v) => set({ di: Math.max(0, Math.round(v)) })} /></Field>
                        <Field label="DO (дискр. вых.)"><NumInput value={d.doN} step={1} onChange={(v) => set({ doN: Math.max(0, Math.round(v)) })} /></Field>
                        <Field label="AI (аналог. вх.)"><NumInput value={d.ai} step={1} onChange={(v) => set({ ai: Math.max(0, Math.round(v)) })} /></Field>
                        <Field label="AO (аналог. вых.)"><NumInput value={d.ao} step={1} onChange={(v) => set({ ao: Math.max(0, Math.round(v)) })} /></Field>
                        <Field label="Резерв, %">
                          <Select value={String(d.reserve)} onChange={(v) => set({ reserve: Number(v) })} options={[{ value: "0", label: "0 %" }, { value: "10", label: "10 %" }, { value: "20", label: "20 %" }, { value: "30", label: "30 %" }]} />
                        </Field>
                      </div>
                      <div className="mt-3 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-3">
                        <Field label="Панель оператора (HMI)">
                          <Select value={d.hmiKind} onChange={(v) => set({ hmiKind: v as Draft["hmiKind"] })} options={[{ value: "none", label: "Не нужна" }, { value: "7", label: "7 дюймов" }, { value: "10", label: "10,1 дюйма" }]} />
                        </Field>
                        <Field label="Барьеры искрозащиты, шт" hint="Для каналов во взрывоопасных зонах (Ex-i)">
                          <NumInput value={d.barriers} step={1} onChange={(v) => set({ barriers: Math.max(0, Math.round(v)) })} />
                        </Field>
                        <Field label="Преобразователи сигналов, шт" hint="Согласование 4-20 мА / 0-10 В / RS-485">
                          <NumInput value={d.converters} step={1} onChange={(v) => set({ converters: Math.max(0, Math.round(v)) })} />
                        </Field>
                      </div>
                      <div className="anim-scale mt-4 max-w-2xl rounded-lg border border-line bg-card p-3">
                        <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Сконфигурировано</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <ConfChip label={`ПЛК110 ×1`} />
                          {modCount(d.di, 16, d.reserve) > 0 && <ConfChip label={`DI16 ×${modCount(d.di, 16, d.reserve)} (${d.di} сигналов)`} />}
                          {modCount(d.doN, 16, d.reserve) > 0 && <ConfChip label={`DO16 ×${modCount(d.doN, 16, d.reserve)} (${d.doN})`} />}
                          {modCount(d.ai, 8, d.reserve) > 0 && <ConfChip label={`AI8 ×${modCount(d.ai, 8, d.reserve)} (${d.ai})`} />}
                          {modCount(d.ao, 4, d.reserve) > 0 && <ConfChip label={`AO4 ×${modCount(d.ao, 4, d.reserve)} (${d.ao})`} />}
                          <ConfChip label="БП 24В 10А ×1" />
                          {d.hmiKind !== "none" && <ConfChip label={`HMI ${d.hmiKind}" ×1`} />}
                          {d.barriers > 0 && <ConfChip label={`Барьер Ex ×${d.barriers}`} />}
                          {d.converters > 0 && <ConfChip label={`Преобр. сигн. ×${d.converters}`} />}
                        </div>
                      </div>
                    </>
                  )}
                </StepShell>
              )}
              {meta.id === "section" && (
                <StepShell on={d.segOn} setOn={(v) => set({ segOn: v })} hint="Шкаф остаётся без внутреннего разделения (форма 1)">
                  <p className="max-w-2xl text-[12px] leading-relaxed text-mute">
                    Опросник по ГОСТ IEC 61439-2 — три вопроса дают форму разделения и готовый набор отсеков.
                    Точная доводка — после добавления, в панели «Секционирование» шкафа.
                  </p>
                  <div className="mt-3 flex flex-col gap-3">
                    <Toggle on={d.segQ1} onChange={(v) => set({ segQ1: v, ...(v ? {} : { segQ2: false }) })} label="1. Отделить главные шины от оборудования?" />
                    {d.segQ1 && (
                      <div className="anim-step">
                        <Toggle on={d.segQ2} onChange={(v) => set({ segQ2: v })} label="2. Отделить функциональные блоки (ввод, отходящие, управление) друг от друга?" />
                      </div>
                    )}
                    {d.segQ1 && d.segQ2 && (
                      <div className="anim-step grid max-w-2xl gap-2 md:grid-cols-2">
                        <ChoiceCard active={d.segQ3 === "3a"} onClick={() => set({ segQ3: "3a" })} title="Форма 3a" text="Клеммы — в отсеке своего блока" />
                        <ChoiceCard active={d.segQ3 === "3b"} onClick={() => set({ segQ3: "3b" })} title="Форма 3b" text="Клеммы — в общем отдельном отсеке" />
                        <ChoiceCard active={d.segQ3 === "4a"} onClick={() => set({ segQ3: "4a" })} title="Форма 4a" text="Присоединения — внутри отсека блока" />
                        <ChoiceCard active={d.segQ3 === "4b"} onClick={() => set({ segQ3: "4b" })} title="Форма 4b" text="Присоединения — в отдельном общем отсеке" />
                      </div>
                    )}
                  </div>

                  <div className="anim-scale mt-4 max-w-2xl rounded-lg border border-line bg-card p-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-[13px] font-bold text-ink">{FORM_META[segForm].label}</div>
                      <div className="font-mono text-[13px] font-bold text-ink">{fmtMoney(segBuild?.lines.reduce((s, l) => s + l.qty * l.purchase, 0) ?? 0)}</div>
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-mute">{FORM_META[segForm].desc}</div>
                    {segPresets.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {segPresets.map((p) => (
                          <span key={p.kind} className="rounded-md bg-steel-soft px-2 py-1 text-[11px] font-bold text-steel">{p.name}</span>
                        ))}
                        {segBuild && segBuild.partitionQty > 0 && (
                          <span className="rounded-md bg-dark px-2 py-1 font-mono text-[11px] font-bold text-white">
                            перегородки ×{segBuild.partitionQty} · +{segBuild.hours} ч сборки
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </StepShell>
              )}
              {meta.id === "work" && (
                <div>
                  <div className="grid max-w-2xl grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Сборка (производство), ч">
                      <NumInput value={d.hours} step={1} onChange={(v) => set({ hours: Math.max(0, v) })} />
                    </Field>
                    <Field label="Проектирование, ч">
                      <NumInput value={d.designHours} step={1} onChange={(v) => set({ designHours: Math.max(0, v) })} />
                    </Field>
                    <Field label="Разработка ППО (ПЛК/HMI/сервер), ч">
                      <NumInput value={d.softwareHours} step={1} onChange={(v) => set({ softwareHours: Math.max(0, v) })} />
                    </Field>
                  </div>
                  <div className="mt-4 max-w-2xl">
                    <Toggle on={d.separateLine} onChange={(v) => set({ separateLine: v })} label="Показывать работы отдельной строкой в документе ТКП" />
                  </div>
                  <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-mute">
                    Стоимость работ = часы × ставки со страницы «Тарифы», в продаже — с наценкой на работы из параметров проекта.
                    {d.cabMode === "kit" && !d.customDim && ` Ориентир сборки комплекта: ${kitAssemblyHours(kitInput)} ч;`}
                    {segBuild && segBuild.hours > 0 && ` секционирование добавит ${segBuild.hours} ч.`}
                  </p>
                </div>
              )}
              {meta.id === "zip" && (
                <div className="max-w-2xl">
                  <Toggle on={d.zipOn} onChange={(v) => set({ zipOn: v })} label="ЗИП для проекта (автоматы, реле, ПЛК, блоки питания…)" />
                  {d.zipOn && (
                    <>
                      <div className="mt-3 max-w-xs">
                        <Field label="Процент ЗИП" hint="Количество = округление(кол-во × %), но не менее 1 шт на позицию">
                          <NumInput value={d.zipPct} step={5} onChange={(v) => set({ zipPct: Math.min(100, Math.max(0, v)) })} />
                        </Field>
                      </div>
                      {bundle.zipItems.length > 0 && (
                        <div className="anim-scale mt-4 rounded-lg border border-line bg-card p-3">
                          <div className="text-[11px] font-bold tracking-wide text-mute uppercase">Состав ЗИП — отдельный раздел в проекте</div>
                          <div className="mt-1.5 flex flex-col gap-1">
                            {bundle.zipItems.map((z) => (
                              <div key={z.id} className="flex justify-between text-[12.5px]">
                                <span className="truncate text-ink2">{z.name}</span>
                                <span className="font-mono font-bold text-ink">{z.qty} {z.unit}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <div className="mt-5 border-t border-line pt-4">
                    <Toggle on={d.transportOn} onChange={(v) => set({ transportOn: v })} label="Доставка до заказчика отдельной строкой" />
                    {d.transportOn && (
                      <div className="anim-scale mt-3 max-w-xs">
                        <Field label="Транспорт, % от стоимости оборудования">
                          <NumInput value={d.transportPct} step={0.5} onChange={(v) => set({ transportPct: Math.max(0, v) })} />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {meta.id === "summary" && (
                <div className="max-w-3xl">
                  <div className="rounded-lg border border-line bg-card p-3">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">
                      {cabName} · сборка {d.hours + (segBuild?.hours ?? 0)} ч · проект {d.designHours} ч · ПО {d.softwareHours} ч
                      {d.segOn && ` · ${FORM_META[segForm].label}`}
                    </div>
                    <div className="mt-2 flex flex-col">
                      {bundle.main.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-1 text-[12.5px] last:border-0">
                          <span className="truncate text-ink2">{it.name}</span>
                          <span className="font-mono font-bold whitespace-nowrap text-ink">{it.qty} {it.unit} · {fmtMoney(it.purchase * it.qty)}</span>
                        </div>
                      ))}
                      {bundle.main.length === 0 && <div className="py-2 text-[12.5px] text-mute">Позиции не выбраны — вернитесь на предыдущие шаги.</div>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <SumChip label="Оборудование" value={fmtMoney(bundle.eqSum)} />
                    <SumChip label={`ЗИП (${bundle.zipItems.length} поз)`} value={fmtMoney(bundle.zipSum)} />
                    <SumChip label="Работы" value={`${d.hours + d.designHours + d.softwareHours + (segBuild?.hours ?? 0)} ч`} />
                    <SumChip label="Доставка" value={d.transportOn ? `${d.transportPct} %` : "нет"} />
                  </div>
                </div>
              )}
            </div>

            {/* -------- навигация -------- */}
            <div className="flex items-center justify-between gap-3 border-t border-line bg-card px-5 py-3">
              <Btn variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0}>
                <IcArrowLeft size={14} /> Назад
              </Btn>
              {step < STEP_IDS.length - 1 ? (
                <Btn size="sm" onClick={() => go(step + 1)}>
                  Далее <IcChevronRight size={14} />
                </Btn>
              ) : (
                <Btn size="sm" onClick={apply}>
                  <IcCheck size={14} /> Добавить в проект
                </Btn>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= вспомогательные элементы шагов ================= */

function StepShell({ on, setOn, hint, children }: { on: boolean; setOn: (v: boolean) => void; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <Toggle on={on} onChange={setOn} label={on ? "Этап нужен" : "Этап не нужен"} />
      {on ? (
        <div className="anim-step mt-4">{children}</div>
      ) : (
        <div className="anim-step mt-4 rounded-md border border-dashed border-line2 bg-card/60 px-4 py-3 text-[12.5px] text-mute">{hint} — переходим к следующему этапу.</div>
      )}
    </div>
  );
}

function StepCab({
  d, set, pool, exact, fallback, ipOf, project, mountSystems, switchMount, kitLines, near,
}: {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  pool: Equipment[];
  exact: Equipment[];
  fallback: Equipment[];
  ipOf: (e: Equipment) => number;
  project: Project;
  mountSystems: typeof KIT_SYSTEMS;
  switchMount: (m: "floor" | "wall") => void;
  kitLines: ReturnType<typeof buildKit>;
  near: { h: number; w: number; d: number };
}) {
  const sys = findKitSystem(d.kitSystem);
  const previewGroups = (["frame", "skin", "mount", "door", "base", "joint"] as const)
    .map((g) => ({ g, lines: kitLines.filter((l) => l.group === g) }))
    .filter((x) => x.lines.length > 0);

  return (
    <div>
      <Toggle on={d.cabNeed} onChange={(v) => set({ cabNeed: v })} label="Корпус шкафа комплектуем мы" />
      {!d.cabNeed && (
        <div className="anim-step mt-3 rounded-md bg-steel-soft px-4 py-3 text-[12.5px] text-steel">
          Поняли — корпус в состав не включаем (например, поставляется заказчиком). Переходите к следующему шагу.
        </div>
      )}
      {d.cabNeed && (
        <div className="anim-step mt-4">
          {/* способ подбора корпуса */}
          <div className="grid gap-2 md:grid-cols-3">
            <ChoiceCard active={d.cabMode === "kit"} onClick={() => set({ cabMode: "kit", manualOn: false })} title="Составной комплект" text="Конфигуратор: тип → система → габариты → составной ряд, двери, траверсы, цоколи" />
            <ChoiceCard active={d.cabMode === "catalog"} onClick={() => set({ cabMode: "catalog", manualOn: false })} title="Готовый корпус" text="Целиком из справочника — одна позиция в составе шкафа" />
            <ChoiceCard active={d.cabMode === "manual"} onClick={() => set({ cabMode: "manual", manualOn: true, cabId: null })} title="Ручной ввод" text="Нестандартный корпус — внесём в справочник для переиспользования" />
          </div>

          <div className="mt-4 max-w-xs">
            <Field label="Тип шкафа в структуре">
              <Select value={d.kind} onChange={(v) => set({ kind: v })} options={CABINET_KINDS[project.direction].map((k) => ({ value: k, label: k }))} />
            </Field>
          </div>

          {/* -------- режим: составной комплект (конфигуратор) -------- */}
          {d.cabMode === "kit" && (
            <div className="anim-step mt-4">
              {/* 1) тип шкафа */}
              <div className="text-[11px] font-bold tracking-wide text-mute uppercase">1 · Тип шкафа</div>
              <div className="mt-1.5 grid max-w-md gap-2 md:grid-cols-2">
                <ChoiceCard active={d.cabMountKit === "floor"} onClick={() => switchMount("floor")} title="Напольный" text="Каркасный: стойки, крыша, основание, панели, цоколи" />
                <ChoiceCard active={d.cabMountKit === "wall"} onClick={() => switchMount("wall")} title="Навесной" text="Корпус с задней стенкой, монтаж на стену" />
              </div>

              {/* 2) система */}
              <div className="mt-4 text-[11px] font-bold tracking-wide text-mute uppercase">2 · Система корпусов</div>
              <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                {mountSystems.map((s) => (
                  <ChoiceCard
                    key={s.id}
                    active={d.kitSystem === s.id}
                    onClick={() => set({ kitSystem: s.id, kitH: s.heights[Math.floor(s.heights.length / 2)], kitW: s.widths[0], kitD: s.depths[0], kitDoors: 1, customDim: false })}
                    title={`${s.name} · ${s.brand} · IP${s.ip}`}
                    text={s.note}
                  />
                ))}
              </div>

              {/* 3) габариты */}
              <div className="mt-4 text-[11px] font-bold tracking-wide text-mute uppercase">3 · Габариты и наполнение корпуса</div>
              <div className="mt-1.5 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-5">
                <Field label="Высота, мм">
                  <Select value={String(d.kitH)} onChange={(v) => set({ kitH: Number(v) })} options={sys.heights.map((h) => ({ value: String(h), label: String(h) }))} />
                </Field>
                <Field label="Ширина, мм">
                  <Select value={String(d.kitW)} onChange={(v) => set({ kitW: Number(v) })} options={sys.widths.map((w) => ({ value: String(w), label: String(w) }))} />
                </Field>
                <Field label="Глубина, мм">
                  <Select value={String(d.kitD)} onChange={(v) => set({ kitD: Number(v) })} options={sys.depths.map((x) => ({ value: String(x), label: String(x) }))} />
                </Field>
                {sys.mount === "floor" && (
                  <Field label="Дверей на корпус">
                    <Select value={String(d.kitDoors)} onChange={(v) => set({ kitDoors: Number(v) })} options={Array.from({ length: sys.maxDoors }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
                  </Field>
                )}
                {sys.mount === "floor" && (
                  <Field label="Корпусов в шкафу" hint="2 и более — составной шкаф «стена к стене»">
                    <NumInput value={d.joined} step={1} onChange={(v) => set({ joined: Math.max(1, Math.min(6, Math.round(v))) })} />
                  </Field>
                )}
              </div>
              <div className="mt-2 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-5">
                <Field label="Доп. траверсы, шт" hint="Сверх базовых двух (верх/низ) на корпус">
                  <NumInput value={d.extraTrav} step={1} onChange={(v) => set({ extraTrav: Math.max(0, Math.min(20, Math.round(v))) })} />
                </Field>
                {sys.mount === "floor" && (
                  <div className="pt-5">
                    <Toggle on={d.pedestalKit} onChange={(v) => set({ pedestalKit: v })} label="Цоколи (100 мм, фланцы)" />
                  </div>
                )}
              </div>
              {d.joined > 1 && (
                <p className="mt-2 max-w-2xl rounded-md bg-steel-soft px-3 py-2 text-[11.5px] leading-relaxed text-steel">
                  Составной шкаф: панели — {d.joined + 1} шт (вместо {d.joined * 2}), стыковые комплекты — {d.joined - 1}, цоколи{d.pedestalKit ? ` — ${d.joined}` : " не заданы"}. Шаг «Компоновка» для такого шкафа отключается — всё уже в комплекте.
                </p>
              )}

              {/* нестандартный габарит */}
              <div className={cx("mt-4 max-w-3xl rounded-lg border p-3", d.customDim ? "border-accent bg-accent-soft/40" : "border-dashed border-line2")}>
                <Toggle on={d.customDim} onChange={(v) => set({ customDim: v })} label="Нужного типоразмера нет — нестандартный корпус" />
                {d.customDim && (
                  <div className="anim-step mt-3">
                    <div className="rounded-md bg-warn-soft px-3 py-2 text-[12px] text-ink2">
                      Такого габарита в линейке <b>{sys.name}</b> нет. Ближайший типовой:{" "}
                      <button
                        type="button"
                        className="cursor-pointer font-mono font-bold text-accent-deep underline decoration-accent/40 underline-offset-2"
                        onClick={() => set({ kitH: near.h, kitW: near.w, kitD: near.d, customDim: false })}
                      >
                        {near.h}×{near.w}×{near.d} — использовать
                      </button>
                      {" "}— или заполните данные вручную (позиция попадёт в справочник и БД).
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                      <Field label="Наименование корпуса">
                        <Input value={d.customName} onChange={(v) => set({ customName: v })} placeholder={`Шкаф ${sys.name} 2400×1000×800, спец. исполнение`} />
                      </Field>
                      <Field label="Закупочная цена, ₽">
                        <NumInput value={d.customPrice} step={500} onChange={(v) => set({ customPrice: Math.max(0, v) })} />
                      </Field>
                    </div>
                  </div>
                )}
              </div>

              {/* живой состав комплекта */}
              {!d.customDim && (
                <div className="anim-scale mt-4 max-w-3xl rounded-lg border border-line bg-card p-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">
                      Комплект {kitLabel({ systemId: d.kitSystem, h: d.kitH, w: d.kitW, d: d.kitD, doors: d.kitDoors, joined: d.joined, pedestal: d.pedestalKit, extraTraverses: d.extraTrav })}
                    </div>
                    <div className="font-mono text-[15px] font-bold text-ink">{fmtMoney(kitTotal(kitLines))}</div>
                  </div>
                  <div className="mt-2 grid gap-x-6 gap-y-1.5 md:grid-cols-2">
                    {previewGroups.map(({ g, lines }) => (
                      <div key={g}>
                        <div className="mb-0.5 text-[10px] font-bold tracking-wide text-mute uppercase">{KIT_GROUP_LABEL[g]}</div>
                        {lines.map((l) => (
                          <div key={l.key} className="flex items-baseline justify-between gap-2 border-b border-line/50 py-0.5 text-[12px] last:border-0">
                            <span className="truncate text-ink2">{l.name}</span>
                            <span className="font-mono font-bold whitespace-nowrap text-ink">
                              {l.qty} шт · {fmtMoney(l.purchase * l.qty)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-mute">
                    Сборка комплекта ≈ <b className="text-ink2">{kitAssemblyHours({ systemId: d.kitSystem, h: d.kitH, w: d.kitW, d: d.kitD, doors: d.kitDoors, joined: d.joined, pedestal: d.pedestalKit, extraTraverses: d.extraTrav })} ч</b> — ориентир для шага «Работы».
                  </p>
                </div>
              )}
            </div>
          )}

          {/* -------- режим: готовый корпус из справочника -------- */}
          {d.cabMode === "catalog" && (
            <>
              <div className="mt-4 grid max-w-xl gap-3 md:grid-cols-2">
                <Field label="Тип установки">
                  <Select value={d.cabMount} onChange={(v) => set({ cabMount: v as Draft["cabMount"] })} options={[{ value: "any", label: "Любой" }, { value: "floor", label: "Напольный" }, { value: "wall", label: "Навесной (на стену)" }]} />
                </Field>
                <Field label="Степень защиты IP">
                  <Select value={d.cabIp} onChange={(v) => set({ cabIp: v as Draft["cabIp"] })} options={["any", "31", "54", "65", "66", "67"].map((x) => ({ value: x, label: x === "any" ? "Любая" : `IP${x}` }))} />
                </Field>
              </div>

              {exact.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {exact.map((e) => (
                    <EncCard key={e.id} e={e} active={d.cabId === e.id} ip={ipOf(e)} onClick={() => set({ cabId: e.id })} />
                  ))}
                </div>
              )}

              {exact.length === 0 && fallback.length > 0 && (
                <div className="anim-scale mt-4">
                  <div className="flex items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3">
                    <span className="mt-0.5 text-warn"><IcAlert size={17} /></span>
                    <div className="text-[12.5px] leading-relaxed text-ink2">
                      <b>Корпусов с IP{d.cabIp} в справочнике нет.</b> Ближайший доступный класс —{" "}
                      <b>IP{ipOf(fallback[0])}</b>. Выберите из предложенных менее подходящих или введите корпус вручную.
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {fallback.map((e) => (
                      <EncCard key={e.id} e={e} active={d.cabId === e.id} ip={ipOf(e)} note={`вместо IP${d.cabIp}`} onClick={() => set({ cabId: e.id })} />
                    ))}
                  </div>
                </div>
              )}

              {exact.length === 0 && fallback.length === 0 && (
                <div className="mt-4 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[12.5px] text-ink2">
                  Подходящих корпусов не нашлось — переключитесь на ручной ввод или составной комплект.
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-mute">В подборе {pool.length} корпус(ов) по типу установки из справочника.</p>
            </>
          )}

          {/* -------- режим: ручной ввод -------- */}
          {d.cabMode === "manual" && (
            <div className="anim-step mt-4 max-w-3xl rounded-lg border border-accent bg-accent-soft/40 p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <Field label="Наименование корпуса">
                  <Input value={d.manualName} onChange={(v) => set({ manualName: v })} placeholder="Шкаф напольный 2200×800×600, IP66, нерж." />
                </Field>
                <Field label="Закупочная цена, ₽">
                  <NumInput value={d.manualPrice} step={500} onChange={(v) => set({ manualPrice: Math.max(0, v) })} />
                </Field>
              </div>
              <p className="mt-2 text-[11.5px] text-mute">Позиция попадёт в справочник и будет доступна в следующих проектах.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= интерактивный макет дверцы ================= */

interface DoorItem {
  key: string;
  kind: "lamp" | "btn" | "pair" | "sel" | "stop";
  label: string;
  color?: string;
}

/** Выровненная строка опросника «вопрос — количество» (единая сетка шага). */
function CountRow({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 py-2">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        {hint && <div className="text-[10.5px] leading-snug text-mute">{hint}</div>}
      </div>
      <div className="w-[110px] shrink-0">
        <NumInput value={value} step={1} onChange={onChange} />
      </div>
    </div>
  );
}

/** Выровненная строка опросника «вопрос — выпадающий выбор» (единая сетка шага). */
function SelectRow({ label, value, onChange, options, hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 py-2">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        {hint && <div className="text-[10.5px] leading-snug text-mute">{hint}</div>}
      </div>
      <div className="w-[170px] shrink-0">
        <Select value={value} onChange={onChange} options={options} />
      </div>
    </div>
  );
}

/* Геометрия макета: дверца 230×450, полотно 500 по высоте. */
const DOOR = { w: 230, h: 450, y: 25, gap: 30, x0: 25 };
const CANVAS_H = 500;

function DoorDesigner({ items, doors, positions, labels, labelSide, onMove, onLabel, onLabelSide, onReset }: {
  items: DoorItem[];
  doors: number;
  positions: Record<string, { x: number; y: number }>;
  labels: Record<string, string>;
  labelSide: "below" | "above";
  onMove: (key: string, xy: { x: number; y: number }) => void;
  onLabel: (key: string, text: string) => void;
  onLabelSide: (side: "below" | "above") => void;
  onReset: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ key: string; dx: number; dy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const W = doors === 2 ? DOOR.x0 + 2 * DOOR.w + DOOR.gap + DOOR.x0 : DOOR.x0 + DOOR.w + DOOR.x0;

  /* авто-раскладка: сетка 4 колонки на первой двери */
  const autoPos = (i: number) => ({
    x: DOOR.x0 + 25 + 45 * ((i % 4) + 0.5),
    y: 80 + Math.floor(i / 4) * 52,
  });

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (CANVAS_H / rect.height) };
  };

  const startDrag = (e: ReactPointerEvent<SVGGElement>, key: string, x: number, y: number) => {
    e.stopPropagation();
    setSelected(key);
    const p = toCanvas(e);
    dragRef.current = { key, dx: x - p.x, dy: y - p.y };
    svgRef.current?.setPointerCapture(e.pointerId);
  };
  const onMoveCanvas = (e: ReactPointerEvent<SVGSVGElement>) => {
    const dr = dragRef.current;
    if (!dr) return;
    const p = toCanvas(e);
    onMove(dr.key, {
      x: Math.min(W - 30, Math.max(30, p.x + dr.dx)),
      y: Math.min(CANVAS_H - 25, Math.max(DOOR.y + 20, p.y + dr.dy)),
    });
  };
  const endDrag = () => { dragRef.current = null; };

  const selItem = selected ? items.find((i) => i.key === selected) : undefined;

  return (
    <div className="mt-5 rounded-lg border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-bold tracking-wide text-mute uppercase">
          Компоновка дверцы{doors === 2 ? " · двухдверный шкаф" : ""} — перетаскивайте элементы, клик — подпись
        </div>
        <button type="button" onClick={() => { onReset(); setSelected(null); }}
          className="cursor-pointer rounded-md border border-line px-2 py-1 text-[10.5px] font-bold text-mute transition-colors hover:border-heat hover:text-heat">
          Сбросить раскладку
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1 rounded-lg bg-dark2/40 p-2">
          <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${CANVAS_H}`} style={{ display: "block", maxHeight: 470 }}
            onPointerMove={onMoveCanvas} onPointerUp={endDrag} onPointerLeave={endDrag}
            onPointerDown={() => setSelected(null)}>
            <defs>
              <linearGradient id="doorSteel" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#3d4a59" />
                <stop offset="0.5" stopColor="#4c5a6b" />
                <stop offset="1" stopColor="#37434f" />
              </linearGradient>
            </defs>

            {/* дверцы шкафа */}
            {Array.from({ length: doors }, (_, di) => {
              const ox = DOOR.x0 + di * (DOOR.w + DOOR.gap);
              return (
                <g key={di}>
                  <rect x={ox} y={DOOR.y} width={DOOR.w} height={DOOR.h} rx={9} fill="#222b35" stroke="#141b24" strokeWidth={1.5} />
                  <rect x={ox + 9} y={DOOR.y + 9} width={DOOR.w - 18} height={DOOR.h - 18} rx={6} fill="url(#doorSteel)" stroke="#2c3742" strokeWidth={1} />
                  <rect x={ox - 3} y={DOOR.y + 60} width={7} height={30} rx={2.5} fill="#5b6875" />
                  <rect x={ox - 3} y={DOOR.y + DOOR.h - 90} width={7} height={30} rx={2.5} fill="#5b6875" />
                  <rect x={ox + DOOR.w - 17} y={DOOR.y + DOOR.h / 2 - 32} width={8} height={64} rx={4} fill="#c2cad4" stroke="#8b98a9" strokeWidth={0.8} />
                  {[0, 1, 2, 3].map((k) => (
                    <rect key={k} x={ox + 30 + k * 42} y={DOOR.y + DOOR.h - 26} width={30} height={3} rx={1.5} fill="#2c3742" />
                  ))}
                </g>
              );
            })}

            {/* элементы управления */}
            {items.map((it, i) => {
              const { x, y } = positions[it.key] ?? autoPos(i);
              const isSel = selected === it.key;
              const label = labels[it.key] ?? it.label;
              const labelY = labelSide === "below"
                ? y + (it.kind === "stop" ? 28 : it.kind === "pair" ? 24 : 25)
                : y - (it.kind === "stop" ? 24 : 20);
              return (
                <g key={it.key} style={{ cursor: "grab" }} onPointerDown={(e) => startDrag(e, it.key, x, y)}>
                  {isSel && <rect x={x - 24} y={y - 24} width={48} height={48} rx={10} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={1.2} strokeDasharray="4 3" />}
                  <circle cx={x} cy={y} r={20} fill="transparent" />
                  {it.kind === "lamp" && (
                    <>
                      <circle cx={x} cy={y} r={10} fill={it.color} stroke="#141b24" strokeWidth={1.3} />
                      <circle cx={x - 3.5} cy={y - 3.5} r={3} fill="#fff" opacity={0.35} />
                    </>
                  )}
                  {it.kind === "btn" && <rect x={x - 11} y={y - 11} width={22} height={22} rx={5} fill="#141b24" stroke="#3d4a59" strokeWidth={1.3} />}
                  {it.kind === "sel" && (
                    <>
                      <rect x={x - 12} y={y - 12} width={24} height={24} rx={4} fill="#eceef1" stroke="#141b24" strokeWidth={1.3} />
                      <text x={x} y={y + 3.4} textAnchor="middle" fontSize={8} fontWeight={700} fill="#141b24">I·0·II</text>
                    </>
                  )}
                  {it.kind === "stop" && (
                    <>
                      <rect x={x - 16} y={y - 16} width={32} height={32} rx={5} fill="#f7edd8" stroke="#a8770e" strokeWidth={1.3} />
                      <circle cx={x} cy={y} r={11} fill="#ce4432" stroke="#8f2f22" strokeWidth={1.3} />
                    </>
                  )}
                  {it.kind === "pair" && (
                    <>
                      <circle cx={x - 12} cy={y} r={9} fill="#1f8a5b" stroke="#141b24" strokeWidth={1.2} />
                      <circle cx={x + 12} cy={y} r={9} fill="#ce4432" stroke="#141b24" strokeWidth={1.2} />
                    </>
                  )}
                  <text x={x} y={labelY} textAnchor="middle" fontSize={9} fontWeight={600} fill="#e6ebf2" stroke="#141b24" strokeWidth={2.5} style={{ paintOrder: "stroke" }}>
                    {label.length > 14 ? label.slice(0, 13) + "…" : label}
                  </text>
                </g>
              );
            })}

            {items.length === 0 && (
              <text x={W / 2} y={CANVAS_H / 2} textAnchor="middle" fontSize={11} fill="#8b98a9">
                Задайте количество элементов выше — они появятся на дверце
              </text>
            )}
          </svg>
        </div>

        {/* панель редактирования подписи */}
        <div className="w-full shrink-0 lg:w-60">
          {selItem ? (
            <div className="anim-step rounded-lg border border-line bg-paper p-3">
              <div className="text-[10px] font-bold tracking-wide text-mute uppercase">Подпись элемента</div>
              <input
                value={labels[selItem.key] ?? selItem.label}
                onChange={(e) => onLabel(selItem.key, e.target.value)}
                className="mt-1.5 w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-steel"
              />
              <div className="mt-3 text-[10px] font-bold tracking-wide text-mute uppercase">Расположение подписи</div>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {(["below", "above"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => onLabelSide(s)}
                    className={cx("cursor-pointer rounded-md border px-2 py-1.5 text-[11px] font-bold transition-colors",
                      labelSide === s ? "border-accent bg-accent-soft/60 text-accent-deep" : "border-line bg-card text-mute hover:border-line2")}>
                    {s === "below" ? "Снизу" : "Сверху"}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-snug text-mute">Позиция и подпись сохраняются автоматически и попадут в общий вид.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line2 p-3 text-[11.5px] leading-relaxed text-mute">
              Кликните по элементу на дверце, чтобы переименовать его и выбрать расположение подписи. Перетаскивайте элементы мышью — раскладка сохраняется.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EncCard({ e, active, ip, note, onClick }: { e: Equipment; active: boolean; ip: number; note?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "cursor-pointer rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.99]",
        active ? "border-accent bg-accent-soft/60 shadow-md shadow-accent/10" : "border-line bg-card hover:border-line2 hover:shadow-sm"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cx("flex h-4 w-4 items-center justify-center rounded-full border-2", active ? "border-accent bg-accent text-white" : "border-line2")}>
          {active && <IcCheck size={9} />}
        </span>
        <span className="text-[12.5px] font-bold text-ink">{e.name}</span>
        {ip > 0 && <span className="rounded bg-dark px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">IP{ip}</span>}
        {note && <span className="rounded bg-warn-soft px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-warn">{note}</span>}
      </div>
      <div className="mt-1 pl-6 text-[11px] text-mute">{e.attrs ?? e.brand}</div>
      <div className="mt-1 pl-6 font-mono text-[13px] font-bold text-ink">
        {fmtMoney(e.purchase)} <span className="text-[9px] font-semibold text-mute uppercase">закупка</span>
      </div>
    </button>
  );
}

function ChoiceCard({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "cursor-pointer rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.99]",
        active ? "border-accent bg-accent-soft/60 shadow-md shadow-accent/10" : "border-line bg-card hover:border-line2 hover:shadow-sm"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cx("flex h-4 w-4 items-center justify-center rounded-full border-2", active ? "border-accent bg-accent text-white" : "border-line2")}>
          {active && <IcCheck size={9} />}
        </span>
        <span className="text-[13px] font-bold text-ink">{title}</span>
      </div>
      <div className="mt-1 pl-6 text-[11.5px] leading-snug text-mute">{text}</div>
    </button>
  );
}

function ConfChip({ label }: { label: string }) {
  return <span className="rounded-md bg-dark px-2 py-1 font-mono text-[11px] font-bold text-white">{label}</span>;
}

function SumChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2">
      <div className="text-[10px] font-bold tracking-wide text-mute uppercase">{label}</div>
      <div className="font-mono text-[14px] font-bold text-ink">{value}</div>
    </div>
  );
}

const idToOpt = (id: string) => {
  const e = findEq(id);
  return { value: id, label: e ? `${e.sku} — ${e.name.slice(0, 42)} · ${fmtMoney(e.purchase)}` : id };
};
