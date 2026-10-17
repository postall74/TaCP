import { useEffect, useState } from "react";
import { useStore, DEFAULT_SETTINGS } from "../store";
import type { Rates } from "../types";
import { fmtMoney } from "../utils";
import { Btn, NumInput } from "./ui";
import { IcClock, IcRefresh } from "./icons";
import { can, denyReason } from "../utils/roles";

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
  const canEdit = can(user, "rates.edit");
  const [draft, setDraft] = useState<Rates>(() => ({ ...settings.rates }));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft({ ...settings.rates }), [settings.rates]);

  const set = (key: keyof Rates, v: number) =>
    setDraft((rates) => ({ ...rates, [key]: Math.max(0, v) }));

  const persist = async (rates: Rates, success: string) => {
    if (saving) return;
    setSaving(true);
    try {
      if (!await saveRates(rates)) return;
      toast(success);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не удалось сохранить ставки", "err");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const defaults = { ...DEFAULT_SETTINGS.rates };
    setDraft(defaults);
    void persist(defaults, "Ставки сброшены к типовым");
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
        {canEdit && (
          <div className="flex gap-2">
            <Btn variant="outline" size="sm" disabled={saving} onClick={reset}>
              <IcRefresh size={14} /> Типовые ставки
            </Btn>
            <Btn size="sm" disabled={saving} onClick={() => void persist(draft, "Ставки сохранены")}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Btn>
          </div>
        )}
      </div>

      {!canEdit && (
        <div className="mt-5 max-w-4xl rounded-lg border border-line bg-paper/60 px-3 py-2 text-[11.5px] leading-relaxed text-mute">
          {denyReason(user, "rates.edit")}. Ставки доступны только для чтения.
        </div>
      )}

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
              {canEdit ? (
                <NumInput value={draft[r.key]} step={50} onChange={(v) => set(r.key, v)} className="w-24 text-right" />
              ) : (
                <input
                  type="number"
                  readOnly
                  aria-readonly="true"
                  value={draft[r.key]}
                  className="h-9 w-24 rounded-md border border-line bg-line/20 px-3 text-right font-mono text-[13px] font-semibold tabular-nums text-mute outline-none"
                />
              )}
              <div className="mt-1 font-mono text-[10.5px] font-semibold text-mute">₽ / чел·час</div>
            </div>
          </div>
        ))}
      </div>

      <div className="anim-up mt-5 max-w-4xl rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink2" style={{ animationDelay: "200ms" }}>
        <b>Как это работает:</b> у каждого шкафа задаются часы сборки, проектирования и разработки ПО (шапка шкафа в
        структуре). Пример: 16 ч сборки × {fmtMoney(draft.production)} + 8 ч проекта × {fmtMoney(draft.design)} = ФОТ{" "}
        {fmtMoney(16 * draft.production + 8 * draft.design)}. Стоимость работ в продаже = ФОТ × (1 + «Наценка на
        работы» из параметров проекта).
      </div>
    </div>
  );
}
