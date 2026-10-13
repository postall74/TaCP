import { useEffect, useRef, useState } from "react";
import { useStore, DEFAULT_SETTINGS } from "../store";
import type { Rates } from "../types";
import { fmtMoney } from "../utils";
import { can, denyReason } from "../utils/roles";
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
  const user = useStore((s) => s.user);
  const saveRates = useStore((s) => s.saveRates);
  const toast = useStore((s) => s.toast);
  const [draft, setDraft] = useState<Rates>({ ...settings.rates });
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const editable = can(user, "rates.edit");
  const readOnlyReason = denyReason(user, "rates.edit");
  const dirty = ROLE_META.some(({ key }) => draft[key] !== settings.rates[key]);

  useEffect(() => setDraft({ ...settings.rates }), [settings.rates]);

  const set = (key: keyof Rates, value: number) =>
    setDraft((rates) => ({ ...rates, [key]: Math.max(0, value) }));

  const persist = async (rates: Rates, reset = false) => {
    if (saveInFlight.current || !editable) return;
    saveInFlight.current = true;
    setSaving(true);
    try {
      await saveRates(rates);
      toast(reset ? "Ставки сброшены к типовым" : "Тарифы сохранены");
    } catch {
      // Store показывает причину; черновик остаётся доступен для повтора.
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  };

  const reset = () => {
    const defaults = { ...DEFAULT_SETTINGS.rates };
    setDraft(defaults);
    void persist(defaults, true);
  };

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Btn
            variant="outline"
            size="sm"
            disabled={!editable || saving}
            title={editable ? "Вернуть типовые ставки" : readOnlyReason}
            onClick={reset}
          >
            <IcRefresh size={14} /> Типовые ставки
          </Btn>
          <Btn
            size="sm"
            disabled={!editable || saving || !dirty}
            title={editable ? "Сохранить тарифы" : readOnlyReason}
            onClick={() => void persist(draft)}
          >
            {saving ? "Сохранение…" : "Сохранить тарифы"}
          </Btn>
        </div>
      </div>

      {!editable && (
        <div className="mt-5 max-w-4xl rounded-xl border border-line2 bg-card px-4 py-3 text-[12.5px] text-mute" role="status">
          {readOnlyReason}. Текущие значения доступны только для просмотра.
        </div>
      )}

      <fieldset disabled={!editable || saving} title={!editable ? readOnlyReason : undefined}>
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
                <NumInput value={draft[r.key]} min={0} step={50} onChange={(v) => set(r.key, v)} className="w-24 text-right" />
                <div className="mt-1 font-mono text-[10.5px] font-semibold text-mute">₽ / чел·час</div>
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {editable && dirty && !saving && (
        <div className="mt-3 max-w-4xl text-right text-[11.5px] font-semibold text-warn" role="status">
          Есть несохранённые изменения
        </div>
      )}

      <div className="anim-up mt-5 max-w-4xl rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink2" style={{ animationDelay: "200ms" }}>
        <b>Как это работает:</b> у каждого шкафа задаются часы сборки, проектирования и разработки ПО (шапка шкафа в
        структуре). Пример: 16 ч сборки × {fmtMoney(draft.production)} + 8 ч проекта × {fmtMoney(draft.design)} = ФОТ{" "}
        {fmtMoney(16 * draft.production + 8 * draft.design)}. Стоимость работ в продаже = ФОТ × (1 + «Наценка на
        работы» из параметров проекта).
      </div>
    </div>
  );
}
