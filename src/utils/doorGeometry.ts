import type {
  CabinetDoorGeometry,
  CabinetDoorLeafGeometry,
  CabinetDoorLayout,
} from "../types";

export const DOOR_GEOMETRY_SCHEMA = "cabinet-door-geometry-v1" as const;

export const isDoorGeometryV1 = (value: unknown): value is CabinetDoorGeometry => {
  if (!value || typeof value !== "object") return false;
  const geometry = value as Partial<CabinetDoorGeometry>;
  return geometry.schema === DOOR_GEOMETRY_SCHEMA &&
    geometry.units === "mm" && geometry.view === "outside-front" &&
    Array.isArray(geometry.leaves) && geometry.leaves.every((leaf) => {
      if (!leaf || typeof leaf !== "object" || !leaf.placement || typeof leaf.placement !== "object") return false;
      return [leaf.door, leaf.originXmm, leaf.originYmm, leaf.widthMm, leaf.heightMm,
        leaf.placement.leftMm, leaf.placement.topMm, leaf.placement.widthMm, leaf.placement.heightMm]
        .every((field) => typeof field === "number" && Number.isFinite(field));
    });
};

export const cloneDoorGeometry = (geometry: CabinetDoorGeometry): CabinetDoorGeometry => ({
  ...geometry,
  leaves: geometry.leaves.map((leaf) => ({ ...leaf, placement: { ...leaf.placement } })),
});

const isIntegerIn = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;

const overlaps = (a: CabinetDoorLeafGeometry, b: CabinetDoorLeafGeometry) =>
  a.originXmm < b.originXmm + b.widthMm &&
  b.originXmm < a.originXmm + a.widthMm &&
  a.originYmm < b.originYmm + b.heightMm &&
  b.originYmm < a.originYmm + a.heightMm;

/** Возвращает первую ошибку wire-контракта или null. */
export const validateDoorGeometry = (
  geometry: CabinetDoorGeometry,
  layout?: CabinetDoorLayout,
): string | null => {
  if (geometry.leaves.length !== 1 && geometry.leaves.length !== 2)
    return "Укажите одно или два дверных полотна.";

  const sorted = [...geometry.leaves].sort((a, b) => a.door - b.door);
  for (let index = 0; index < sorted.length; index += 1) {
    const leaf = sorted[index];
    if (leaf.door !== index) return "Индексы полотен должны идти подряд от 0.";
    if (!isIntegerIn(leaf.originXmm, 0, 10000) || !isIntegerIn(leaf.originYmm, 0, 10000))
      return `Полотно ${index + 1}: начало должно быть целым числом от 0 до 10000 мм.`;
    if (!isIntegerIn(leaf.widthMm, 1, 10000) || !isIntegerIn(leaf.heightMm, 1, 10000))
      return `Полотно ${index + 1}: размеры должны быть целыми числами от 1 до 10000 мм.`;
    if (leaf.originXmm + leaf.widthMm > 10000 || leaf.originYmm + leaf.heightMm > 10000)
      return `Полотно ${index + 1} выходит за техническое поле 10000 × 10000 мм.`;

    const p = leaf.placement;
    if (!isIntegerIn(p.leftMm, 0, 10000) || !isIntegerIn(p.topMm, 0, 10000))
      return `Полотно ${index + 1}: отступы области должны быть целыми числами от 0 до 10000 мм.`;
    if (!isIntegerIn(p.widthMm, 1, 10000) || !isIntegerIn(p.heightMm, 1, 10000))
      return `Полотно ${index + 1}: размеры области должны быть целыми числами от 1 до 10000 мм.`;
    if (p.leftMm + p.widthMm > leaf.widthMm || p.topMm + p.heightMm > leaf.heightMm)
      return `Полотно ${index + 1}: область размещения должна целиком находиться внутри полотна.`;
  }

  if (sorted.length === 2 && overlaps(sorted[0], sorted[1]))
    return "Дверные полотна не должны перекрываться.";
  if (layout && layout.doorCount !== sorted.length)
    return `Число полотен (${sorted.length}) не совпадает с компоновкой (${layout.doorCount}).`;
  return null;
};

export const doorElementCenterMm = (
  leaf: CabinetDoorLeafGeometry,
  point: Pick<CabinetDoorLayout["elements"][number], "x" | "y">,
) => ({
  x: leaf.originXmm + leaf.placement.leftMm + point.x * leaf.placement.widthMm / 1000,
  y: leaf.originYmm + leaf.placement.topMm + point.y * leaf.placement.heightMm / 1000,
});

export const formatDoorMm = (value: number) => value.toFixed(1).replace(".", ",");
