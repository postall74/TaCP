import { useStore, DEFAULT_SETTINGS } from "../store";
import type { Rates } from "../types";
import { fmtMoney } from "../utils";
import { Btn, NumInput } from "./ui";
import { IcClock, IcRefresh } from "./icons";

/* ============================================================
   ТАРИФЫ: ставки чел·часов по ролям. Используются для
   себестоимости работ (ФОТ), расчёта по производству в Excel
   и строки «Сборка/Проектирование/ПО» в экономике проекта.
   ============================================================ */

const ROLE_META: { key: keyof Rates; title: string; desc: string }[] = [
  { key: "design", title: "Проектирование", desc: "Схемы, чертежи, спецификации, кабельные журналы" },
  { key: "production", title: "Производство (сборка)", desc: "Сборка шкафов, монтаж аппаратов, ошиновка, маркировка" },
  { key: "software", title: "Программирование", desc: "ППО для ПЛК, панелей оператора, серверов и SCADA" },
  { key: "smr", title: "СМР / шеф-монтаж", desc: "Монтаж на объекте, руководство монтажной бригадой" },
  { key: "pnr", title: "ПНР", desc: "Пусконаладка, испытания, сдача заказчику" },
];

export default function RatesPage() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const rates = settings.rates;

  const set = (key: keyof Rates, v: number) =>
    updateSettings({ rates: { ...rates, [key]: Math.max(0, v) } });

  return (
    <div className="pb-10">
      <div className="anim-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-warn" />
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-mute uppercase">
              Нормо-часы · себестоимость и маржинальность
            </span>
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Тарифы на работы</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] text-mute">
            Ставки 1 чел·часа по ролям. По ним считается <b className="text-ink2">себестоимость работ (ФОТ)</b> каждого
            шкафа из часов «сборка / проектирование / ПО», а в Excel-вкладке «Расчёт» и «Бюджет» — полная экономика
            проекта: наценка, маржинальный доход и рентабельность.
          </p>
        </div>
        <Btn
          variant="outline"
          size="sm"
          onClick={() => {
            updateSettings({ rates: { ...DEFAULT_SETTINGS.rates } });
            toast("Ставки сброшены к типовым");
          }}
        >
          <IcRefresh size={14} /> Типовые ставки
        </Btn>
      </div>

      <div className="anim-up mt-6 grid max-w-4xl grid-cols-1 gap-3 md:grid-cols-2" style={{ animationDelay: "80ms" }}>
        {ROLE_META.map((r, i) => (
          <div
            key={r.key}
            className="anim-up flex items-center gap-4 rounded-xl border border-line bg-card p-4 transition-all hover:border-line2 hover:shadow-md hover:shadow-dark/5"
            style={{ animationDelay: `${100 + i * 60}ms` }}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dark text-white">
              <IcClock size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-bold text-ink">{r.title}</div>
              <div className="text-[11.5px] leading-snug text-mute">{r.desc}</div>
            </div>
            <div className="text-right">
              <NumInput value={rates[r.key]} step={50} onChange={(v) => set(r.key, v)} className="w-24 text-right" />
              <div className="mt-1 font-mono text-[10.5px] font-semibold text-mute">₽ / чел·час</div>
            </div>
          </div>
        ))}
      </div>

      <div className="anim-up mt-5 max-w-4xl rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink2" style={{ animationDelay: "200ms" }}>
        <b>Как это работает:</b> у каждого шкафа задаются часы сборки, проектирования и разработки ПО (шапка шкафа в
        структуре). Пример: 16 ч сборки × {fmtMoney(rates.production)} + 8 ч проекта × {fmtMoney(rates.design)} = ФОТ{" "}
        {fmtMoney(16 * rates.production + 8 * rates.design)}. Стоимость работ в продаже = ФОТ × (1 + «Наценка на
        работы» из параметров проекта).
      </div>
    </div>
  );
}
