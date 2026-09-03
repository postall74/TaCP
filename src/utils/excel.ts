import * as XLSX from "xlsx";
import type { Project, Settings } from "../types";
import type { ProjCalc } from "../utils";

/* ============================================================
   ВЫГРУЗКА В EXCEL (.xlsx, библиотека SheetJS).
   Книга состоит из вкладок:
     • по одной на каждый шкаф (спецификация);
     • «ИТОГО» — сводка по шкафам (часы, себестоимость, продажа);
     • «Расчёт» — расчёт по производству (форма заказчика);
     • «Бюджет» — бюджет проекта.
   ============================================================ */

const r2 = (n: number) => Math.round(n * 100) / 100;

const sheetName = (s: string) =>
  s.replace(/[\\/:*?"[\]]/g, "").trim().slice(0, 29) || "Лист";

export function exportProjectXlsx(project: Project, calc: ProjCalc, settings: Settings) {
  const wb = XLSX.utils.book_new();

  /* Цена продажи для заказчика = закупка × (1 + наценка%). Наценка применяется один раз. */
  const sellUnit = (purchase: number) => purchase * (1 + project.markup / 100);

  /* ---------- вкладки шкафов ---------- */
  calc.cabs.forEach((cc, i) => {
    const rows: (string | number)[][] = [
      ["№", "Наименование", "Артикул", "Бренд", "Кол-во", "Ед.", "Цена за ед., ₽", "Сумма, ₽"],
      ...cc.cab.items.map((it, ii) => [ii + 1, it.name, it.sku, it.brand, it.qty, it.unit, r2(sellUnit(it.purchase)), r2(sellUnit(it.purchase) * it.qty)]),
      [],
      ["", "", "", "", "", "", "Оборудование (с наценкой):", r2(cc.eqBase + cc.markupSum)],
      ["", "", "", "", "", "", "Работы (сборка + проект + ПО):", r2(cc.laborSell)],
      ["", "", "", "", "", "", "Итого по шкафу:", r2(cc.total)],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 4 }, { wch: 54 }, { wch: 20 }, { wch: 16 }, { wch: 7 }, { wch: 6 }, { wch: 30 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName(`${i + 1}. ${cc.cab.name}`));
  });

  /* ---------- вкладка ИТОГО ---------- */
  {
    const rows: (string | number)[][] = [
      ["ИТОГО по проекту", project.number, "", project.title],
      ["Заказчик:", project.client],
      [],
      ["Шкаф", "Тип", "Позиций", "Сборка, ч", "Проект, ч", "ПО, ч", "Чел·ч всего", "Себестоимость, ₽", "Продажа, ₽"],
      ...calc.cabs.map((cc) => [
        cc.cab.name, cc.cab.kind, cc.cab.items.length, cc.cab.hours, cc.cab.designHours, cc.cab.softwareHours,
        cc.cab.hours + cc.cab.designHours + cc.cab.softwareHours,
        r2(cc.eqCost + cc.laborCost), r2(cc.total),
      ]),
      [
        "ИТОГО", "", calc.posCount,
        calc.cabs.reduce((s, c) => s + c.cab.hours, 0),
        calc.cabs.reduce((s, c) => s + c.cab.designHours, 0),
        calc.cabs.reduce((s, c) => s + c.cab.softwareHours, 0),
        r2(calc.laborHours), r2(calc.eqCost + calc.laborCost), r2(calc.cabinetsSell),
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 40 }, { wch: 16 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 11 }, { wch: 17 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, "ИТОГО");
  }

  /* ---------- вкладка «Расчёт по производству» ---------- */
  {
    const rates = settings.rates;
    const head1 = ["Расчет по производству"];
    const head2: (string | number)[][] = [
      ["*поля для заполнения", "", "", "Стоимость 1 чел*час, Проектирование", r2(rates.design)],
      ["", "", "", "Стоимость 1 чел*час, Производство", r2(rates.production)],
      ["", "", "", "Стоимость 1 чел*час, Программирование", r2(rates.software)],
    ];
    const cols = [
      "№", "Наименование", "Кол-во",
      "Стоимость оборудования и материалов",
      `Транспортно-заготовительные работы (${project.tzzPct}% от стоимости оборудования)`,
      "Стоимость услуг сторонних организаций",
      "Проектирование", "Производство", "ПО", "Фонд оплаты труда",
      "Дополнительные затраты", "Суммарная плановая себестоимость",
      `Непредвиденные затраты (% от плановой стоимости)`, "Непредвиденные затраты",
      "Себестоимость за 1 шт", "Стоимость продажи за 1 шт",
      "Себестоимость суммарно", "Стоимость продажи суммарно",
      "Маржинальный доход", "Наценка", "Ожидаемая рентабельность",
    ];
    const units = [
      "", "", "шт", "руб. без НДС", "руб. без НДС", "руб. без НДС",
      "(чел/час)", "(чел/час)", "(чел/час)", "руб.", "руб. без НДС", "руб. без НДС",
      "%", "руб. без НДС", "руб. без НДС", "руб. без НДС", "руб. без НДС", "руб. без НДС",
      "руб.", "%", "%",
    ];

    const tzz = (eqCost: number) => r2(eqCost * (project.tzzPct / 100));
    const row = (
      n: number | "", name: string, qty: number, eqCost: number, third: number,
      dh: number, ph: number, sh: number, fot: number, extra: number, sell: number
    ) => {
      const planned = r2(eqCost + tzz(eqCost) + third + fot + extra);
      const unf = r2(planned * (project.unforeseenPct / 100));
      const cost = r2(planned + unf);
      const margin = r2(sell - cost);
      return [
        n, name, qty, r2(eqCost), tzz(eqCost), r2(third), dh, ph, sh, r2(fot), r2(extra),
        planned, `${project.unforeseenPct.toFixed(2)}%`, unf, cost, r2(sell), cost, r2(sell),
        margin, cost > 0 ? `${((margin / cost) * 100).toFixed(1)}%` : "0%",
        sell > 0 ? `${((margin / sell) * 100).toFixed(1)}%` : "0%",
      ];
    };

    const dataRows = calc.cabs.map((cc, i) =>
      row(
        i + 1, cc.cab.name, 1, cc.eqCost, i === 0 ? project.thirdParty : 0,
        cc.cab.designHours, cc.cab.hours, cc.cab.softwareHours, cc.laborCost,
        i === 0 ? project.extraCosts : 0, cc.total
      )
    );
    if (project.smrCost > 0 || project.smrSell > 0)
      dataRows.push(row(dataRows.length + 1, "Шеф-монтажные работы", 1, project.smrCost, 0, 0, 0, 0, 0, 0, project.smrSell));
    if (project.pnrCost > 0 || project.pnrSell > 0)
      dataRows.push(row(dataRows.length + 1, "Пуско-наладочные работы", 1, project.pnrCost, 0, 0, 0, 0, 0, 0, project.pnrSell));

    const sum = (idx: number) => r2(dataRows.reduce((s, r) => s + (Number(r[idx]) || 0), 0));
    const sumCost = sum(14); // себестоимость суммарно
    const sumSell = sum(15); // продажа суммарно
    const sumMargin = r2(sumSell - sumCost);
    const vat = project.vatRate / 100;

    const tail: (string | number)[][] = [
      [
        "", "", "", sum(3), sum(4), sum(5), sum(6), sum(7), sum(8), sum(9), sum(10), sum(11),
        `${project.unforeseenPct.toFixed(2)}%`, sum(13), sumCost, sumSell, "", "", "", "", "",
      ],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Итого:", r2(sumCost), r2(sumSell), "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", `НДС, ${project.vatRate}%:`, r2(sumCost * vat), r2(sumSell * vat), "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Итого с НДС:", r2(sumCost * (1 + vat)), r2(sumSell * (1 + vat)), "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Прибыль:", r2(sumMargin), "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Рентабельность:", sumSell > 0 ? `${((sumMargin / sumSell) * 100).toFixed(2)}%` : "0%", "", "", ""],
    ];

    const data: (string | number)[][] = [[head1[0]], ...head2, [], cols, units, ...dataRows, ...tail];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!cols"] = [
      { wch: 4 }, { wch: 40 }, { wch: 6 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
      { wch: 12 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 },
      { wch: 15 }, { wch: 16 }, { wch: 16 }, { wch: 17 }, { wch: 15 }, { wch: 10 }, { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Расчёт");
  }

  /* ---------- вкладка «Бюджет» ---------- */
  {
    const rates = settings.rates;
    const base = calc.plannedCost - calc.unforeseenSum;
    const rows: (string | number)[][] = [
      ["Бюджет проекта"],
      [],
      ["Проект:", `${project.number} — ${project.title}`],
      ["Контрагент:", project.client || "—"],
      ["Заказ покупателя:", ""],
      ["Руководитель проекта:", settings.manager],
      [],
      ["", "Стоимость 1 чел*час, Проектирование", r2(rates.design)],
      ["", "Стоимость 1 чел*час, СМР", r2(rates.smr)],
      ["", "Стоимость 1 чел*час, ПНР", r2(rates.pnr)],
      ["", "Стоимость 1 чел*час, Производство", r2(rates.production)],
      [],
      ["", "Себестоимость"],
      ["", "Стоимость оборудования и материалов", r2(calc.eqCost), "руб. без НДС"],
      ["", `Транспортно-заготовительные работы (${project.tzzPct}% от стоимости оборудования)`, r2(calc.tzzSum), "руб. без НДС"],
      ["", "Стоимость услуг сторонних организаций", r2(project.thirdParty), "руб. без НДС"],
      ["", "Трудозатраты", r2(calc.laborHours), "Чел*час"],
      ["", "Фонд оплаты труда", r2(calc.laborCost), "Руб."],
      ["", "Командировочные расходы", r2(project.tripCosts), "руб."],
      ["", "Суммарная плановая себестоимость:", r2(base), "руб. без НДС"],
      ["", "Непредвиденные затраты", `${project.unforeseenPct.toFixed(2)}%`, "%"],
      ["", "Непредвиденные затраты", r2(calc.unforeseenSum), "руб. без НДС"],
      ["", "Итого:", r2(calc.plannedCost), "руб. без НДС"],
      [],
      ["", "Стоимость продажи и рентабельность"],
      ["", "Стоимость продажи", r2(calc.afterDiscount), "руб. без НДС"],
      ["", "Маржинальный доход", r2(calc.profit), "руб."],
      ["", "Наценка", `${calc.markupPct.toFixed(2)}%`],
      ["", "Ожидаемая рентабельность", `${calc.marginPct.toFixed(2)}%`],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 58 }, { wch: 15 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Бюджет");
  }

  XLSX.writeFile(wb, `${project.number} — расчёт и бюджет.xlsx`);
}
