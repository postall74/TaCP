import { useStore } from "../store";
import type { Project } from "../types";
import { DIRECTIONS } from "../types";
import { buildDocHtml, calcProject, downloadText, fmtDate, fmtMoney, fmtNum } from "../utils";
import { Btn } from "./ui";
import { IcBolt, IcDownload, IcPrinter } from "./icons";

const td = "border border-[#8a8a8a] px-2 py-[5px] align-top";
const th = "border border-[#8a8a8a] bg-[#efefef] px-2 py-[5px] text-left font-bold";

export default function DocumentTab({ project }: { project: Project }) {
  const settings = useStore((s) => s.settings);
  const toast = useStore((s) => s.toast);
  const calc = calcProject(project);
  const dir = DIRECTIONS[project.direction];

  const exportWord = () => {
    const html = buildDocHtml(project, calc, settings);
    downloadText(`${project.number} — ${project.title}.doc`, html, "application/msword");
    toast("Файл Word (.doc) сформирован");
  };

  return (
    <div>
      {/* панель инструментов */}
      <div className="no-print anim-up mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <div>
          <div className="text-[13px] font-bold text-ink">Предпросмотр документа · А4</div>
          <div className="text-[11.5px] text-mute">
            Шапка и реквизиты подтягиваются из настроек компании · внутренние цены и маржа в документ не попадают
          </div>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" size="sm" onClick={exportWord}>
            <IcDownload size={14} /> Скачать Word (.doc)
          </Btn>
          <Btn size="sm" onClick={() => window.print()}>
            <IcPrinter size={14} /> Печать / PDF
          </Btn>
        </div>
      </div>

      {/* лист */}
      <div className="overflow-x-auto pb-6">
        <div id="doc-print-area" className="doc-paper mx-auto rounded-[3px] p-[13mm_12mm] shadow-2xl shadow-dark/20">
          {/* шапка */}
          <div className="flex items-start justify-between gap-6 border-b-[3px] border-[#141b24] pb-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#f04d14] text-white">
                <IcBolt size={22} />
              </span>
              <div>
                <div className="text-[15.5px] leading-tight font-bold">{settings.companyName}</div>
                <div className="text-[11px] text-[#666]">{settings.tagline}</div>
              </div>
            </div>
            <div className="text-right text-[10px] leading-snug whitespace-pre-line text-[#666]">
              {settings.address}
              {"\n"}тел. {settings.phone} · {settings.email}
              {"\n"}
              {settings.requisites}
            </div>
          </div>

          {/* заголовок */}
          <h1 className="mt-6 mb-0.5 text-center text-[19px] font-bold tracking-tight">
            ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № {project.number}
          </h1>
          <p className="mt-0 mb-4 text-center text-[12px] text-[#666]">
            {dir.full} · «{project.title}»
          </p>

          {/* реквизиты предложения */}
          <table className="mb-2 text-[12px]">
            <tbody>
              <tr>
                <td className="pr-4 py-[1px] text-[#666]">Заказчик:</td>
                <td className="py-[1px] font-bold">
                  {project.client || "—"}
                  {project.contact ? `, ${project.contact}` : ""}
                </td>
              </tr>
              <tr>
                <td className="pr-4 py-[1px] text-[#666]">Дата предложения:</td>
                <td className="py-[1px]">{fmtDate(Date.now())}</td>
              </tr>
              <tr>
                <td className="pr-4 py-[1px] text-[#666]">Действительно:</td>
                <td className="py-[1px]">в течение {project.validDays} календарных дней с даты предложения</td>
              </tr>
            </tbody>
          </table>

          <p className="my-3 text-[12.5px]">
            Настоящим предлагаем поставку, сборку и пусконаладку комплекта оборудования в следующем составе и по
            следующим ценам:
          </p>

          {/* разделы по шкафам */}
          {calc.cabs.length === 0 && (
            <p className="my-6 text-center text-[#999] italic">Структура оборудования пока не заполнена.</p>
          )}

          {calc.cabs.map((cc, ci) => (
            <div key={cc.cab.id} className="mb-1">
              <h3 className="mt-4 mb-1.5 text-[13.5px] font-bold">
                {ci + 1}. {cc.cab.name}{" "}
                <span className="font-normal text-[#666]">({cc.cab.kind})</span>
              </h3>
              <table className="w-full border-collapse text-[11.5px]">
                <thead>
                  <tr>
                    <th className={th + " w-[30px]"}>№</th>
                    <th className={th}>Наименование</th>
                    <th className={th + " w-[64px] text-center"}>Кол-во</th>
                    <th className={th + " w-[40px] text-center"}>Ед.</th>
                    <th className={th + " w-[104px] text-right"}>Цена за ед.</th>
                    <th className={th + " w-[116px] text-right"}>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {cc.cab.items.map((it, ii) => (
                    <tr key={it.id}>
                      <td className={td}>{ii + 1}</td>
                      <td className={td}>
                        {it.name}
                        <div className="text-[10px] text-[#777]">
                          {it.sku} · {it.brand}
                        </div>
                      </td>
                      <td className={td + " text-center"}>{fmtNum(it.qty)}</td>
                      <td className={td + " text-center"}>{it.unit}</td>
                      <td className={td + " text-right"}>{fmtMoney(it.price)}</td>
                      <td className={td + " text-right font-bold"}>{fmtMoney(it.price * it.qty)}</td>
                    </tr>
                  ))}
                  {cc.cab.items.length === 0 && (
                    <tr>
                      <td className={td + " text-center text-[#999]"} colSpan={6}>
                        раздел без позиций
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className={td + " text-right font-bold"} colSpan={5}>
                      Оборудование по разделу {ci + 1}
                      {project.markup > 0 && <span className="font-normal text-[#666]"> (с наценкой {fmtNum(project.markup)} %)</span>}
                    </td>
                    <td className={td + " text-right font-bold"}>{fmtMoney(cc.eqBase + cc.markupSum)}</td>
                  </tr>
                  {cc.cab.hours > 0 && (
                    <tr>
                      <td className={td + " text-right"} colSpan={5}>
                        Сборка и монтаж — {fmtNum(cc.cab.hours)} нормо-ч × {fmtNum(project.hourRate * project.complexity)} ₽/ч
                      </td>
                      <td className={td + " text-right"}>{fmtMoney(cc.work)}</td>
                    </tr>
                  )}
                  <tr className="bg-[#f6f6f6]">
                    <td className={td + " text-right font-bold"} colSpan={5}>
                      Итого по разделу {ci + 1}
                    </td>
                    <td className={td + " text-right font-bold"}>{fmtMoney(cc.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          {/* сводная стоимость */}
          {calc.cabs.length > 0 && (
            <>
              <h3 className="mt-5 mb-1.5 text-[13.5px] font-bold">Сводная стоимость предложения</h3>
              <table className="ml-auto w-[420px] border-collapse text-[12px]">
                <tbody>
                  <tr>
                    <td className={td + " text-right"}>Оборудование</td>
                    <td className={td + " w-[140px] text-right font-bold"}>{fmtMoney(calc.eqBase)}</td>
                  </tr>
                  {project.markup > 0 && (
                    <tr>
                      <td className={td + " text-right"}>Наценка на оборудование ({fmtNum(project.markup)} %)</td>
                      <td className={td + " text-right"}>{fmtMoney(calc.markupSum)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className={td + " text-right"}>Сборка, монтаж и пусконаладка</td>
                    <td className={td + " text-right"}>{fmtMoney(calc.work)}</td>
                  </tr>
                  {project.discount > 0 && (
                    <tr>
                      <td className={td + " text-right"}>Скидка ({fmtNum(project.discount)} %)</td>
                      <td className={td + " text-right"}>− {fmtMoney(calc.discountSum)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className={td + " text-right"}>{project.vat ? "НДС 20 %" : "НДС"}</td>
                    <td className={td + " text-right"}>{project.vat ? fmtMoney(calc.vatSum) : "не облагается"}</td>
                  </tr>
                  <tr className="bg-[#141b24] text-white">
                    <td className={td + " !border-[#141b24] text-right text-[13px] font-bold"}>
                      ИТОГО{project.vat ? " (с НДС)" : ""}
                    </td>
                    <td className={td + " !border-[#141b24] text-right text-[13px] font-bold"}>{fmtMoney(calc.total)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* условия */}
          {project.notes.trim() && (
            <>
              <h3 className="mt-5 mb-1.5 text-[13.5px] font-bold">Условия предложения</h3>
              <ol className="my-0 list-decimal pl-5 text-[12px]">
                {project.notes
                  .split("\n")
                  .filter((l) => l.trim())
                  .map((l, i) => (
                    <li key={i} className="mb-0.5">
                      {l}
                    </li>
                  ))}
              </ol>
            </>
          )}

          {/* подпись */}
          <p className="mt-9 mb-0 text-[12px]">
            С уважением, {settings.manager}
            <br />
            {settings.companyName} · тел. {settings.phone} · {settings.email}
          </p>
          <div className="mt-10 flex justify-between">
            <div className="w-[220px] border-t border-[#141b24] pt-1 text-center text-[10.5px] text-[#666]">подпись</div>
            <div className="w-[220px] border-t border-[#141b24] pt-1 text-center text-[10.5px] text-[#666]">М. П.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
