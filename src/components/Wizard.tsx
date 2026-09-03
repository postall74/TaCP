import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, Info, Wand } from "lucide-react";
import type { Cabinet, LineItem, Project, ProjectStatus, Rates } from "../types";
import { CABINET_KINDS } from "../types";
import { CATALOG, findEq } from "../data/catalog";
import { fmtMoney, fmtNum, genId, plural } from "../utils";
import { Badge, Btn, CountRow, Field, NumInput, Select, SelectRow, Toggle, ToggleRow, cx } from "./ui";

/* ============================================================
   МАСТЕР ПОДБОРА (прототип). Акцент итерации:
   А.3 «УЗИП» — все классы I/II/I+II/III из справочника, резервный
        автомат добавляется автоматически по числу силовых УЗИП,
        слаботочные УЗИП перенесены в шаг «ПЛК и модули».
   А.6 «Работы и ППО» — единообразные строки CountRow + живой
        расчёт стоимости работ по ставкам тарифов.
   ============================================================ */

type StepId =
  | "cab" | "avr" | "breakers" | "uzp" | "controls" | "meters" | "busbars"
  | "layout" | "climate" | "plc" | "section" | "work" | "zip" | "summary";

const STEP_META: { id: StepId; title: string; desc: string }[] = [
  { id: "cab", title: "Корпус шкафа", desc: "готовый или ручной" },
  { id: "avr", title: "АВР", desc: "2/3/5 вводов" },
  { id: "breakers", title: "Ввод и линии", desc: "автоматы, учёт, PE" },
  { id: "uzp", title: "УЗИП", desc: "классы I–III + автомат" },
  { id: "controls", title: "Кнопки и индикация", desc: "макет дверцы" },
  { id: "meters", title: "Измерительные приборы", desc: "WB, ТТ, мультиметры" },
  { id: "busbars", title: "Шинные сборки", desc: "по току, секции" },
  { id: "layout", title: "Компоновка", desc: "стенки, цоколи" },
  { id: "climate", title: "Микроклимат", desc: "вентиляция, обогрев" },
  { id: "plc", title: "ПЛК и модули", desc: "+ УЗИП интерфейсов" },
  { id: "section", title: "Секционирование", desc: "формы 1…4b" },
  { id: "work", title: "Работы и ППО", desc: "нормо-часы по ролям" },
  { id: "zip", title: "ЗИП и транспорт", desc: "% запаса, доставка" },
  { id: "summary", title: "Сводка", desc: "проверка и применение" },
];

interface Draft {
  kind: string;
  cabNeed: boolean;
  cabId: string | null;
  on: Record<string, boolean>;

  avrKind: "bavr" | "contactors";
  avrInputs: 2 | 3 | 5;

  mainId: string;
  out1p: number; out1pId: string;
  out3p: number; out3pId: string;
  rcd: number; meter: boolean; peBuses: number;

  /* А.3 — классы силовых УЗИП (количество комплектов) */
  uzpT1: number; uzpT2: number; uzpT12: number; uzpT3: number;
  /* слаботочные УЗИП — закладываются на шаге ПЛК */
  uzpRs: number; uzpEth: number; uzpIo: number;

  buttons: number; btnStop: number; lamps: number; switches: number;
  ammIn: number; voltIn: number; ammOut: number; wbMeters: number;
  busNeed: boolean; busCurrent: number; busSections: number;
  wallRow: boolean; rowSize: number; pedestal: boolean;
  fans: number; grilles: number; heaters: number; thermos: number; acOn: boolean;
  plcNeed: boolean; di: number; doN: number; ai: number; reserve: number; barriers: number; converters: number;
  segOn: boolean; segQ1: boolean; segQ2: boolean; segQ3: "3a" | "3b" | "4a" | "4b";

  /* А.6 — нормо-часы по ролям */
  hours: number; designHours: number; softwareHours: number; separateLine: boolean;
  zipOn: boolean; zipPct: number;
  transportOn: boolean; transportPct: number;
}

const li = (eqId: string, qty: number): LineItem | null => {
  const e = findEq(eqId);
  if (!e || qty <= 0) return null;
  return { id: genId("li"), eqId, sku: e.sku, name: e.name, brand: e.brand, unit: e.unit, qty, purchase: e.purchase };
};

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
  if (current <= 63) return { label: "Гребёнки и нулевые шины (модульные)", items: [li("bus-cu25", 1)], note: "до 63 А" };
  if (current <= 160) return { label: "Шина медная 25×3 — 2 м + 4 шинодержателя", items: [li("bus-cu25", 2), li("holder-1", 4)], note: "63…160 А" };
  if (current <= 250) return { label: "Шина медная 40×4 — 2 м + 6 шинодержателей", items: [li("bus-cu40", 2), li("holder-1", 6)], note: "160…250 А" };
  return { label: "Шина медная 40×4 — 4 м + 10 шинодержателей", items: [li("bus-cu40", 4), li("holder-1", 10)], note: "свыше 250 А — проверьте сечение" };
}

const ZIP_CATS = ["Автоматические выключатели", "Контакторы и реле", "УЗИП и защита", "Блоки питания", "ПЛК и модули"];

export default function Wizard({ project, rates, onClose, onCreate, onToast }: {
  project: Project;
  rates: Rates;
  onClose: () => void;
  onCreate: (cabs: Cabinet[], opts: { showWorkLines: boolean; transportPct: number }) => void;
  onToast: (msg: string, kind?: "ok" | "err") => void;
}) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => ({
    kind: CABINET_KINDS[project.direction][0],
    cabNeed: true, cabId: "enc-800",
    on: {
      avr: false, breakers: true, uzp: true, controls: true, meters: false, busbars: true,
      layout: true, climate: false, plc: project.direction === "asu", section: false,
    },
    avrKind: "bavr", avrInputs: 2,
    mainId: "brk-nsx100", out1p: 6, out1pId: "brk-c16", out3p: 2, out3pId: "brk-3p40",
    rcd: 0, meter: true, peBuses: 1,
    uzpT1: 0, uzpT2: 1, uzpT12: 0, uzpT3: 0,
    uzpRs: 0, uzpEth: 0, uzpIo: 0,
    buttons: 2, btnStop: 1, lamps: 2, switches: 1,
    ammIn: 0, voltIn: 0, ammOut: 0, wbMeters: 0,
    busNeed: true, busCurrent: 100, busSections: 1,
    wallRow: false, rowSize: 2, pedestal: false,
    fans: 0, grilles: 0, heaters: 0, thermos: 0, acOn: false,
    plcNeed: project.direction === "asu", di: 16, doN: 8, ai: 4, reserve: 20, barriers: 0, converters: 0,
    segOn: false, segQ1: false, segQ2: false, segQ3: "3a",
    hours: 10, designHours: 4, softwareHours: 0, separateLine: true,
    zipOn: true, zipPct: 20, transportOn: false, transportPct: 2,
  }));

  const set = (patch: Partial<Draft>) => setD((s) => ({ ...s, ...patch }));
  const setOn = (k: string, v: boolean) => setD((s) => ({ ...s, on: { ...s.on, [k]: v } }));
  const go = (n: number) => setStep((s) => Math.max(0, Math.min(STEP_META.length - 1, n)));
  const meta = STEP_META[step];

  /* Число силовых УЗИП → столько же резервных автоматов (А.3). */
  const uzpPowerCount = d.uzpT1 + d.uzpT2 + d.uzpT12 + d.uzpT3;

  const bundle = useMemo(() => {
    const items: (LineItem | null)[] = [];
    if (d.cabNeed && d.cabId) items.push(li(d.cabId, 1));

    if (d.on.avr) {
      const kits = d.avrInputs === 2 ? 1 : 2;
      items.push(li("bavr-kit", kits));
      if (d.avrKind === "contactors") items.push(li("interlock", Math.max(1, d.avrInputs - 1)));
      items.push(li("rp-24", 2 * kits));
    }
    if (d.on.breakers) {
      items.push(li(d.mainId, 1));
      items.push(li(d.out1pId, d.out1p));
      items.push(li(d.out3pId, d.out3p));
      items.push(li("brk-2p32", d.rcd));
      if (d.meter) { items.push(li("meter-231", 1)); items.push(li("ct-100", 3)); items.push(li("amm-din", 1)); }
      items.push(li("pe-bus", d.peBuses));
    }
    /* А.3: силовые УЗИП по классам + резервный автомат на каждый комплект */
    if (d.on.uzp) {
      items.push(li("uzp-t1", d.uzpT1));
      items.push(li("uzp-t2", d.uzpT2));
      items.push(li("uzp-t12", d.uzpT12));
      items.push(li("uzp-t3", d.uzpT3));
      if (uzpPowerCount > 0) items.push(li("uzp-backup", uzpPowerCount));
    }
    if (d.on.controls) {
      items.push(li("btn-1", d.buttons));
      items.push(li("btn-e", d.btnStop));
      items.push(li("lamp-1", d.lamps));
      items.push(li("swsel-1", d.switches));
    }
    if (d.on.meters) {
      items.push(li("amm-din", d.ammIn + d.ammOut));
      items.push(li("volt-din", d.voltIn));
      items.push(li("wb-m3", d.wbMeters));
      items.push(li("ct-100", d.wbMeters * 3));
    }
    if (d.on.busbars && d.busNeed) {
      const sel = busSelection(d.busCurrent);
      if (sel) for (const it of sel.items) if (it) items.push({ ...it, qty: it.qty * Math.max(1, d.busSections) });
      if (d.busSections > 1) items.push(li("bus-joint", d.busSections - 1));
    }
    if (d.on.climate) {
      items.push(li("fan-120", d.fans));
      items.push(li("grille-120", d.grilles));
      items.push(li("heater-150", d.heaters));
      items.push(li("thermo-1", d.thermos));
    }
    if (d.on.plc && d.plcNeed) {
      items.push(li("plc-110", 1));
      items.push(li("di-16", modCount(d.di, 16, d.reserve)));
      items.push(li("do-16", modCount(d.doN, 16, d.reserve)));
      items.push(li("ai-8", modCount(d.ai, 8, d.reserve)));
      items.push(li("psu-10", 1));
      items.push(li("barrier-ex", d.barriers));
      items.push(li("conv-sig", d.converters));
      /* А.3 (перенос): слаботочные УЗИП закладываются вместе с ПЛК */
      items.push(li("uzp-rs485", d.uzpRs));
      items.push(li("uzp-eth", d.uzpEth));
      items.push(li("uzp-io", d.uzpIo));
    }
    const main = dedupe(items);

    const zipItems: LineItem[] = [];
    if (d.zipOn && d.zipPct > 0) {
      for (const it of main) {
        const cat = findEq(it.eqId)?.category;
        if (cat && ZIP_CATS.includes(cat)) zipItems.push({ ...it, id: genId("li"), qty: Math.max(1, Math.round((it.qty * d.zipPct) / 100)) });
      }
    }

    const eqSum = main.reduce((s, i) => s + i.purchase * i.qty, 0);
    const zipSum = zipItems.reduce((s, i) => s + i.purchase * i.qty, 0);
    return { main, zipItems, eqSum, zipSum };
  }, [d, uzpPowerCount]);

  /* А.6: живой расчёт стоимости работ по тарифам */
  const laborCost = d.hours * rates.production + d.designHours * rates.design + d.softwareHours * rates.software;
  const laborSell = laborCost * (1 + project.workMarkup / 100);
  const totalHours = d.hours + d.designHours + d.softwareHours;

  const cabName = d.cabNeed
    ? `${d.kind} — ${findEq(d.cabId ?? "")?.name ?? "корпус"}`
    : `${d.kind} (корпус заказчика)`;

  const apply = () => {
    if (bundle.main.length === 0) {
      onToast("Мастер ничего не добавит — включите хотя бы один шаг", "err");
      return;
    }
    const cabs: Cabinet[] = [{
      id: genId("cab"), kind: d.kind, name: cabName, items: bundle.main,
      hours: d.hours, designHours: d.designHours, softwareHours: d.softwareHours,
    }];
    if (bundle.zipItems.length > 0)
      cabs.push({ id: genId("cab"), kind: "ЗИП", name: "ЗИП — запасные части", items: bundle.zipItems, hours: 0, designHours: 0, softwareHours: 0 });
    onCreate(cabs, { showWorkLines: d.separateLine, transportPct: d.transportOn ? d.transportPct : 0 });
    onToast(`Добавлено: ${cabs.length} ${plural(cabs.length, "шкаф", "шкафа", "шкафов")}, ${bundle.main.length + bundle.zipItems.length} позиций`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-dark/60 p-3 backdrop-blur-sm lg:p-6" onClick={onClose}>
      <div className="anim-rise mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* заголовок */}
        <div className="flex items-center gap-3 bg-dark px-5 py-3.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white"><Wand size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-display truncate text-[13px] font-bold text-white">Мастер подбора шкафа</div>
            <div className="truncate text-[10.5px] text-darkmute">{project.number} · «{project.title}»</div>
          </div>
          <div key={bundle.eqSum + bundle.zipSum} className="anim-pop rounded-lg bg-dark2 px-3 py-1.5 text-right">
            <div className="text-[9px] font-bold tracking-wider text-darkmute uppercase">Оборудование</div>
            <div className="num font-mono text-[13px] font-bold text-white">{fmtMoney(bundle.eqSum + bundle.zipSum)}</div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-darkmute transition-colors hover:bg-dark2 hover:text-white" aria-label="Закрыть">
            <ArrowLeft size={0} className="hidden" /><span className="text-[16px] leading-none">×</span>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* рельса шагов */}
          <div className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line bg-card p-2.5 md:flex">
            {STEP_META.map((s, i) => {
              const optional = !["cab", "breakers", "work", "zip", "summary"].includes(s.id);
              const off = optional && !d.on[s.id];
              const cur = i === step;
              return (
                <button key={s.id} onClick={() => go(i)}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-all duration-150",
                    cur ? "bg-accent text-white shadow-md shadow-accent/25" : off ? "opacity-45 hover:opacity-75" : "text-ink2 hover:bg-paper",
                  )}>
                  <span className={cx(
                    "num flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold",
                    cur ? "bg-white/20 text-white" : off ? "bg-line text-mute line-through" : "bg-dark text-white",
                  )}>{off ? "–" : i + 1}</span>
                  <span className="min-w-0">
                    <span className={cx("block text-[12px] leading-tight font-bold", off && "line-through")}>{s.title}</span>
                    <span className={cx("block text-[9.5px] leading-tight", cur ? "text-white/70" : "text-mute")}>{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* контент */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-line bg-card px-5 py-2.5">
              <div className="flex items-center gap-2">
                <span className="num rounded bg-dark px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">ШАГ {step + 1}/{STEP_META.length}</span>
                <span className="text-[14px] font-bold text-ink">{meta.title}</span>
              </div>
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${((step + 1) / STEP_META.length) * 100}%` }} />
              </div>
            </div>

            <div key={meta.id} className="anim-rise min-h-0 flex-1 overflow-y-auto p-5">
              {meta.id === "cab" && <StepCab d={d} set={set} />}
              {meta.id === "avr" && (
                <StepShell on={d.on.avr} setOn={(v) => setOn("avr", v)} hint="АВР не добавляется">
                  <div className="grid max-w-2xl gap-2 md:grid-cols-2">
                    <ChoiceCard active={d.avrKind === "bavr"} onClick={() => set({ avrKind: "bavr" })} title="На БАВР" text="Блок автоматики + реле контроля фаз" />
                    <ChoiceCard active={d.avrKind === "contactors"} onClick={() => set({ avrKind: "contactors" })} title="На контакторах" text="Силовая коммутация с блокировкой" />
                  </div>
                  <div className="mt-3 grid max-w-2xl gap-2 md:grid-cols-3">
                    {([2, 3, 5] as const).map((n) => (
                      <ChoiceCard key={n} active={d.avrInputs === n} onClick={() => set({ avrInputs: n })}
                        title={`${n} ввода`} text={n === 2 ? "основной + резервный" : n === 3 ? "каскад из 2 блоков" : "два АВР, объединённые между собой"} />
                    ))}
                  </div>
                </StepShell>
              )}
              {meta.id === "breakers" && (
                <StepShell on={d.on.breakers} setOn={(v) => setOn("breakers", v)} hint="Автоматы и учёт не добавляются">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <SelectRow label="Вводной автомат" value={d.mainId} onChange={(v) => set({ mainId: v })}
                      options={["brk-nsx100", "brk-nsx250", "brk-3p63"].map(idToOpt)} />
                    <CountRow label="Отходящие 1P/2P, шт" value={d.out1p} onChange={(v) => set({ out1p: v })} />
                    <CountRow label="Отходящие 3P, шт" value={d.out3p} onChange={(v) => set({ out3p: v })} />
                    <CountRow label="УЗО (дифзащита), шт" value={d.rcd} onChange={(v) => set({ rcd: v })} />
                    <CountRow label="Шин заземления PE, шт" hint="Главная PE + дополнительные по отсекам" value={d.peBuses} min={1} onChange={(v) => set({ peBuses: Math.max(1, v) })} />
                    <ToggleRow label="Учёт электроэнергии" hint="Счётчик 3-ф + 3 трансформатора тока + мультиметр" on={d.meter} onChange={(v) => set({ meter: v })} />
                  </div>
                </StepShell>
              )}

              {/* ==================== А.3 — УЗИП ==================== */}
              {meta.id === "uzp" && (
                <StepShell on={d.on.uzp} setOn={(v) => setOn("uzp", v)} hint="УЗИП не добавляются">
                  <div className="max-w-2xl rounded-lg border border-line bg-card px-4 py-1">
                    <CountRow label="Класс I (тип 1) — импульсный 10/350"
                      hint="Защита от прямого грозового воздействия: воздушные вводы, зона LPZ 0A→1"
                      value={d.uzpT1} onChange={(v) => set({ uzpT1: v })} />
                    <CountRow label="Класс II (тип 2) — 8/20"
                      hint="Коммутационные перенапряжения, зона LPZ 1→2 — основная защита большинства объектов с кабельным вводом"
                      value={d.uzpT2} onChange={(v) => set({ uzpT2: v })} />
                    <CountRow label="Класс I+II (тип 1+2) — комбинированный"
                      hint="Один аппарат на вводе вместо каскада: воздушные вводы без отдельного молниеприёмника"
                      value={d.uzpT12} onChange={(v) => set({ uzpT12: v })} />
                    <CountRow label="Класс III (тип 3) — тонкая защита"
                      hint="Устанавливается у чувствительной электроники (ПЛК, серверы), зона LPZ 2→3"
                      value={d.uzpT3} onChange={(v) => set({ uzpT3: v })} />
                  </div>

                  {/* автоматический резервный автомат */}
                  <div key={uzpPowerCount} className="anim-pop mt-3 flex max-w-2xl flex-wrap items-center gap-2.5 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3">
                    <Check size={15} className="shrink-0 text-ok" />
                    <div className="min-w-0 flex-1 text-[12px] leading-snug text-ink2">
                      <b className="text-ok">Резервный автомат добавится автоматически: {uzpPowerCount} шт</b>
                      <span className="text-mute"> — по числу комплектов силовых УЗИП (требование производителей, отключение повреждённого УЗИП).</span>
                    </div>
                    <Badge tone="dark">{fmtMoney(uzpPowerCount * (findEq("uzp-backup")?.purchase ?? 0))}</Badge>
                  </div>

                  {uzpPowerCount === 0 && (
                    <div className="mt-3 flex max-w-2xl items-start gap-2.5 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
                      <div className="text-[12px] leading-relaxed text-ink2">Ни один класс не выбран — шаг не добавит позиций. Для кабельных вводов обычно достаточно класса II.</div>
                    </div>
                  )}

                  {/* слаботочные УЗИП перенесены в ПЛК */}
                  <div className="mt-3 flex max-w-2xl flex-wrap items-center gap-3 rounded-lg border border-steel/30 bg-steel-soft px-4 py-3">
                    <Info size={15} className="shrink-0 text-steel" />
                    <div className="min-w-0 flex-1 text-[12px] leading-snug text-steel">
                      УЗИП для <b>RS-485, Ethernet и каналов ПЛК (24 В DC)</b> закладываются на шаге «ПЛК и модули» — вместе с защищаемыми интерфейсами.
                    </div>
                    <Btn variant="outline" size="sm" onClick={() => { setOn("plc", true); go(9); }}>
                      Перейти к ПЛК <ArrowRight size={13} />
                    </Btn>
                  </div>
                </StepShell>
              )}

              {meta.id === "controls" && (
                <StepShell on={d.on.controls} setOn={(v) => setOn("controls", v)} hint="Органы управления не добавляются">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <CountRow label="Кнопки управления, шт" value={d.buttons} onChange={(v) => set({ buttons: v })} />
                    <CountRow label="«Аварийный стоп», шт" value={d.btnStop} onChange={(v) => set({ btnStop: v })} />
                    <CountRow label="Лампы индикации, шт" value={d.lamps} onChange={(v) => set({ lamps: v })} />
                    <CountRow label="Переключатели 1-0-2, шт" value={d.switches} onChange={(v) => set({ switches: v })} />
                  </div>
                  <p className="mt-2 max-w-xl text-[11.5px] text-mute">Интерактивный макет дверцы с перетаскиванием — в полной версии мастера (ветка feature/interactive-door).</p>
                </StepShell>
              )}
              {meta.id === "meters" && (
                <StepShell on={d.on.meters} setOn={(v) => setOn("meters", v)} hint="Приборы не добавляются">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <CountRow label="Амперметры на вводе, шт" value={d.ammIn} onChange={(v) => set({ ammIn: v })} />
                    <CountRow label="Вольтметры на вводе, шт" value={d.voltIn} onChange={(v) => set({ voltIn: v })} />
                    <CountRow label="Амперметры на отходящих линиях, шт" value={d.ammOut} onChange={(v) => set({ ammOut: v })} />
                    <CountRow label="Измерители параметров сети WB, шт" hint="Для электрообогрева: U/I/P по каждой фазе, RS-485; добавит по 3 ТТ на прибор"
                      value={d.wbMeters} onChange={(v) => set({ wbMeters: v })} />
                  </div>
                </StepShell>
              )}
              {meta.id === "busbars" && (
                <StepShell on={d.on.busbars} setOn={(v) => setOn("busbars", v)} hint="Шинные сборки не добавляются">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <ToggleRow label="Шинная сборка требуется" on={d.busNeed} onChange={(v) => set({ busNeed: v })} />
                    {d.busNeed && (
                      <>
                        <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5">
                          <div><div className="text-[12.5px] font-semibold text-ink">Расчётный ток нагрузки, А</div>
                            <div className="mt-0.5 text-[10.5px] text-mute">По нему подбирается сечение и шинодержатели</div></div>
                          <div className="w-[120px] shrink-0"><NumInput value={d.busCurrent} step={10} min={0} onChange={(v) => set({ busCurrent: v })} /></div>
                        </div>
                        <CountRow label="Секций главных шин" hint="Для секционированных шкафов + стыки" value={d.busSections} min={1} onChange={(v) => set({ busSections: Math.max(1, v) })} />
                      </>
                    )}
                  </div>
                  {(() => {
                    const sel = busSelection(d.busNeed ? d.busCurrent : 0);
                    return sel ? (
                      <div className="anim-pop mt-3 max-w-xl rounded-lg border border-ok/30 bg-ok-soft px-4 py-3 text-[12.5px] font-bold text-ok">
                        {sel.label}{d.busSections > 1 ? ` — ×${d.busSections} секции + стыки (${d.busSections - 1} шт)` : ""}
                      </div>
                    ) : null;
                  })()}
                </StepShell>
              )}
              {meta.id === "layout" && (
                <StepShell on={d.on.layout} setOn={(v) => setOn("layout", v)} hint="Компоновочные элементы не добавляются">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <ToggleRow label="Шкафы «стена к стене» — общие боковые стенки" on={d.wallRow} onChange={(v) => set({ wallRow: v })} />
                    {d.wallRow && <CountRow label="Шкафов в ряду" hint={`Боковых панелей: ${Math.max(2, d.rowSize + 1)} вместо ${d.rowSize * 2}`} value={d.rowSize} min={2} onChange={(v) => set({ rowSize: Math.max(2, v) })} />}
                    <ToggleRow label="Цоколи 100 мм для напольных шкафов" on={d.pedestal} onChange={(v) => set({ pedestal: v })} />
                  </div>
                </StepShell>
              )}
              {meta.id === "climate" && (
                <StepShell on={d.on.climate} setOn={(v) => setOn("climate", v)} hint="Микроклимат не добавляется">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <CountRow label="Вентиляторы, шт" value={d.fans} onChange={(v) => set({ fans: v })} />
                    <CountRow label="Решётки с фильтром, шт" value={d.grilles} onChange={(v) => set({ grilles: v })} />
                    <CountRow label="Обогреватели, шт" value={d.heaters} onChange={(v) => set({ heaters: v })} />
                    <CountRow label="Термостаты / гигростаты, шт" value={d.thermos} onChange={(v) => set({ thermos: v })} />
                    <ToggleRow label="Шкафной кондиционер" hint="Высокая тепловая нагрузка (частотники, ПЛК)" on={d.acOn} onChange={(v) => set({ acOn: v })} />
                  </div>
                </StepShell>
              )}
              {meta.id === "plc" && (
                <StepShell on={d.on.plc} setOn={(v) => setOn("plc", v)} hint="Контроллерная часть не добавляется">
                  <Toggle on={d.plcNeed} onChange={(v) => set({ plcNeed: v })} label="В проекте есть ПЛК / модули ввода-вывода" />
                  {d.plcNeed && (
                    <>
                      <div className="mt-3 max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                        <CountRow label="DI — дискретные входы" value={d.di} onChange={(v) => set({ di: v })} />
                        <CountRow label="DO — дискретные выходы" value={d.doN} onChange={(v) => set({ doN: v })} />
                        <CountRow label="AI — аналоговые входы" value={d.ai} onChange={(v) => set({ ai: v })} />
                        <CountRow label="Резерв каналов, %" value={d.reserve} step={5} onChange={(v) => set({ reserve: Math.min(50, v) })} />
                        <CountRow label="Барьеры искрозащиты (Ex-i), шт" value={d.barriers} onChange={(v) => set({ barriers: v })} />
                        <CountRow label="Преобразователи сигналов, шт" value={d.converters} onChange={(v) => set({ converters: v })} />
                      </div>

                      {/* А.3 (перенос): слаботочные УЗИП */}
                      <div className="anim-rise mt-4 max-w-xl overflow-hidden rounded-lg border border-steel/30">
                        <div className="flex items-center gap-2 bg-steel-soft px-4 py-2">
                          <Info size={14} className="text-steel" />
                          <span className="text-[11px] font-bold tracking-wide text-steel uppercase">Защита интерфейсов и каналов — УЗИП</span>
                        </div>
                        <div className="bg-card px-4 py-1">
                          <CountRow label="Линии RS-485, шт" hint="Импульсы приходят и по интерфейсам — защищаются сигнальными УЗИП" value={d.uzpRs} onChange={(v) => set({ uzpRs: v })} />
                          <CountRow label="Линии Ethernet, шт" value={d.uzpEth} onChange={(v) => set({ uzpEth: v })} />
                          <CountRow label="Каналы ПЛК 24 В DC (DI/DO/AI/AO), шт" value={d.uzpIo} onChange={(v) => set({ uzpIo: v })} />
                        </div>
                      </div>
                    </>
                  )}
                </StepShell>
              )}
              {meta.id === "section" && (
                <StepShell on={d.segOn} setOn={(v) => setOn("section", v)} hint="Шкаф остаётся без разделения (форма 1)">
                  <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                    <ToggleRow label="1. Отделить главные шины от оборудования?" on={d.segQ1} onChange={(v) => set({ segQ1: v, ...(v ? {} : { segQ2: false }) })} />
                    {d.segQ1 && <ToggleRow label="2. Отделить функциональные блоки друг от друга?" on={d.segQ2} onChange={(v) => set({ segQ2: v })} />}
                  </div>
                  {d.segOn && d.segQ1 && d.segQ2 && (
                    <div className="mt-3 grid max-w-2xl gap-2 md:grid-cols-2">
                      {(["3a", "3b", "4a", "4b"] as const).map((f) => (
                        <ChoiceCard key={f} active={d.segQ3 === f} onClick={() => set({ segQ3: f })} title={`Форма ${f}`}
                          text={f.endsWith("a") ? "клеммы в отсеке своего блока" : "клеммы/присоединения в отдельном отсеке"} />
                      ))}
                    </div>
                  )}
                  <div className="anim-pop mt-3 max-w-2xl rounded-lg border border-line bg-card px-4 py-2.5 text-[12.5px] font-bold text-ink">
                    {d.segOn ? (d.segQ1 ? (d.segQ2 ? `Форма ${d.segQ3} (ГОСТ IEC 61439-2)` : "Форма 2a — шины отделены") : "Форма 1 — без разделения") : "Форма 1 — без разделения"}
                  </div>
                </StepShell>
              )}

              {/* ==================== А.6 — Работы и ППО ==================== */}
              {meta.id === "work" && (
                <div className="grid max-w-3xl gap-4 lg:grid-cols-[1fr_260px]">
                  <div className="rounded-lg border border-line bg-card px-4 py-1">
                    <CountRow label="Сборка (производство), ч" hint={`Ставка ${fmtMoney(rates.production)}/ч`} value={d.hours} onChange={(v) => set({ hours: v })} />
                    <CountRow label="Проектирование, ч" hint={`Ставка ${fmtMoney(rates.design)}/ч`} value={d.designHours} onChange={(v) => set({ designHours: v })} />
                    <CountRow label="Разработка ППО — ПЛК / HMI / сервер, ч" hint={`Ставка ${fmtMoney(rates.software)}/ч`} value={d.softwareHours} onChange={(v) => set({ softwareHours: v })} />
                    <ToggleRow label="Показывать работы отдельной строкой в документе ТКП" on={d.separateLine} onChange={(v) => set({ separateLine: v })} />
                  </div>

                  {/* живой расчёт по тарифам */}
                  <div className="h-fit rounded-lg border border-line bg-dark p-4 text-white">
                    <div className="text-[10px] font-bold tracking-wider text-darkmute uppercase">Стоимость работ</div>
                    <div className="mt-2 flex flex-col gap-1.5 text-[11.5px]">
                      <div className="flex justify-between"><span className="text-darkmute">Сборка</span><span className="num font-mono">{d.hours} ч × {fmtMoney(rates.production)}</span></div>
                      <div className="flex justify-between"><span className="text-darkmute">Проект</span><span className="num font-mono">{d.designHours} ч × {fmtMoney(rates.design)}</span></div>
                      <div className="flex justify-between"><span className="text-darkmute">ППО</span><span className="num font-mono">{d.softwareHours} ч × {fmtMoney(rates.software)}</span></div>
                      <div className="mt-1 flex justify-between border-t border-darkline pt-1.5"><span className="text-darkmute">Себестоимость</span><span className="num font-mono font-bold">{fmtMoney(laborCost)}</span></div>
                      <div className="flex justify-between"><span className="text-darkmute">Наценка {fmtNum(project.workMarkup)} %</span><span className="num font-mono">{fmtMoney(laborSell - laborCost)}</span></div>
                    </div>
                    <div key={laborSell} className="anim-pop mt-3 rounded-lg bg-dark2 px-3 py-2">
                      <div className="text-[9px] font-bold tracking-wider text-darkmute uppercase">В продаже · {totalHours} ч</div>
                      <div className="num font-mono text-[17px] font-bold text-white">{fmtMoney(laborSell)}</div>
                    </div>
                  </div>
                </div>
              )}

              {meta.id === "zip" && (
                <div className="max-w-xl rounded-lg border border-line bg-card px-4 py-1">
                  <ToggleRow label="ЗИП для проекта" hint="Автоматы, реле, УЗИП, блоки питания, ПЛК" on={d.zipOn} onChange={(v) => set({ zipOn: v })} />
                  {d.zipOn && <CountRow label="Процент ЗИП" hint="Не менее 1 шт на позицию" value={d.zipPct} step={5} onChange={(v) => set({ zipPct: Math.min(100, v) })} />}
                  <ToggleRow label="Доставка отдельной строкой" on={d.transportOn} onChange={(v) => set({ transportOn: v })} />
                  {d.transportOn && <CountRow label="Транспорт, % от оборудования" value={d.transportPct} step={1} onChange={(v) => set({ transportPct: v })} />}
                </div>
              )}

              {meta.id === "summary" && (
                <div className="max-w-3xl">
                  <div className="rounded-lg border border-line bg-card p-3.5">
                    <div className="text-[11px] font-bold tracking-wide text-mute uppercase">{cabName} · работы {totalHours} ч</div>
                    <div className="mt-2 flex flex-col">
                      {bundle.main.map((it) => (
                        <div key={it.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-1 text-[12.5px] last:border-0">
                          <span className="truncate text-ink2">{it.name}</span>
                          <span className="num font-mono font-bold whitespace-nowrap text-ink">{it.qty} {it.unit} · {fmtMoney(it.purchase * it.qty)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <SumChip label="Оборудование" value={fmtMoney(bundle.eqSum)} />
                    <SumChip label={`ЗИП (${bundle.zipItems.length})`} value={fmtMoney(bundle.zipSum)} />
                    <SumChip label="Работы" value={fmtMoney(laborSell)} />
                    <SumChip label="Доставка" value={d.transportOn ? `${fmtNum(d.transportPct)} %` : "нет"} />
                  </div>
                </div>
              )}
            </div>

            {/* навигация */}
            <div className="flex items-center justify-between gap-3 border-t border-line bg-card px-5 py-3">
              <Btn variant="ghost" size="sm" onClick={() => go(step - 1)} disabled={step === 0}>
                <ArrowLeft size={14} /> Назад
              </Btn>
              {step < STEP_META.length - 1 ? (
                <Btn size="sm" onClick={() => go(step + 1)}>Далее <ChevronRight size={14} /></Btn>
              ) : (
                <Btn size="sm" onClick={apply}><Check size={14} /> Добавить в проект</Btn>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= вспомогательные ================= */

function StepShell({ on, setOn, hint, children }: { on: boolean; setOn: (v: boolean) => void; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <Toggle on={on} onChange={setOn} label={on ? "Этап нужен" : "Этап не нужен"} />
      {on ? <div className="anim-rise mt-4">{children}</div>
        : <div className="anim-rise mt-4 max-w-xl rounded-md border border-dashed border-line2 bg-card/60 px-4 py-3 text-[12.5px] text-mute">{hint} — переходим дальше.</div>}
    </div>
  );
}

function StepCab({ d, set }: { d: Draft; set: (p: Partial<Draft>) => void }) {
  const enclosures = CATALOG.filter((e) => e.category === "Корпуса и щиты");
  return (
    <div>
      <div className="max-w-xs">
        <Field label="Тип шкафа в структуре">
          <Select value={d.kind} onChange={(v) => set({ kind: v })} options={CABINET_KINDS.nku.map((k) => ({ value: k, label: k }))} />
        </Field>
      </div>
      <Toggle on={d.cabNeed} onChange={(v) => set({ cabNeed: v })} label="Корпус шкафа комплектуем мы" />
      {d.cabNeed && (
        <div className="mt-3 grid max-w-2xl gap-2 md:grid-cols-2">
          {enclosures.map((e) => (
            <ChoiceCard key={e.id} active={d.cabId === e.id} onClick={() => set({ cabId: e.id })}
              title={e.name} text={`${e.attrs ?? ""} · ${fmtMoney(e.purchase)}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChoiceCard({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button onClick={onClick} className={cx(
      "cursor-pointer rounded-lg border p-3 text-left transition-all duration-150 active:scale-[0.99]",
      active ? "border-accent bg-accent-soft/60 shadow-md shadow-accent/10" : "border-line bg-card hover:border-line2 hover:shadow-sm",
    )}>
      <div className="flex items-center gap-2">
        <span className={cx("flex h-4 w-4 items-center justify-center rounded-full border-2", active ? "border-accent bg-accent text-white" : "border-line2")}>
          {active && <Check size={9} />}
        </span>
        <span className="text-[12.5px] font-bold text-ink">{title}</span>
      </div>
      <div className="mt-1 pl-6 text-[11px] leading-snug text-mute">{text}</div>
    </button>
  );
}

function SumChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-2">
      <div className="text-[10px] font-bold tracking-wide text-mute uppercase">{label}</div>
      <div className="num font-mono text-[14px] font-bold text-ink">{value}</div>
    </div>
  );
}

const idToOpt = (id: string) => {
  const e = findEq(id);
  return { value: id, label: e ? `${e.sku} — ${e.name.slice(0, 34)} · ${fmtMoney(e.purchase)}` : id };
};
