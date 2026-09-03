import { useMemo, useState } from "react";
import { Boxes, ChevronRight, Layers, ShieldCheck, Wand, Zap } from "lucide-react";
import Wizard from "./components/Wizard";
import { Badge, Btn, cx } from "./components/ui";
import type { Cabinet, Project, Rates } from "./types";
import { DIRECTIONS, STATUS_LABEL } from "./types";
import { calcProject, fmtMoney, fmtNum, genId, plural } from "./utils";

/* ============================================================
   ТКП·Про — рабочий прототип (итерация А.3 + А.6 дорожной карты):
   УЗИП всех классов с автоматическим резервным автоматом и
   единообразный шаг «Работы и ППО». Данные — демо-проект, расчёт
   живой (calcProject), структура пополняется из мастера.
   ============================================================ */

const RATES: Rates = { design: 1800, production: 1800, software: 2200 };

const DEMO_PROJECT: Project = {
  id: "prj-demo",
  number: "ТКП-2026-014",
  title: "Реконструкция ГРЩ цеха №3",
  client: "ЗАО «Эталон-Прибор»",
  contact: "Султанов С.А. · +7 (351) 267-47-10",
  direction: "nku",
  status: "calc",
  createdAt: Date.now() - 86400000 * 6,
  updatedAt: Date.now() - 3600000 * 5,
  markup: 15,
  workMarkup: 25,
  discount: 0,
  vatRate: 20,
  showWorkLines: true,
  validDays: 30,
  notes: "",
  versions: [],
  cabinets: [
    {
      id: genId("cab"), kind: "ГРЩ", name: "ГРЩ — ввод и отходящие линии",
      items: [
        { id: genId("li"), eqId: "enc-800", sku: "CQE N 2000×800×600", name: "Шкаф напольный в сборе 2000×800×600, IP54", brand: "DKC", unit: "шт", qty: 1, purchase: 68500 },
        { id: genId("li"), eqId: "brk-nsx100", sku: "NSX100F TM-D 100", name: "Автомат в литом корпусе 3P 100 А", brand: "Schneider Electric", unit: "шт", qty: 1, purchase: 18400 },
        { id: genId("li"), eqId: "brk-c16", sku: "ВА47-29 C16", name: "Автоматический выключатель 1P C16", brand: "IEK", unit: "шт", qty: 8, purchase: 210 },
        { id: genId("li"), eqId: "uzp-t2", sku: "VAL-MS 400", name: "УЗИП класс II (тип 2), 40 кА 8/20", brand: "Phoenix Contact", unit: "компл.", qty: 1, purchase: 6400 },
        { id: genId("li"), eqId: "uzp-backup", sku: "CB-SPD 3P C63", name: "Автомат резервной защиты УЗИП 3P C63", brand: "DKC", unit: "шт", qty: 1, purchase: 1180 },
      ],
      hours: 12, designHours: 6, softwareHours: 0,
    },
  ],
};

interface Toast { id: number; msg: string; kind: "ok" | "err" }

export default function App() {
  const [project, setProject] = useState<Project>(DEMO_PROJECT);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const calc = useMemo(() => calcProject(project, RATES), [project]);
  const posCount = project.cabinets.reduce((s, c) => s + c.items.length, 0);

  const toast = (msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };

  const handleCreate = (cabs: Cabinet[], opts: { showWorkLines: boolean; transportPct: number }) => {
    setProject((p) => ({
      ...p,
      cabinets: [...p.cabinets, ...cabs],
      showWorkLines: opts.showWorkLines,
      transportPct: opts.transportPct,
      updatedAt: Date.now(),
    }));
  };

  return (
    <div className="bg-blueprint min-h-screen">
      {/* ---------- шапка ---------- */}
      <header className="sticky top-0 z-40 border-b border-darkline bg-dark/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-md shadow-accent/30">
              <Zap size={17} />
            </span>
            <div className="leading-tight">
              <div className="font-display text-[14px] font-bold tracking-wide text-white">ТКП·Про</div>
              <div className="text-[9px] font-semibold tracking-widest text-darkmute uppercase">прототип · итерация А.3 + А.6</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge tone="accent"><ShieldCheck size={11} /> УЗИП: классы I–III + автомат</Badge>
            <span className="hidden rounded-md bg-dark2 px-2.5 py-1 text-[11px] font-bold text-darkmute sm:block">
              Султанов С.А. · админ
            </span>
          </div>
        </div>
      </header>

      {/* ---------- рабочая область ---------- */}
      <main className="mx-auto grid max-w-6xl gap-4 px-5 py-6 lg:grid-cols-[360px_1fr]">
        {/* карточка проекта + экономика */}
        <section className="anim-rise flex flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-line bg-card shadow-sm">
            <div className="border-b border-line bg-dark px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="num font-mono text-[11px] font-bold tracking-wide text-darkmute">{project.number}</span>
                <Badge tone="warn">{STATUS_LABEL[project.status]}</Badge>
              </div>
              <h1 className="mt-1 text-[15px] leading-snug font-bold text-white">{project.title}</h1>
              <div className="mt-0.5 text-[11px] text-darkmute">{project.client}</div>
            </div>
            <div className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-mute">Направление</span>
                <Badge tone="steel">{DIRECTIONS[project.direction].short}</Badge>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-mute">Шкафов / позиций</span>
                <span className="num font-mono font-bold text-ink">{project.cabinets.length} / {posCount}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-mute">Наценка / работы</span>
                <span className="num font-mono font-bold text-ink">{fmtNum(project.markup)} % / +{fmtNum(project.workMarkup)} %</span>
              </div>
              <div className="mt-1 flex items-end justify-between border-t border-line pt-2.5">
                <div>
                  <div className="text-[9.5px] font-bold tracking-widest text-mute uppercase">Итог с НДС {fmtNum(project.vatRate)} %</div>
                  <div key={calc.totalVat} className="num anim-pop font-mono text-[22px] leading-tight font-extrabold text-ink">
                    {fmtMoney(calc.totalVat)}
                  </div>
                </div>
                <div className="text-right text-[10.5px] leading-snug text-mute">
                  оборудование {fmtMoney(calc.eqSell)}<br />работы {fmtMoney(calc.laborSell)}
                </div>
              </div>
              <Btn className="mt-2 w-full" onClick={() => setWizardOpen(true)}>
                <Wand size={15} /> Открыть мастер подбора
              </Btn>
            </div>
          </div>

          {/* ставки тарифов — источник для шага «Работы» */}
          <div className="rounded-xl border border-line bg-card px-4 py-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-wide text-mute uppercase">
              <Layers size={13} className="text-steel" /> Тарифы нормо-часов (А.6)
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([["Сборка", RATES.production], ["Проект", RATES.design], ["ППО", RATES.software]] as const).map(([label, v]) => (
                <div key={label} className="rounded-lg bg-paper px-2.5 py-2 text-center transition-transform duration-150 hover:-translate-y-0.5">
                  <div className="text-[9.5px] font-bold tracking-wide text-mute uppercase">{label}</div>
                  <div className="num font-mono text-[13px] font-bold text-ink">{fmtMoney(v)}/ч</div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] leading-snug text-mute">
              Шаг «Работы и ППО» умножает нормо-часы на эти ставки и показывает стоимость в продаже с наценкой {fmtNum(project.workMarkup)} %.
            </p>
          </div>
        </section>

        {/* структура проекта */}
        <section className="anim-rise rounded-xl border border-line bg-card shadow-sm" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <Boxes size={15} className="text-accent" /> Структура проекта
            </div>
            <span className="num font-mono text-[11px] font-bold text-mute">{posCount} {plural(posCount, "позиция", "позиции", "позиций")}</span>
          </div>

          {project.cabinets.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-paper text-mute"><Boxes size={22} /></div>
              <div className="mt-3 text-[13px] font-bold text-ink2">Структура пуста</div>
              <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-mute">Откройте мастер подбора — собранный шкаф появится здесь вместе с позициями и часами работ.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {project.cabinets.map((cab) => {
                const c = calc.cabs.find((x) => x.cab.id === cab.id);
                return (
                  <article key={cab.id} className="border-b border-line/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-paper/50">
                    <header className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-dark px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">{cab.kind}</span>
                      <h2 className="text-[13px] font-bold text-ink">{cab.name}</h2>
                      <span className="ml-auto flex items-center gap-2">
                        <Badge tone="steel">{cab.hours + cab.designHours + cab.softwareHours} ч работ</Badge>
                        <span className="num font-mono text-[13px] font-bold text-ink">{fmtMoney(c?.total ?? 0)}</span>
                      </span>
                    </header>
                    <ul className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                      {cab.items.map((it) => (
                        <li key={it.id} className="flex items-baseline justify-between gap-3 border-b border-dotted border-line/70 py-0.5 text-[11.5px]">
                          <span className="truncate text-ink2">{it.name}</span>
                          <span className={cx(
                            "num font-mono font-bold whitespace-nowrap",
                            it.eqId === "uzp-backup" ? "text-ok" : "text-ink",
                          )}>
                            {it.qty} {it.unit}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {cab.items.some((i) => i.eqId === "uzp-backup") && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-ok">
                        <ShieldCheck size={12} /> Резервный автомат УЗИП заложен автоматически
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {project.cabinets.length > 0 && (
            <button
              onClick={() => setWizardOpen(true)}
              className="group flex w-full cursor-pointer items-center justify-center gap-2 border-t border-line px-4 py-3 text-[12px] font-bold text-steel transition-colors hover:bg-steel-soft"
            >
              Добавить ещё шкаф мастером <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          )}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 pb-8">
        <p className="text-center text-[10.5px] text-mute">
          Прототип шагов А.3 «УЗИП» и А.6 «Работы и ППО» · ветка <span className="font-mono font-bold">feature/wizard-uzip-work</span> · полный мастер — в основной ветке проекта
        </p>
      </footer>

      {wizardOpen && (
        <Wizard
          project={project}
          rates={RATES}
          onClose={() => setWizardOpen(false)}
          onCreate={handleCreate}
          onToast={toast}
        />
      )}

      {/* тосты */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cx(
            "anim-rise pointer-events-auto rounded-lg border px-3.5 py-2.5 text-[12px] font-bold shadow-lg",
            t.kind === "ok" ? "border-ok/30 bg-ok-soft text-ok" : "border-heat/30 bg-heat-soft text-heat",
          )}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
