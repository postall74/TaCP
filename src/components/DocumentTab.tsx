import { useMemo, useState, type CSSProperties } from "react";
import { useStore } from "../store";
import type { Project } from "../types";
import { DIRECTIONS } from "../types";
import { calcProject, downloadText, fmtDate, fmtMoney, fmtNum } from "../utils";
import { Btn, Toggle } from "./ui";
import { IcBolt, IcDownload, IcPrinter } from "./icons";

/* ============================================================
   ВКЛАДКА «ДОКУМЕНТ»: предпросмотр листа А4 (шрифт PT Serif),
   приложения (перечень автоматизации, структурная схема),
   экспорт в Word (.doc сериализацией DOM — единый источник с
   предпросмотром) и печать/PDF через диалог браузера.
   Все табличные стили — inline, чтобы Word их сохранил.
   ============================================================ */

const AUTO_CATS = ["ПЛК и модули", "Панели оператора", "Датчики", "Сетевое оборудование", "Серверы и ПО"];

const tdS: CSSProperties = { border: "1px solid #8a8a8a", padding: "5px 8px", fontSize: 12, verticalAlign: "top" };
const thS: CSSProperties = { ...tdS, background: "#efefef", fontWeight: 700, textAlign: "left" };

export default function DocumentTab({ project }: { project: Project }) {
  const settings = useStore((s) => s.settings);
  const catalog = useStore((s) => s.catalog);
  const toast = useStore((s) => s.toast);
  const calc = calcProject(project, useStore.getState().settings.rates);
  const dir = DIRECTIONS[project.direction];

  const autoItems = useMemo(() => {
    const map = new Map<string, (typeof catalog)[number]>();
    for (const e of catalog) map.set(e.id, e);
    return calc.cabs
      .map((cc) => ({
        cab: cc.cab,
        items: cc.cab.items.filter((i) => {
          const cat = map.get(i.eqId)?.category;
          return cat ? AUTO_CATS.includes(cat) : false;
        }),
      }))
      .filter((x) => x.items.length > 0);
  }, [calc, catalog]);

  const hasPlc = autoItems.length > 0;
  const [appSignals, setAppSignals] = useState(true);
  const [appScheme, setAppScheme] = useState(true);

  const exportWord = () => {
    const inner = document.getElementById("doc-print-area")?.innerHTML ?? "";
    const full = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${project.number} — ${project.title}</title>
<style>body{font-family:'Times New Roman',Times,serif;font-size:12.5px;color:#171717;line-height:1.45;margin:24px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #8a8a8a;padding:5px 8px;font-size:12px}
h1{font-size:19px}h3{font-size:13.5px}</style></head><body>${inner}</body></html>`;
    downloadText(`${project.number} — ${project.title}.doc`, full, "application/msword");
    toast("Файл Word (.doc) сформирован");
  };

  return (
    <div>
      {/* -------- панель инструментов -------- */}
      <div className="no-print anim-up mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">Предпросмотр документа · А4</div>
          <div className="text-[11.5px] text-mute">Шапка — из реквизитов компании · внутренние цены и маржа в документ не попадают</div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
            <Toggle on={appSignals} onChange={setAppSignals} label="Приложение А · перечень автоматизации" />
            <Toggle on={appScheme && hasPlc} onChange={(v) => hasPlc && setAppScheme(v)} label={hasPlc ? "Приложение Б · структурная схема" : "Структурная схема (нет ПЛК)"} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Btn variant="outline" size="sm" onClick={exportWord}>
            <IcDownload size={14} /> Word (.doc)
          </Btn>
          <Btn size="sm" onClick={() => window.print()}>
            <IcPrinter size={14} /> Печать / PDF
          </Btn>
        </div>
      </div>

      {/* -------- лист -------- */}
      <div className="overflow-x-auto pb-6">
        <div id="doc-print-area" className="doc-paper mx-auto rounded-[3px] p-[13mm_12mm] shadow-2xl shadow-dark/20">
          {/* шапка */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, borderBottom: "3px solid #141b24", paddingBottom: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ display: "inline-flex", width: 40, height: 40, borderRadius: 6, background: "#f04d14", color: "#fff", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IcBolt size={22} />
              </span>
              <div>
                <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.2 }}>{settings.companyName}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{settings.tagline}</div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 10, color: "#666", whiteSpace: "pre-line", lineHeight: 1.45 }}>
              {settings.address}
              {"\n"}тел. {settings.phone} · {settings.email}
              {"\n"}
              {settings.requisites}
            </div>
          </div>

          <h1 style={{ textAlign: "center", fontSize: 19, margin: "22px 0 2px", fontWeight: 700 }}>
            ТЕХНИКО-КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № {project.number}
          </h1>
          <p style={{ textAlign: "center", fontSize: 12, color: "#666", margin: "0 0 14px" }}>
            {dir.full} · «{project.title}»
          </p>

          <table style={{ border: "none", width: "auto", marginBottom: 6 }}>
            <tbody>
              <tr>
                <td style={{ border: "none", padding: "1px 16px 1px 0", color: "#666" }}>Заказчик:</td>
                <td style={{ border: "none", padding: "1px 0", fontWeight: 700 }}>
                  {project.client || "—"}
                  {project.contact ? `, ${project.contact}` : ""}
                </td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "1px 16px 1px 0", color: "#666" }}>Дата предложения:</td>
                <td style={{ border: "none", padding: "1px 0" }}>{fmtDate(Date.now())}</td>
              </tr>
              <tr>
                <td style={{ border: "none", padding: "1px 16px 1px 0", color: "#666" }}>Действительно:</td>
                <td style={{ border: "none", padding: "1px 0" }}>в течение {project.validDays} календарных дней</td>
              </tr>
            </tbody>
          </table>

          <p style={{ fontSize: 12.5, margin: "10px 0" }}>
            Настоящим предлагаем поставку, сборку и пусконаладку комплекта оборудования в следующем составе:
          </p>

          {calc.cabs.length === 0 && <p style={{ textAlign: "center", color: "#999", fontStyle: "italic", margin: "24px 0" }}>Структура оборудования пока не заполнена.</p>}

          {/* -------- разделы по шкафам -------- */}
          {calc.cabs.map((cc, ci) => (
            <div key={cc.cab.id}>
              <h3 style={{ margin: "16px 0 6px", fontSize: 13.5, fontWeight: 700 }}>
                {ci + 1}. {cc.cab.name} <span style={{ fontWeight: 400, color: "#666" }}>({cc.cab.kind})</span>
              </h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, width: 30 }}>№</th>
                    <th style={thS}>Наименование</th>
                    <th style={{ ...thS, width: 62, textAlign: "center" }}>Кол-во</th>
                    <th style={{ ...thS, width: 40, textAlign: "center" }}>Ед.</th>
                    <th style={{ ...thS, width: 104, textAlign: "right" }}>Цена за ед.</th>
                    <th style={{ ...thS, width: 116, textAlign: "right" }}>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {cc.cab.items.map((it, ii) => (
                    <tr key={it.id}>
                      <td style={tdS}>{ii + 1}</td>
                      <td style={tdS}>
                        {it.name}
                        <div style={{ fontSize: 10, color: "#777" }}>{it.sku} · {it.brand}</div>
                      </td>
                      <td style={{ ...tdS, textAlign: "center" }}>{fmtNum(it.qty)}</td>
                      <td style={{ ...tdS, textAlign: "center" }}>{it.unit}</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(it.price)}</td>
                      <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }}>{fmtMoney(it.price * it.qty)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }} colSpan={5}>
                      Оборудование по разделу {ci + 1}
                      {project.markup > 0 && <span style={{ fontWeight: 400, color: "#666" }}> (с наценкой {fmtNum(project.markup)} %)</span>}
                    </td>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }}>{fmtMoney(cc.eqBase + cc.markupSum)}</td>
                  </tr>
                  {project.showWorkLines && cc.laborSell > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }} colSpan={5}>
                        Работы: сборка {fmtNum(cc.cab.hours)} ч{cc.cab.designHours > 0 && `, проектирование ${fmtNum(cc.cab.designHours)} ч`}
                        {cc.cab.softwareHours > 0 && `, ППО ${fmtNum(cc.cab.softwareHours)} ч`}
                      </td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(cc.laborSell)}</td>
                    </tr>
                  )}
                  <tr style={{ background: "#f6f6f6" }}>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }} colSpan={5}>Итого по разделу {ci + 1}</td>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }}>{fmtMoney(cc.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          {/* -------- сводная стоимость -------- */}
          {calc.cabs.length > 0 && (
            <>
              <h3 style={{ margin: "18px 0 6px", fontSize: 13.5, fontWeight: 700 }}>Сводная стоимость предложения</h3>
              <table style={{ width: 440, marginLeft: "auto", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ ...tdS, textAlign: "right" }}>Оборудование</td>
                    <td style={{ ...tdS, width: 150, textAlign: "right", fontWeight: 700 }}>{fmtMoney(calc.eqBase)}</td>
                  </tr>
                  {project.markup > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }}>Наценка на оборудование ({fmtNum(project.markup)} %)</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(calc.markupSum)}</td>
                    </tr>
                  )}
                  {!project.showWorkLines && calc.laborSell > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }}>Сборка, проектирование и ППО</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(calc.laborSell)}</td>
                    </tr>
                  )}
                  {project.smrSell > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }}>Шеф-монтажные работы</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(project.smrSell)}</td>
                    </tr>
                  )}
                  {project.pnrSell > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }}>Пусконаладочные работы</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(project.pnrSell)}</td>
                    </tr>
                  )}
                  {calc.transportSum > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }}>Доставка до объекта заказчика ({fmtNum(project.transportPct)} %)</td>
                      <td style={{ ...tdS, textAlign: "right" }}>{fmtMoney(calc.transportSum)}</td>
                    </tr>
                  )}
                  {project.discount > 0 && (
                    <tr>
                      <td style={{ ...tdS, textAlign: "right" }}>Скидка ({fmtNum(project.discount)} %)</td>
                      <td style={{ ...tdS, textAlign: "right" }}>− {fmtMoney(calc.discountSum)}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ ...tdS, textAlign: "right" }}>{project.vatRate > 0 ? `НДС ${fmtNum(project.vatRate)} %` : "НДС"}</td>
                    <td style={{ ...tdS, textAlign: "right" }}>{project.vatRate > 0 ? fmtMoney(calc.vatSum) : "не облагается"}</td>
                  </tr>
                  <tr style={{ background: "#141b24", color: "#fff" }}>
                    <td style={{ ...tdS, borderColor: "#141b24", textAlign: "right", fontSize: 13, fontWeight: 700 }}>
                      ИТОГО{project.vatRate > 0 ? " (с НДС)" : ""}
                    </td>
                    <td style={{ ...tdS, borderColor: "#141b24", textAlign: "right", fontSize: 13, fontWeight: 700 }}>{fmtMoney(calc.total)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* -------- условия -------- */}
          {project.notes.trim() && (
            <>
              <h3 style={{ margin: "18px 0 6px", fontSize: 13.5, fontWeight: 700 }}>Условия предложения</h3>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                {project.notes.split("\n").filter((l) => l.trim()).map((l, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{l}</li>
                ))}
              </ol>
            </>
          )}

          <p style={{ fontSize: 12, margin: "30px 0 0" }}>
            С уважением, {settings.manager}
            <br />
            {settings.companyName} · тел. {settings.phone} · {settings.email}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 36, gap: 20 }}>
            <div style={{ width: 200, borderTop: "1px solid #141b24", paddingTop: 3, textAlign: "center", fontSize: 10.5, color: "#666" }}>подпись</div>
            <div style={{ width: 200, borderTop: "1px solid #141b24", paddingTop: 3, textAlign: "center", fontSize: 10.5, color: "#666" }}>
              исполнитель: {settings.executor || "—"}
            </div>
            <div style={{ width: 200, borderTop: "1px solid #141b24", paddingTop: 3, textAlign: "center", fontSize: 10.5, color: "#666" }}>М. П.</div>
          </div>

          {/* -------- Приложение А: автоматизация -------- */}
          {appSignals && hasPlc && (
            <>
              <h3 style={{ margin: "30px 0 6px", fontSize: 13.5, fontWeight: 700 }}>Приложение А. Перечень оборудования автоматизации и сигналов</h3>
              {autoItems.map(({ cab, items }) => (
                <div key={cab.id} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, margin: "6px 0 3px" }}>{cab.name}</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...thS, width: 26 }}>№</th>
                        <th style={thS}>Наименование</th>
                        <th style={{ ...thS, width: 120 }}>Артикул</th>
                        <th style={{ ...thS, width: 60, textAlign: "center" }}>Кол-во</th>
                        <th style={{ ...thS, width: 150 }}>Тип сигнала / примечание</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, ii) => (
                        <tr key={it.id}>
                          <td style={tdS}>{ii + 1}</td>
                          <td style={tdS}>{it.name}</td>
                          <td style={tdS}>{it.sku}</td>
                          <td style={{ ...tdS, textAlign: "center" }}>{fmtNum(it.qty)}</td>
                          <td style={tdS}>{signalHint(it.name)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </>
          )}

          {/* -------- Приложение Б: структурная схема -------- */}
          {appScheme && hasPlc && (
            <>
              <h3 style={{ margin: "26px 0 6px", fontSize: 13.5, fontWeight: 700 }}>Приложение Б. Структурная схема системы</h3>
              <SchemeSvg cabs={calc.cabs.map((c) => ({ name: c.cab.name, kind: c.cab.kind }))} />
              <p style={{ fontSize: 10.5, color: "#666", margin: "6px 0 0" }}>
                Связь — промышленный Ethernet (резервирование по запросу). Схема предварительная и уточняется на стадии РД.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Подсказка по типу сигнала из названия модуля. */
function signalHint(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("дискретных входов")) return "DI, 24 В";
  if (n.includes("дискретных выходов")) return "DO, реле";
  if (n.includes("аналоговых входов")) return "AI, 4-20 мА / 0-10 В";
  if (n.includes("аналоговых выходов")) return "AO, 4-20 мА";
  if (n.includes("контроллер")) return "CPU, Ethernet/RS-485";
  if (n.includes("панель")) return "HMI, Ethernet";
  if (n.includes("коммутатор")) return "Ethernet 10/100";
  if (n.includes("датчик давления")) return "AI, 4-20 мА";
  if (n.includes("датчик температуры")) return "AI, Pt100";
  if (n.includes("сервер")) return "SCADA / БД";
  return "—";
}

/** Простейшая структурная схема: шкафы-узлы и линии связи. */
function SchemeSvg({ cabs }: { cabs: { name: string; kind: string }[] }) {
  const W = 190;
  const total = 20 + cabs.length * W + 10;
  const tone = (kind: string) =>
    /плк|асу|it/i.test(kind) ? "#1f8a5b" : /св|связ/i.test(kind) ? "#2e5fa3" : /обогрев|щуо/i.test(kind) ? "#ce4432" : "#141b24";
  return (
    <svg width="100%" viewBox={`0 0 ${total} 110`} style={{ maxWidth: total, display: "block" }}>
      {cabs.map((c, i) => {
        const x = 15 + i * W;
        const fill = tone(c.kind);
        const short = c.name.length > 26 ? c.name.slice(0, 25) + "…" : c.name;
        return (
          <g key={i}>
            {i > 0 && (
              <>
                <line x1={x - 30} y1={42} x2={x - 6} y2={42} stroke="#8a8a8a" strokeWidth={1.5} />
                <path d={`M ${x - 12} 38 L ${x - 5} 42 L ${x - 12} 46 Z`} fill="#8a8a8a" />
              </>
            )}
            <rect x={x} y={18} width={160} height={50} rx={4} fill="#fff" stroke={fill} strokeWidth={2} />
            <rect x={x} y={18} width={160} height={7} rx={2} fill={fill} />
            <text x={x + 80} y={46} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#171717">{short}</text>
            <text x={x + 80} y={60} textAnchor="middle" fontSize={9} fill="#666">{c.kind}</text>
          </g>
        );
      })}
    </svg>
  );
}
