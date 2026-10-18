import type {
  CabinetDoorElement,
  CabinetDoorElementKind,
  CabinetDoorLampTone,
  CabinetDoorLayout,
} from "../types";

export const DOOR_LAYOUT_SCHEMA = "cabinet-door-layout-v1" as const;

export const DOOR_KIND_LABEL: Record<CabinetDoorElementKind, string> = {
  lamp: "Лампа",
  button: "Кнопка",
  selector: "Переключатель",
  "start-stop-pair": "Пуск / Стоп",
  "emergency-stop": "Аварийный стоп",
};

export const DOOR_TONE_COLOR: Record<CabinetDoorLampTone, string> = {
  green: "#1f8a5b",
  amber: "#a8770e",
  red: "#ce4432",
  neutral: "#6f7b8b",
};

const clamp = (value: number, min = 0, max = 1000) =>
  Math.min(max, Math.max(min, Math.round(value)));

export const defaultDoorPlacement = (index: number, doorCount: 1 | 2) => {
  const perDoor = 24;
  const door = Math.min(doorCount - 1, Math.floor(index / perDoor));
  const local = index % perDoor;
  return {
    door,
    x: 150 + (local % 4) * 230,
    y: Math.min(900, 130 + Math.floor(local / 4) * 145),
  };
};

export const normalizeDoorElement = (element: CabinetDoorElement, doorCount: 1 | 2): CabinetDoorElement => ({
  ...element,
  door: Math.min(doorCount - 1, Math.max(0, Math.round(element.door))),
  x: clamp(element.x),
  y: clamp(element.y),
  label: element.label.slice(0, 120),
  ...(element.kind === "lamp" ? { tone: element.tone ?? "neutral" } : { tone: undefined }),
});

export const emptyDoorLayout = (): CabinetDoorLayout => ({
  schema: DOOR_LAYOUT_SCHEMA,
  doorCount: 1,
  labelSide: "below",
  elements: [],
});

export const cloneDoorLayout = (layout: CabinetDoorLayout): CabinetDoorLayout => ({
  ...layout,
  elements: layout.elements.map((element) => ({ ...element })),
});

export const isDoorLayoutV1 = (value: unknown): value is CabinetDoorLayout => {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<CabinetDoorLayout>;
  return layout.schema === DOOR_LAYOUT_SCHEMA &&
    (layout.doorCount === 1 || layout.doorCount === 2) &&
    (layout.labelSide === "above" || layout.labelSide === "below") &&
    Array.isArray(layout.elements);
};
