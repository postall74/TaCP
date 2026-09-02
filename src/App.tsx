import { useMemo } from "react";
import { useStore } from "./store";
import CabinetConfigurator from "./components/CabinetConfigurator";
import { IcBox, IcCable, IcInfo, IcLayers, IcLock, IcShield } from "./components/icons";
import { plural } from "./utils";

/* ============================================================
   ОБОЛОЧКА ПРИЛОЖЕНИЯ «Шкаф·Про» — конфигуратор пустых и
   преднаполненных шкафов с заказными шифрами (Б.1).
   ============================================================ */

export default function App() {
  const templates = useStore((s) => s.templates);
  const catalog = useStore((s) => s.catalog);
  const toasts = useStore((s) => s.toasts);
  const dismissToast = useStore((s) => s.dismissToast);

  const prefilled = useMemo(() => templates.filter((t) => t.fillItems.length > 0).length, [templates]);
  const kitPositions = useMemo(
    () => templates.reduce((s, t) => s + t.kit.length + t.fillItems.length, 0),
    [templates],
  );

  return (
    <div className="flex min-h-screen bg-paper font-sans text-ink">
      {/* ================= сайдбар ================= */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-dark md:flex">
        {/* логотип */}
        <div className="flex items-center gap-3 border-b border-darkline px-5 py-5">
          <span className="anim-scale flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-white shadow-lg shadow-accent/30">
            <IcLayers size={19} />
          </span>
          <div>
            <div className="font-display text-[14px] font-bold tracking-wide text-white">ШКАФ·ПРО</div>
            <div className="text-[9.5px] font-semibold tracking-widest text-darkmute uppercase">конструктор корпусов</div>
          </div>
        </div>

        {/* навигация */}
        <nav className="px-3 pt-4">
          <div className="px-2 text-[9.5px] font-bold tracking-widest text-darkmute uppercase">Раздел Б.1</div>
          <a className="group relative mt-2 flex cursor-pointer items-center gap-2.5 rounded-lg bg-dark2 px-3 py-2.5 text-[12.5px] font-bold text-white">
            <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-accent" />
            <IcLayers size={15} />
            Конфигуратор шкафов
          </a>
          <div className="mt-1.5 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] font-semibold text-darkmute/70" title="Появится в следующих шагах дорожной карты">
            <IcBox size={15} />
            Вставка в ТКП
            <span className="ml-auto rounded bg-darkline px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide uppercase">скоро</span>
          </div>
        </nav>

        {/* памятка по заказным шифрам */}
        <div className="mx-3 mt-5 rounded-xl border border-darkline bg-dark2/70 p-3.5">
          <div className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-widest text-darkmute uppercase">
            <IcLock size={11} /> Заказные шифры
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5 font-mono text-[10.5px] text-darkmute">
            <div><span className="rounded bg-darkline px-1.5 py-0.5 font-bold text-white">ШН</span> — шкаф напольный</div>
            <div><span className="rounded bg-darkline px-1.5 py-0.5 font-bold text-white">ШВ</span> — шкаф навесной</div>
            <div><span className="rounded bg-darkline px-1.5 py-0.5 font-bold text-white">-П</span> — преднаполненный</div>
            <div className="pt-1 text-[9.5px] leading-relaxed text-darkmute/80">
              ШН-2000.800.600-IP54-П = напольный 2000×800×600, IP54, с АВ на микроклимат/освещение
            </div>
          </div>
        </div>

        {/* живая статистика */}
        <div className="mx-3 mt-3 grid grid-cols-3 gap-1.5 text-center">
          {[
            { n: templates.length, l: plural(templates.length, "шаблон", "шаблона", "шаблонов") },
            { n: prefilled, l: "преднаполн." },
            { n: kitPositions, l: "позиций" },
          ].map((x) => (
            <div key={x.l} className="rounded-lg border border-darkline bg-dark2/70 px-1 py-2">
              <div className="font-mono text-[15px] leading-none font-bold text-accent">{x.n}</div>
              <div className="mt-1 text-[8px] font-bold tracking-wide text-darkmute uppercase">{x.l}</div>
            </div>
          ))}
        </div>

        <div className="mt-auto border-t border-darkline px-5 py-4">
          <div className="text-[11px] font-bold text-white">ЗАО «Эталон-Прибор»</div>
          <div className="mt-0.5 text-[9.5px] leading-relaxed text-darkmute">
            г. Челябинск, пр. Победы, 288<br />+7 (351) 267-47-10
          </div>
        </div>
      </aside>

      {/* ================= контент ================= */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* верхняя полоса */}
        <header className="blueprint-dark sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-darkline bg-dark px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white md:hidden"><IcLayers size={14} /></span>
          <span className="font-mono text-[11px] font-semibold text-darkmute">
            дорожная карта · <span className="text-white">Б.1</span> · конфигуратор пустых и преднаполненных шкафов
          </span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-darkline bg-dark2 px-2.5 py-1 text-[10px] font-bold text-darkmute">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
            </span>
            локальный режим · {catalog.length} поз. в справочнике
          </span>
        </header>

        <main className="blueprint min-h-0 flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <CabinetConfigurator />
          </div>
        </main>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-card px-6 py-2.5 text-[10.5px] text-mute">
          <span className="flex items-center gap-1.5"><IcShield size={12} /> Часы сборки каждого изделия включаются в его стоимость</span>
          <span className="flex items-center gap-1.5"><IcCable size={12} /> Преднаполнение: АВ на микроклимат и освещение</span>
          <span className="flex items-center gap-1.5"><IcInfo size={12} /> Данные хранятся в этом браузере</span>
        </footer>
      </div>

      {/* ================= тосты ================= */}
      <div className="pointer-events-none fixed top-14 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className={
              "toast-in pointer-events-auto flex cursor-pointer items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-left text-[12px] leading-snug font-semibold shadow-lg backdrop-blur " +
              (t.kind === "err"
                ? "border-heat/40 bg-heat-soft/95 text-heat"
                : t.kind === "info"
                  ? "border-steel/40 bg-steel-soft/95 text-steel"
                  : "border-ok/40 bg-ok-soft/95 text-ok")
            }
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
            {t.msg}
          </button>
        ))}
      </div>
    </div>
  );
}
