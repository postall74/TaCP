import type { CSSProperties } from "react";
import type { Cabinet, CabinetDoorGeometry, CabinetDoorLayout } from "../types";
import { doorElementCenterMm, formatDoorMm } from "../utils/doorGeometry";
import { DOOR_KIND_LABEL } from "../utils/doorLayout";

const cell: CSSProperties = { border: "1px solid #777", padding: "4px 6px", fontSize: 10.5, verticalAlign: "top" };
const head: CSSProperties = { ...cell, background: "#f1f1f1", fontWeight: 700, textAlign: "left" };

const markerCalloutOffset = (x: number, y: number) => ({
  x: x >= 800 ? -18 : 18,
  y: y <= 200 ? 30 : -18,
});

export function DoorDimensionDrawing({ cabinet, layout, geometry, index }: {
  cabinet: Cabinet;
  layout: CabinetDoorLayout;
  geometry: CabinetDoorGeometry;
  index: number;
}) {
  const leaves = [...geometry.leaves].sort((a, b) => a.door - b.door);
  const maxX = Math.max(...leaves.map((leaf) => leaf.originXmm + leaf.widthMm));
  const maxY = Math.max(...leaves.map((leaf) => leaf.originYmm + leaf.heightMm));
  const plot = { x: 72, y: 54, w: 536, h: 465 };
  const scale = Math.min(plot.w / Math.max(1, maxX), plot.h / Math.max(1, maxY));
  const offsetX = plot.x + (plot.w - maxX * scale) / 2;
  const offsetY = plot.y + (plot.h - maxY * scale) / 2;
  const sx = (mm: number) => offsetX + mm * scale;
  const sy = (mm: number) => offsetY + mm * scale;
  const centers = layout.elements.map((element, elementIndex) => {
    const leaf = leaves.find((candidate) => candidate.door === element.door)!;
    return { element, position: elementIndex + 1, center: doorElementCenterMm(leaf, element) };
  });

  return <section className="door-drawing-sheet">
    <h3 style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 700 }}>
      Приложение В.{index + 1}. Размерный вид дверцы — {cabinet.name}
    </h3>
    <p style={{ margin: "0 0 8px", fontSize: 10.5, color: "#555" }}>
      Вид спереди снаружи · начало общей системы координат — левый верхний угол · X вправо, Y вниз · единицы: мм
    </p>

    <div className="door-drawing-figure">
      <svg width="100%" viewBox="0 0 680 560" style={{ display: "block", maxHeight: 560 }} aria-label={`Размерный вид дверцы ${cabinet.name}`}>
        <defs>
          <marker id={`door-arrow-${cabinet.id}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#111" />
          </marker>
        </defs>
        <line x1={plot.x - 28} y1={plot.y - 20} x2={plot.x + 22} y2={plot.y - 20} stroke="#111" markerEnd={`url(#door-arrow-${cabinet.id})`} />
        <line x1={plot.x - 28} y1={plot.y - 20} x2={plot.x - 28} y2={plot.y + 30} stroke="#111" markerEnd={`url(#door-arrow-${cabinet.id})`} />
        <text x={plot.x + 27} y={plot.y - 15} fontSize={10} fill="#111">X</text>
        <text x={plot.x - 38} y={plot.y + 42} fontSize={10} fill="#111">Y</text>
        <text x={plot.x - 38} y={plot.y - 25} fontSize={9} fill="#555">0</text>

        {leaves.map((leaf) => {
          const placementX = leaf.originXmm + leaf.placement.leftMm;
          const placementY = leaf.originYmm + leaf.placement.topMm;
          return <g key={leaf.door}>
            <rect x={sx(leaf.originXmm)} y={sy(leaf.originYmm)} width={leaf.widthMm * scale} height={leaf.heightMm * scale}
              fill="#fafafa" stroke="#111" strokeWidth={1.5} />
            <rect x={sx(placementX)} y={sy(placementY)} width={leaf.placement.widthMm * scale} height={leaf.placement.heightMm * scale}
              fill="none" stroke="#666" strokeWidth={1} strokeDasharray="6 4" />
            <text x={sx(leaf.originXmm) + 6} y={sy(leaf.originYmm) + 15} fontSize={10} fontWeight={700} fill="#111">
              Полотно {leaf.door + 1} · {leaf.widthMm} × {leaf.heightMm}
            </text>
            <text x={sx(placementX) + 5} y={sy(placementY) + 14} fontSize={8.5} fill="#555">
              Область {leaf.placement.widthMm} × {leaf.placement.heightMm}; отступ {leaf.placement.leftMm} / {leaf.placement.topMm}
            </text>
          </g>;
        })}

        {centers.map(({ element, position, center }) => {
          const markerX = sx(center.x);
          const markerY = sy(center.y);
          const calloutOffset = markerCalloutOffset(element.x, element.y);
          const calloutX = markerX + calloutOffset.x;
          const calloutY = markerY + calloutOffset.y;
          return <g key={element.id}>
            <line x1={markerX - 8} y1={markerY} x2={markerX + 8} y2={markerY} stroke="#111" strokeWidth={1} />
            <line x1={markerX} y1={markerY - 8} x2={markerX} y2={markerY + 8} stroke="#111" strokeWidth={1} />
            <circle cx={markerX} cy={markerY} r={4} fill="#fff" stroke="#111" />
            <line x1={markerX} y1={markerY} x2={calloutX} y2={calloutY} stroke="#777" strokeWidth={0.8} />
            <circle cx={calloutX} cy={calloutY} r={9} fill="#fff" stroke="#111" />
            <text x={calloutX} y={calloutY + 3} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#111">{position}</text>
          </g>;
        })}
      </svg>
    </div>

    <table className="door-drawing-table" style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
      <thead>
        <tr>
          <th style={{ ...head, width: 28 }}>№</th>
          <th style={{ ...head, width: 100 }}>Тип</th>
          <th style={head}>Полная подпись</th>
          <th style={{ ...head, width: 55, textAlign: "center" }}>Дверца</th>
          <th style={{ ...head, width: 65, textAlign: "right" }}>X, мм</th>
          <th style={{ ...head, width: 65, textAlign: "right" }}>Y, мм</th>
        </tr>
      </thead>
      <tbody>
        {centers.map(({ element, position, center }) => <tr key={element.id}>
          <td style={cell}>{position}</td>
          <td style={cell}>{DOOR_KIND_LABEL[element.kind]}</td>
          <td style={cell}>{element.label}</td>
          <td style={{ ...cell, textAlign: "center" }}>{element.door + 1}</td>
          <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatDoorMm(center.x)}</td>
          <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatDoorMm(center.y)}</td>
        </tr>)}
        {centers.length === 0 && <tr><td style={{ ...cell, textAlign: "center", color: "#666" }} colSpan={6}>Элементы не размещены.</td></tr>}
      </tbody>
    </table>
    <p style={{ margin: "8px 0 0", padding: "6px 8px", border: "1px solid #777", fontSize: 10.5, fontWeight: 700 }}>
      По введённым данным; не для сверления и изготовления. Размеры отверстий, вырезов и допуски не заданы.
    </p>
  </section>;
}
