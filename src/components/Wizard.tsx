import { useMemo, useState } from "react";
import { useStore } from "../store";
import { findEq } from "../data/catalog";
import type { Cabinet, Equipment, LineItem, Project } from "../types";
import { CABINET_KINDS, DIRECTIONS } from "../types";
import { fmtMoney, genId } from "../utils";
import { Btn, Field, Input, NumInput, Select, Toggle, cx } from "./ui";
import { IcAlert, IcArrowLeft, IcCheck, IcChevronRight, IcWand, IcX } from "./icons";

/* ============================================================
   МАСТЕР ПОДБОРА — пошаговый инженерный опросник.
   Шаги: корпус (с фолбэком по IP и ручным вводом) → вводные и
   отходящие автоматы → АВР (БАВР / контакторы / рубильник) →
   УЗИП → кнопки и индикация → шинные сборки по току →
   компоновка («стена к стене», цоколи) → конфигурация ПЛК
   (сигналы + резерв модулей) → трудозатраты (сборка / проект /
   ППО) → ЗИП (%, но не менее 1 шт) и транспорт. Результат —
   готовые шкафы, добавляемые в структуру проекта одним кликом.
   ============================================================ */

interface Draft {
  kind: string;
  cabNeed: boolean;
  cabId: string | null;
  cabMount: "any" | "floor" | "wall";
  cabIp: "any" | "31" | "54" | "65" | "66" | "67";
  manualOn: boolean;
  manualName: string;
  manualPrice: number;

  on: Record<string, boolean>;

  mainId: string;
  out1p: number; out1pId: string;
  out3p: number; out3pId: string;
  rcd: number;
  meter: boolean;

  avrKind: "none" | "bavr" | "contactors" | "switch";
  ctrlLines: number;

  uzpKind: "none" | "t2" | "t12";

  buttons: number; btnStop: number; lamps: number; switches: number;

  busNeed: boolean; busCurrent: number;

  wallRow: boolean; rowSize: number; pedestal: boolean;

  plcNeed: boolean; di: number; doN: number; ai: number; ao: number; reserve: number;
  hmiKind: "none" | "7" | "10";

  hours: number; designHours: number; softwareHours: number; separateLine: boolean;

  zipOn: boolean; zipPct: number;
  transportOn: boolean; transportPct: number;
}

const STEP_IDS = ["cab", "breakers", "avr", "uzp", "controls", "busbars", "layout", "plc", "work", "zip", "summary"] as const;
type StepId = (typeof STEP_IDS)[number];

const STEP_META: { id: StepId; title: string; desc: string }[] = [
  { id: "cab", title: "Корпус шкафа", desc: "монтаж, IP, габарит" },
  { id: "breakers", title: "Ввод и линии", desc: "автоматы, учёт" },
  { id: "avr", title: "АВР", desc: "резервирование ввода" },
  { id: "uzp", title: "УЗИП", desc: "импульсные перенапряжения" },
  { id: "controls", title: "Кнопки и индикация", desc: "лампы, переключатели" },
  { id: "busbars", title: "Шинные сборки", desc: "подбор по току" },
  { id: "layout", title: "Компоновка", desc: "стенки, цоколи" },
  { id: "plc", title: "ПЛК и модули", desc: "сигналы, резерв" },
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
    cabId: null,
    cabMount: "any",
    cabIp: "any",
    manualOn: false,
    manualName: "",
    manualPrice: 15000,
    on: { breakers: true, avr: true, uzp: true, controls: true, busbars: true, layout: true, plc: project.direction === "asu" },
    mainId: "brk-nsx100",
    out1p: 6, out1pId: "brk-c16",
    out3p: 2, out3pId: "brk-3p40",
    rcd: 0,
    meter: true,
    avrKind: "none",
    ctrlLines: 0,
    uzpKind: "none",
    buttons: 2, btnStop: 1, lamps: 2, switches: 1,
    busNeed: true, busCurrent: 100,
    wallRow: false, rowSize: 2, pedestal: false,
    plcNeed: project.direction === "asu", di: 16, doN: 8, ai: 4, ao: 0, reserve: 20,
    hmiKind: "10",
    hours: 10, designHours: 4, softwareHours: 0, separateLine: true,
    zipOn: true, zipPct: 20,
    transportOn: false, transportPct: 2,
  }));

  const set = (patch: Partial<Draft>) => setD((s) => ({ ...s, ...patch }));
  const setOn = (k: string, v: boolean) => setD((s) => ({ ...s, on: { ...s.on, [k]: v } }));

  const meta = STEP_META[step];

  /* ---------- подбор корпуса ---------- */
  const enclosures = useMemo(() => catalog.filter((e) => e.category === "Корпуса и щиты"), [catalog]);
  const ipOf = (e: Equipment) => Number(/IP\s*(\d+)/i.exec(e.attrs ?? "")?.[1] ?? 0);
  const mountOf = (e: Equipment) => ((e.attrs ?? "").toLowerCase().includes("напольн") ? "floor" : "wall");

  const pool = enclosures.filter((e) => d.cabMount === "any" || mountOf(e) === d.cabMount);
  const exact = d.cabIp === "any" ? pool : pool.filter((e) => ipOf(e) === Number(d.cabIp));
  const fallback =
    exact.length === 0 && d.cabIp !== "any"
      ? pool.filter((e) => ipOf(e) > 0 && ipOf(e) < Number(d.cabIp)).sort((a, b) => ipOf(b) - ipOf(a)).slice(0, 3)
      : [];

  /* ---------- сборка результата ---------- */
  const bundle = useMemo(() => {
    const items: (LineItem | null)[] = [];
    if (d.cabNeed) {
      if (d.cabId) items.push(li(d.cabId, 1));
      else if (d.manualOn && d.manualName.trim()) {
        const purchase = Math.max(1, d.manualPrice); // вводится закупочная цена
        items.push({
          id: genId("li"), eqId: "manual-enclosure", sku: "РУЧНОЙ-ВВОД", name: d.manualName.trim(),
          brand: "—", unit: "шт", qty: 1, purchase,
        });
      }
    }
    if (d.on.breakers) {
      items.push(li(d.mainId, 1));
      items.push(li(d.out1pId, d.out1p));
      items.push(li(d.out3pId, d.out3p));
      items.push(li("rcd-4030", d.rcd));
      if (d.meter) {
        items.push(li("meter-231", 1));
        items.push(li("ct-100", 3));
        items.push(li("amm-din", 1));
      }
    }
    if (d.on.avr) {
      if (d.avrKind === "bavr") { items.push(li("bavr-kit", 1)); items.push(li("rp-24", 2)); }
      if (d.avrKind === "contactors") { items.push(li("km-25", 2)); items.push(li("interlock", 1)); items.push(li("rp-24", 2)); }
      if (d.avrKind === "switch") items.push(li("sw-rev100", 1));
      items.push(li("rp-24", d.ctrlLines));
    }
    if (d.on.uzp) {
      if (d.uzpKind === "t2") items.push(li("uzp-t2", 1));
      if (d.uzpKind === "t12") items.push(li("uzp-t12", 1));
    }
    if (d.on.controls) {
      items.push(li("btn-1", d.buttons));
      items.push(li("btn-e", d.btnStop));
      items.push(li("lamp-3", d.lamps));
      items.push(li("swsel-1", d.switches));
    }
    if (d.on.busbars && d.busNeed) {
      busSelection(d.busCurrent)?.items.forEach((x) => items.push(x));
    }
    if (d.on.layout) {
      if (d.wallRow) items.push(li("panel-side", Math.max(2, d.rowSize + 1)));
      if (d.pedestal) items.push(li("pedestal-600", Math.max(1, d.rowSize)));
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
    }
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
  }, [d]);

  const enc = d.cabId ? findEq(d.cabId) : undefined;
  const cabName = d.cabNeed
    ? enc
      ? `${d.kind} — ${enc.name}`
      : d.manualOn && d.manualName.trim()
        ? `${d.kind} — ${d.manualName.trim()}`
        : `${d.kind} №${project.cabinets.length + 1}`
    : `${d.kind} (корпус заказчика)`;

  const apply = () => {
    const { main, zipItems } = bundle;
    if (main.length === 0 && zipItems.length === 0) {
      toast("Мастер ничего не добавит — включите хотя бы один шаг", "err");
      return;
    }
    /* ручной корпус добавляем в справочник, чтобы позиция была переиспользуемой */
    if (d.cabNeed && !d.cabId && d.manualOn && d.manualName.trim()) {
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
        items: main, hours: d.hours, designHours: d.designHours, softwareHours: d.softwareHours,
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
              const off = !["cab", "work", "zip", "summary"].includes(s.id) && !d.on[s.id];
              const cur = i === step;
              return (
                <button
                  key={s.id}
                  onClick={() => go(i)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
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
              {/* мобильный прогресс */}
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${((step + 1) / STEP_IDS.length) * 100}%` }} />
              </div>
            </div>

            <div key={meta.id} className="anim-step min-h-0 flex-1 overflow-y-auto p-5">
              {meta.id === "cab" && <StepCab d={d} set={set} pool={pool} exact={exact} fallback={fallback} ipOf={ipOf} project={project} />}
              {meta.id === "breakers" && (
                <StepShell on={d.on.breakers} setOn={(v) => setOn("breakers", v)} hint="Автоматы, УЗО и учёт не добавляются">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Вводной автомат">
                      <Select value={d.mainId} onChange={(v) => set({ mainId: v })} options={["brk-iek80", "brk-nsx100", "brk-nsx250"].map(idToOpt)} />
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
                    <Toggle on={d.meter} onChange={(v) => set({ meter: v })} label="Учёт электроэнергии (счётчик 3-ф + 3 трансформатора тока + мультиметр)" />
                  </div>
                </StepShell>
              )}
              {meta.id === "avr" && (
                <StepShell on={d.on.avr} setOn={(v) => setOn("avr", v)} hint="АВР не добавляется">
                  <div className="grid gap-2 md:grid-cols-3">
                    <ChoiceCard active={d.avrKind === "bavr"} onClick={() => set({ avrKind: "bavr" })} title="На БАВР" text="Блок автоматики с реле контроля фаз + промежуточные реле. Надёжно, без силовой коммутации контакторами" />
                    <ChoiceCard active={d.avrKind === "contactors"} onClick={() => set({ avrKind: "contactors" })} title="На контакторах" text="2 контактора с механической блокировкой + реле. Классическая силовая схема" />
                    <ChoiceCard active={d.avrKind === "switch"} onClick={() => set({ avrKind: "switch" })} title="Реверсивный рубильник" text="Ручное переключение 1-0-2 с блокировкой — бюджетный вариант без автоматики" />
                  </div>
                  <div className="mt-4 max-w-xs">
                    <Field label="Линии управления (промежуточные реле), шт">
                      <NumInput value={d.ctrlLines} step={1} onChange={(v) => set({ ctrlLines: Math.max(0, Math.round(v)) })} />
                    </Field>
                  </div>
                </StepShell>
              )}
              {meta.id === "uzp" && (
                <StepShell on={d.on.uzp} setOn={(v) => setOn("uzp", v)} hint="УЗИП не добавляется">
                  <div className="grid gap-2 md:grid-cols-2">
                    <ChoiceCard active={d.uzpKind === "t2"} onClick={() => set({ uzpKind: "t2" })} title="УЗИП тип 2 (класс II)" text="Защита от коммутационных перенапряжений. Рекомендуется для большинства объектов с кабельным вводом" />
                    <ChoiceCard active={d.uzpKind === "t12"} onClick={() => set({ uzpKind: "t12" })} title="УЗИП тип 1+2 (класс I+II)" text="Включая защиту от прямого грозового воздействия — для воздушных вводов и молниезащищённых зданий" />
                  </div>
                  <p className="mt-3 rounded-md bg-steel-soft px-3 py-2 text-[12px] text-steel">
                    Подбор по СП 256.1325800: при воздушном вводе — тип 1+2 на вводе, при кабельном — достаточно типа 2.
                  </p>
                </StepShell>
              )}
              {meta.id === "controls" && (
                <StepShell on={d.on.controls} setOn={(v) => setOn("controls", v)} hint="Органы управления не добавляются">
                  <div className="grid max-w-xl grid-cols-2 gap-3 md:grid-cols-4">
                    <Field label="Кнопки, шт"><NumInput value={d.buttons} step={1} onChange={(v) => set({ buttons: Math.max(0, Math.round(v)) })} /></Field>
                    <Field label="«Авар. стоп», шт"><NumInput value={d.btnStop} step={1} onChange={(v) => set({ btnStop: Math.max(0, Math.round(v)) })} /></Field>
                    <Field label="Лампы индикации, шт"><NumInput value={d.lamps} step={1} onChange={(v) => set({ lamps: Math.max(0, Math.round(v)) })} /></Field>
                    <Field label="Переключатели 1-0-2, шт"><NumInput value={d.switches} step={1} onChange={(v) => set({ switches: Math.max(0, Math.round(v)) })} /></Field>
                  </div>
                  <p className="mt-3 text-[12px] text-mute">Типовой набор на дверцу: «Вкл / Откл», аварийный гриб, лампы «Сеть 1», «Сеть 2», «Авария», переключатель режимов.</p>
                </StepShell>
              )}
              {meta.id === "busbars" && (
                <StepShell on={d.on.busbars} setOn={(v) => setOn("busbars", v)} hint="Шинные сборки не добавляются">
                  <Toggle on={d.busNeed} onChange={(v) => set({ busNeed: v })} label="Шинная сборка требуется" />
                  {d.busNeed && (
                    <>
                      <div className="mt-3 max-w-xs">
                        <Field label="Расчётный ток нагрузки, А" hint="По нему подберём сечение и количество шинодержателей">
                          <NumInput value={d.busCurrent} step={10} onChange={(v) => set({ busCurrent: Math.max(0, v) })} />
                        </Field>
                      </div>
                      {(() => {
                        const sel = busSelection(d.busCurrent);
                        if (!sel) return null;
                        return (
                          <div className="anim-scale mt-3 max-w-xl rounded-lg border border-ok/30 bg-ok-soft px-4 py-3">
                            <div className="text-[13px] font-bold text-ok">{sel.label}</div>
                            <div className="text-[11.5px] text-ink2">{sel.note}</div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </StepShell>
              )}
              {meta.id === "layout" && (
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
                      <div className="mt-3 max-w-xs">
                        <Field label="Панель оператора (HMI)">
                          <Select value={d.hmiKind} onChange={(v) => set({ hmiKind: v as Draft["hmiKind"] })} options={[{ value: "none", label: "Не нужна" }, { value: "7", label: "7 дюймов" }, { value: "10", label: "10,1 дюйма" }]} />
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
                        </div>
                      </div>
                    </>
                  )}
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
                    Стоимость работ = часы × ставки с страницы «Тарифы», в продаже — с наценкой на работы из параметров проекта.
                    ППО добавляйте и для серверов SCADA — часы попадут в расчёт по производству.
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
                      {cabName} · сборка {d.hours} ч · проект {d.designHours} ч · ПО {d.softwareHours} ч
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
                    <SumChip label="Работы" value={`${d.hours + d.designHours + d.softwareHours} ч`} />
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
  d, set, pool, exact, fallback, ipOf, project,
}: {
  d: Draft;
  set: (p: Partial<Draft>) => void;
  pool: Equipment[];
  exact: Equipment[];
  fallback: Equipment[];
  ipOf: (e: Equipment) => number;
  project: Project;
}) {
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
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Тип установки">
              <Select value={d.cabMount} onChange={(v) => set({ cabMount: v as Draft["cabMount"] })} options={[{ value: "any", label: "Любой" }, { value: "floor", label: "Напольный" }, { value: "wall", label: "Навесной (на стену)" }]} />
            </Field>
            <Field label="Степень защиты IP">
              <Select value={d.cabIp} onChange={(v) => set({ cabIp: v as Draft["cabIp"] })} options={["any", "31", "54", "65", "66", "67"].map((x) => ({ value: x, label: x === "any" ? "Любая" : `IP${x}` }))} />
            </Field>
            <Field label="Тип шкафа в структуре">
              <Select value={d.kind} onChange={(v) => set({ kind: v })} options={CABINET_KINDS[project.direction].map((k) => ({ value: k, label: k }))} />
            </Field>
          </div>

          {exact.length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {exact.map((e) => (
                <EncCard key={e.id} e={e} active={d.cabId === e.id} ip={ipOf(e)} onClick={() => set({ cabId: e.id, manualOn: false })} />
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
                  <EncCard key={e.id} e={e} active={d.cabId === e.id} ip={ipOf(e)} note={`вместо IP${d.cabIp}`} onClick={() => set({ cabId: e.id, manualOn: false })} />
                ))}
              </div>
            </div>
          )}

          {exact.length === 0 && fallback.length === 0 && (
            <div className="mt-4 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-[12.5px] text-ink2">
              Подходящих корпусов не нашлось — введите свой вариант вручную.
            </div>
          )}

          {/* ручной ввод */}
          <div className={cx("mt-4 rounded-lg border p-3", d.manualOn ? "border-accent bg-accent-soft/40" : "border-dashed border-line2")}>
            <Toggle on={d.manualOn} onChange={(v) => set({ manualOn: v, cabId: v ? null : d.cabId })} label="Своего корпуса нет — ввести вручную (попадёт в справочник)" />
            {d.manualOn && (
              <div className="anim-step mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                <Field label="Наименование корпуса">
                  <Input value={d.manualName} onChange={(v) => set({ manualName: v })} placeholder="Шкаф напольный 2200×800×600, IP66, нерж." />
                </Field>
                <Field label="Цена продажи, ₽">
                  <NumInput value={d.manualPrice} step={500} onChange={(v) => set({ manualPrice: Math.max(0, v) })} />
                </Field>
              </div>
            )}
          </div>
          <p className="mt-2 text-[11.5px] text-mute">В подборе {pool.length} корпус(ов) по типу установки из справочника.</p>
        </div>
      )}
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
