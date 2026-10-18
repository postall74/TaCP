import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useStore } from "../store";
import type {
  Cabinet,
  CabinetDoorElement,
  CabinetDoorElementKind,
  CabinetDoorLampTone,
  CabinetDoorLayout,
} from "../types";
import {
  DOOR_KIND_LABEL,
  DOOR_TONE_COLOR,
  cloneDoorLayout,
  defaultDoorPlacement,
  emptyDoorLayout,
  isDoorLayoutV1,
  normalizeDoorElement,
} from "../utils/doorLayout";
import { Btn, Modal, cx } from "./ui";

const DOOR = { w: 230, h: 450, y: 25, gap: 30, x0: 25 };
const CANVAS_H = 500;

const defaultLabel: Record<CabinetDoorElementKind, string> = {
  lamp: "Лампа",
  button: "Кнопка",
  selector: "Режим",
  "start-stop-pair": "Пуск / Стоп",
  "emergency-stop": "Аварийный стоп",
};

const idPrefix: Record<CabinetDoorElementKind, string> = {
  lamp: "lamp",
  button: "btn",
  selector: "sel",
  "start-stop-pair": "pair",
  "emergency-stop": "stop",
};

const nextElementId = (layout: CabinetDoorLayout, kind: CabinetDoorElementKind) => {
  const used = new Set(layout.elements.map((element) => element.id));
  const prefix = idPrefix[kind];
  let index = 0;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};

export function DoorLayoutCanvas({
  layout,
  onChange,
  allowElementChanges = true,
  allowDoorCountChange = true,
}: {
  layout: CabinetDoorLayout;
  onChange: (layout: CabinetDoorLayout) => void;
  allowElementChanges?: boolean;
  allowDoorCountChange?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [doorError, setDoorError] = useState("");
  const width = DOOR.x0 * 2 + layout.doorCount * DOOR.w + (layout.doorCount - 1) * DOOR.gap;
  const selectedElement = layout.elements.find((element) => element.id === selected);

  const canvasPoint = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (width / rect.width),
      y: (event.clientY - rect.top) * (CANVAS_H / rect.height),
    };
  };

  const renderedPoint = (element: CabinetDoorElement) => ({
    x: DOOR.x0 + element.door * (DOOR.w + DOOR.gap) + element.x * DOOR.w / 1000,
    y: DOOR.y + element.y * DOOR.h / 1000,
  });

  const placementAt = (x: number, y: number) => {
    const door = layout.doorCount === 1 || x < DOOR.x0 + DOOR.w + DOOR.gap / 2 ? 0 : 1;
    const doorX = DOOR.x0 + door * (DOOR.w + DOOR.gap);
    return {
      door,
      x: Math.min(950, Math.max(50, Math.round((x - doorX) * 1000 / DOOR.w))),
      y: Math.min(950, Math.max(50, Math.round((y - DOOR.y) * 1000 / DOOR.h))),
    };
  };

  const updateElement = (id: string, patch: Partial<CabinetDoorElement>) =>
    onChange({
      ...layout,
      elements: layout.elements.map((element) =>
        element.id === id ? normalizeDoorElement({ ...element, ...patch }, layout.doorCount) : element
      ),
    });

  const startDrag = (event: ReactPointerEvent<SVGGElement>, element: CabinetDoorElement) => {
    event.stopPropagation();
    setSelected(element.id);
    const pointer = canvasPoint(event);
    const rendered = renderedPoint(element);
    dragRef.current = { id: element.id, dx: rendered.x - pointer.x, dy: rendered.y - pointer.y };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pointer = canvasPoint(event);
    updateElement(drag.id, placementAt(pointer.x + drag.dx, pointer.y + drag.dy));
  };

  const endDrag = () => { dragRef.current = null; };

  const addElement = (kind: CabinetDoorElementKind) => {
    if (layout.elements.length >= 128) return;
    const placement = defaultDoorPlacement(layout.elements.length, layout.doorCount);
    const element: CabinetDoorElement = {
      id: nextElementId(layout, kind),
      kind,
      ...(kind === "lamp" ? { tone: "neutral" as CabinetDoorLampTone } : {}),
      label: defaultLabel[kind],
      ...placement,
    };
    onChange({ ...layout, elements: [...layout.elements, element] });
    setSelected(element.id);
  };

  const setDoorCount = (doorCount: 1 | 2) => {
    if (doorCount === layout.doorCount) return;
    if (doorCount === 1 && layout.elements.some((element) => element.door === 1)) {
      setDoorError("Сначала перенесите элементы второй дверцы на первую.");
      return;
    }
    setDoorError("");
    onChange({ ...layout, doorCount });
  };

  return (
    <div className="rounded-lg border border-line bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold tracking-wide text-mute uppercase">Компоновка дверцы</div>
          <div className="mt-0.5 text-[11px] text-mute">Координаты сохраняются внутри выбранной дверцы.</div>
        </div>
        <div className="flex items-center gap-1.5">
          {allowDoorCountChange && ([1, 2] as const).map((count) => (
            <button key={count} type="button" onClick={() => setDoorCount(count)}
              className={cx("rounded-md border px-2.5 py-1 text-[11px] font-bold",
                layout.doorCount === count ? "border-accent bg-accent-soft text-accent-deep" : "border-line text-mute hover:border-line2")}
            >{count} {count === 1 ? "дверца" : "дверцы"}</button>
          ))}
          <button type="button" onClick={() => onChange({
            ...layout,
            elements: layout.elements.map((element, index) => ({
              ...element,
              ...defaultDoorPlacement(index, layout.doorCount),
            })),
          })} className="rounded-md border border-line px-2.5 py-1 text-[11px] font-bold text-mute hover:border-heat hover:text-heat">
            Авторасстановка
          </button>
        </div>
      </div>
      {doorError && <div className="mt-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[11.5px] text-ink2">{doorError}</div>}

      <div className="mt-3 flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1 rounded-lg bg-dark2/40 p-2">
          <svg ref={svgRef} width="100%" viewBox={`0 0 ${width} ${CANVAS_H}`}
            style={{ display: "block", maxHeight: 470 }} onPointerMove={moveDrag}
            onPointerUp={endDrag} onPointerLeave={endDrag}
            onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            onPointerDown={() => setSelected(null)}>
            <defs>
              <linearGradient id="doorLayoutSteel" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#3d4a59" /><stop offset="0.5" stopColor="#4c5a6b" /><stop offset="1" stopColor="#37434f" />
              </linearGradient>
            </defs>
            {Array.from({ length: layout.doorCount }, (_, door) => {
              const x = DOOR.x0 + door * (DOOR.w + DOOR.gap);
              return <g key={door}>
                <rect x={x} y={DOOR.y} width={DOOR.w} height={DOOR.h} rx={9} fill="#222b35" stroke="#141b24" strokeWidth={1.5} />
                <rect x={x + 9} y={DOOR.y + 9} width={DOOR.w - 18} height={DOOR.h - 18} rx={6} fill="url(#doorLayoutSteel)" stroke="#2c3742" />
                <text x={x + DOOR.w / 2} y={DOOR.y + 18} textAnchor="middle" fontSize={9} fill="#8b98a9">Дверца {door + 1}</text>
              </g>;
            })}
            {layout.elements.map((element) => {
              const point = renderedPoint(element);
              const isSelected = selected === element.id;
              const labelY = layout.labelSide === "below" ? point.y + 27 : point.y - 22;
              return <g key={element.id} style={{ cursor: "grab" }} onPointerDown={(event) => startDrag(event, element)}>
                {isSelected && <rect x={point.x - 24} y={point.y - 24} width={48} height={48} rx={10} fill="rgba(37,99,235,.12)" stroke="#60a5fa" strokeDasharray="4 3" />}
                <circle cx={point.x} cy={point.y} r={20} fill="transparent" />
                {element.kind === "lamp" && <circle cx={point.x} cy={point.y} r={10} fill={DOOR_TONE_COLOR[element.tone ?? "neutral"]} stroke="#141b24" strokeWidth={1.3} />}
                {element.kind === "button" && <rect x={point.x - 11} y={point.y - 11} width={22} height={22} rx={5} fill="#141b24" stroke="#738196" />}
                {element.kind === "selector" && <><rect x={point.x - 12} y={point.y - 12} width={24} height={24} rx={4} fill="#eceef1" stroke="#141b24" /><text x={point.x} y={point.y + 3} textAnchor="middle" fontSize={8} fill="#141b24">I·0·II</text></>}
                {element.kind === "emergency-stop" && <><rect x={point.x - 16} y={point.y - 16} width={32} height={32} rx={5} fill="#f7edd8" stroke="#a8770e" /><circle cx={point.x} cy={point.y} r={11} fill="#ce4432" stroke="#8f2f22" /></>}
                {element.kind === "start-stop-pair" && <><circle cx={point.x - 12} cy={point.y} r={9} fill="#1f8a5b" stroke="#141b24" /><circle cx={point.x + 12} cy={point.y} r={9} fill="#ce4432" stroke="#141b24" /></>}
                <text x={point.x} y={labelY} textAnchor="middle" fontSize={9} fontWeight={600} fill="#e6ebf2" stroke="#141b24" strokeWidth={2.5} style={{ paintOrder: "stroke" }}>
                  {element.label.length > 18 ? `${element.label.slice(0, 17)}…` : element.label}
                </text>
              </g>;
            })}
            {layout.elements.length === 0 && <text x={width / 2} y={CANVAS_H / 2} textAnchor="middle" fontSize={11} fill="#8b98a9">Компоновка пока пуста</text>}
          </svg>
        </div>

        <div className="w-full shrink-0 lg:w-64">
          {selectedElement ? <div className="rounded-lg border border-line bg-paper p-3">
            <div className="text-[10px] font-bold tracking-wide text-mute uppercase">{DOOR_KIND_LABEL[selectedElement.kind]}</div>
            <input value={selectedElement.label} maxLength={120} onChange={(event) => updateElement(selectedElement.id, { label: event.target.value })}
              className="mt-1.5 w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12.5px] font-semibold text-ink outline-none focus:border-steel" />
            <div className="mt-3 text-[10px] font-bold tracking-wide text-mute uppercase">Дверца</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {Array.from({ length: layout.doorCount }, (_, door) => <button key={door} type="button" onClick={() => updateElement(selectedElement.id, { door })}
                className={cx("rounded-md border px-2 py-1.5 text-[11px] font-bold", selectedElement.door === door ? "border-accent bg-accent-soft text-accent-deep" : "border-line text-mute")}>№ {door + 1}</button>)}
            </div>
            {selectedElement.kind === "lamp" && <>
              <div className="mt-3 text-[10px] font-bold tracking-wide text-mute uppercase">Цвет</div>
              <select value={selectedElement.tone ?? "neutral"} onChange={(event) => updateElement(selectedElement.id, { tone: event.target.value as CabinetDoorLampTone })}
                className="mt-1.5 w-full rounded-md border border-line bg-card px-2 py-1.5 text-[12px] text-ink">
                <option value="neutral">Нейтральный</option><option value="green">Зелёный</option><option value="amber">Жёлтый</option><option value="red">Красный</option>
              </select>
            </>}
            {allowElementChanges && <button type="button" onClick={() => {
              onChange({ ...layout, elements: layout.elements.filter((element) => element.id !== selectedElement.id) });
              setSelected(null);
            }} className="mt-3 w-full rounded-md border border-heat/40 px-2 py-1.5 text-[11px] font-bold text-heat hover:bg-heat-soft">Удалить из эскиза</button>}
          </div> : <div className="rounded-lg border border-dashed border-line2 p-3 text-[11.5px] leading-relaxed text-mute">Выберите элемент на дверце, чтобы изменить подпись и дверцу.</div>}

          <div className="mt-3 text-[10px] font-bold tracking-wide text-mute uppercase">Подписи</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {(["below", "above"] as const).map((side) => <button key={side} type="button" onClick={() => onChange({ ...layout, labelSide: side })}
              className={cx("rounded-md border px-2 py-1.5 text-[11px] font-bold", layout.labelSide === side ? "border-accent bg-accent-soft text-accent-deep" : "border-line text-mute")}>{side === "below" ? "Снизу" : "Сверху"}</button>)}
          </div>
        </div>
      </div>

      {allowElementChanges && <div className="mt-3 border-t border-line pt-3">
        <div className="text-[10px] font-bold tracking-wide text-mute uppercase">Добавить элемент</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(DOOR_KIND_LABEL) as CabinetDoorElementKind[]).map((kind) => <button key={kind} type="button" onClick={() => addElement(kind)} disabled={layout.elements.length >= 128}
            className="rounded-md border border-line px-2.5 py-1.5 text-[11px] font-bold text-ink2 hover:border-accent hover:text-accent-deep disabled:opacity-40">{DOOR_KIND_LABEL[kind]}</button>)}
        </div>
      </div>}
    </div>
  );
}

export function DoorLayoutModal({ projectId, cabinet, onClose }: { projectId: string; cabinet: Cabinet; onClose: () => void }) {
  const saveLayout = useStore((state) => state.saveCabinetDoorLayout);
  const toast = useStore((state) => state.toast);
  const unsupportedSchema = cabinet.doorLayout && !isDoorLayoutV1(cabinet.doorLayout) ? cabinet.doorLayout.schema : null;
  const [draft, setDraft] = useState<CabinetDoorLayout | null>(() => isDoorLayoutV1(cabinet.doorLayout) ? cloneDoorLayout(cabinet.doorLayout) : null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    const ok = await saveLayout(projectId, cabinet.id, draft);
    setBusy(false);
    if (!ok) return;
    toast("Компоновка дверцы сохранена");
    onClose();
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await saveLayout(projectId, cabinet.id, null);
    setBusy(false);
    if (!ok) return;
    toast("Компоновка дверцы очищена", "info");
    onClose();
  };

  return <Modal open onClose={busy ? () => undefined : onClose} title={`Компоновка дверцы · ${cabinet.name}`} w="max-w-5xl"
    footer={<>
      {isDoorLayoutV1(cabinet.doorLayout) && <Btn variant="outline" onClick={clear} disabled={busy}>Очистить</Btn>}
      <Btn variant="outline" onClick={onClose} disabled={busy}>Отмена</Btn>
      {!unsupportedSchema && <Btn onClick={save} disabled={!draft || busy}>{busy ? "Сохранение…" : "Сохранить"}</Btn>}
    </>}>
    {unsupportedSchema ? <div className="rounded-xl border border-warn/40 bg-warn-soft px-6 py-10 text-center">
      <div className="text-[13px] font-bold text-ink">Компоновка создана в новой версии</div>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-ink2">Схема «{unsupportedSchema}» открыта только для чтения. Обновите приложение, чтобы редактировать или очищать её.</p>
    </div> : draft ? <DoorLayoutCanvas layout={draft} onChange={setDraft} /> : <div className="rounded-xl border border-dashed border-line2 bg-paper/60 px-6 py-10 text-center">
      <div className="text-[13px] font-bold text-ink">Компоновка не задана</div>
      <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-mute">Legacy-шкаф открыт без попытки угадать расположение по спецификации. Создайте пустой эскиз и добавьте нужные элементы вручную.</p>
      <Btn className="mt-4" onClick={() => setDraft(emptyDoorLayout())}>Создать компоновку</Btn>
    </div>}
  </Modal>;
}
