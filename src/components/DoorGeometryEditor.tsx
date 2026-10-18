import { useMemo, useState } from "react";
import { useStore } from "../store";
import type { Cabinet, CabinetDoorGeometry, CabinetDoorLeafGeometry } from "../types";
import { cloneDoorGeometry, isDoorGeometryV1, validateDoorGeometry } from "../utils/doorGeometry";
import { isDoorLayoutV1 } from "../utils/doorLayout";
import { Btn, Field, Input, Modal, cx } from "./ui";

type LeafDraft = {
  originXmm: string;
  originYmm: string;
  widthMm: string;
  heightMm: string;
  leftMm: string;
  topMm: string;
  placementWidthMm: string;
  placementHeightMm: string;
};

const emptyLeaf = (): LeafDraft => ({
  originXmm: "", originYmm: "", widthMm: "", heightMm: "",
  leftMm: "", topMm: "", placementWidthMm: "", placementHeightMm: "",
});

const toDraft = (leaf: CabinetDoorLeafGeometry): LeafDraft => ({
  originXmm: String(leaf.originXmm),
  originYmm: String(leaf.originYmm),
  widthMm: String(leaf.widthMm),
  heightMm: String(leaf.heightMm),
  leftMm: String(leaf.placement.leftMm),
  topMm: String(leaf.placement.topMm),
  placementWidthMm: String(leaf.placement.widthMm),
  placementHeightMm: String(leaf.placement.heightMm),
});

const parseInteger = (value: string) => value.trim() === "" ? Number.NaN : Number(value);

const fromDraft = (leaves: LeafDraft[]): CabinetDoorGeometry => ({
  schema: "cabinet-door-geometry-v1",
  units: "mm",
  view: "outside-front",
  leaves: leaves.map((leaf, door) => ({
    door,
    originXmm: parseInteger(leaf.originXmm),
    originYmm: parseInteger(leaf.originYmm),
    widthMm: parseInteger(leaf.widthMm),
    heightMm: parseInteger(leaf.heightMm),
    placement: {
      leftMm: parseInteger(leaf.leftMm),
      topMm: parseInteger(leaf.topMm),
      widthMm: parseInteger(leaf.placementWidthMm),
      heightMm: parseInteger(leaf.placementHeightMm),
    },
  })),
});

export function DoorGeometryModal({ projectId, cabinet, onClose }: {
  projectId: string;
  cabinet: Cabinet;
  onClose: () => void;
}) {
  const saveGeometry = useStore((state) => state.saveCabinetDoorGeometry);
  const toast = useStore((state) => state.toast);
  const stored = isDoorGeometryV1(cabinet.doorGeometry) ? cloneDoorGeometry(cabinet.doorGeometry) : null;
  const unsupportedGeometry = cabinet.doorGeometry && !stored ? cabinet.doorGeometry.schema : null;
  const unsupportedLayout = cabinet.doorLayout && !isDoorLayoutV1(cabinet.doorLayout) ? cabinet.doorLayout.schema : null;
  const layout = isDoorLayoutV1(cabinet.doorLayout) ? cabinet.doorLayout : undefined;
  const initialCount = stored?.leaves.length ?? layout?.doorCount ?? 1;
  const [leaves, setLeaves] = useState<LeafDraft[]>(() =>
    stored ? stored.leaves.map(toDraft) : Array.from({ length: initialCount }, emptyLeaf)
  );
  const [busy, setBusy] = useState(false);
  const geometry = useMemo(() => fromDraft(leaves), [leaves]);
  const validationError = useMemo(() => validateDoorGeometry(geometry, layout), [geometry, layout]);

  const updateLeaf = (index: number, patch: Partial<LeafDraft>) =>
    setLeaves((current) => current.map((leaf, leafIndex) => leafIndex === index ? { ...leaf, ...patch } : leaf));

  const setCount = (count: 1 | 2) => {
    if (layout && count !== layout.doorCount) return;
    setLeaves((current) => count === 1 ? current.slice(0, 1) : [current[0] ?? emptyLeaf(), current[1] ?? emptyLeaf()]);
  };

  const save = async () => {
    if (busy || validationError || unsupportedGeometry || unsupportedLayout) return;
    setBusy(true);
    const ok = await saveGeometry(projectId, cabinet.id, geometry);
    setBusy(false);
    if (!ok) return;
    toast("Размеры дверцы сохранены");
    onClose();
  };

  const clear = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await saveGeometry(projectId, cabinet.id, null);
    setBusy(false);
    if (!ok) return;
    toast("Размеры дверцы очищены", "info");
    onClose();
  };

  return <Modal open onClose={busy ? () => undefined : onClose} title={`Размеры дверцы · ${cabinet.name}`} w="max-w-5xl"
    footer={<>
      {stored && <Btn variant="outline" onClick={clear} disabled={busy}>Очистить</Btn>}
      <Btn variant="outline" onClick={onClose} disabled={busy}>Отмена</Btn>
      {!unsupportedGeometry && !unsupportedLayout && <Btn onClick={save} disabled={busy || Boolean(validationError)}>
        {busy ? "Сохранение…" : "Сохранить"}
      </Btn>}
    </>}>
    {unsupportedGeometry || unsupportedLayout ? <div className="rounded-xl border border-warn/40 bg-warn-soft px-6 py-10 text-center">
      <div className="text-[13px] font-bold text-ink">Данные созданы в неподдерживаемой версии</div>
      <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-ink2">
        {unsupportedGeometry ? `Геометрия «${unsupportedGeometry}»` : `Компоновка «${unsupportedLayout}»`} доступна только для чтения.
        Обновите приложение, чтобы не перезаписать данные.
      </p>
    </div> : <div>
      <div className="rounded-lg border border-steel/30 bg-steel-soft px-4 py-3 text-[12px] leading-relaxed text-ink2">
        Укажите размеры в миллиметрах при взгляде спереди снаружи. Начало общей системы — левый верхний угол, X вправо, Y вниз.
        Размерный лист строится по введённым данным; не для сверления и изготовления.
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold tracking-wide text-mute uppercase">Количество полотен</div>
          {layout && <div className="mt-0.5 text-[11px] text-mute">Зафиксировано сохранённой компоновкой дверцы.</div>}
        </div>
        <div className="flex gap-1.5">
          {([1, 2] as const).map((count) => <button key={count} type="button" onClick={() => setCount(count)}
            disabled={Boolean(layout && count !== layout.doorCount)}
            className={cx("rounded-md border px-3 py-1.5 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-35",
              leaves.length === count ? "border-accent bg-accent-soft text-accent-deep" : "border-line text-mute")}
          >{count} {count === 1 ? "полотно" : "полотна"}</button>)}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {leaves.map((leaf, index) => <section key={index} className="rounded-xl border border-line bg-paper/50 p-4">
          <div className="text-[12px] font-bold text-ink">Полотно {index + 1} · door {index}</div>
          <div className="mt-3 text-[10px] font-bold tracking-wide text-mute uppercase">Полотно в общей системе, мм</div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MillimeterField label="Начало X" value={leaf.originXmm} onChange={(value) => updateLeaf(index, { originXmm: value })} />
            <MillimeterField label="Начало Y" value={leaf.originYmm} onChange={(value) => updateLeaf(index, { originYmm: value })} />
            <MillimeterField label="Ширина" value={leaf.widthMm} onChange={(value) => updateLeaf(index, { widthMm: value })} />
            <MillimeterField label="Высота" value={leaf.heightMm} onChange={(value) => updateLeaf(index, { heightMm: value })} />
          </div>
          <div className="mt-4 text-[10px] font-bold tracking-wide text-mute uppercase">Область размещения внутри полотна, мм</div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MillimeterField label="Слева" value={leaf.leftMm} onChange={(value) => updateLeaf(index, { leftMm: value })} />
            <MillimeterField label="Сверху" value={leaf.topMm} onChange={(value) => updateLeaf(index, { topMm: value })} />
            <MillimeterField label="Ширина" value={leaf.placementWidthMm} onChange={(value) => updateLeaf(index, { placementWidthMm: value })} />
            <MillimeterField label="Высота" value={leaf.placementHeightMm} onChange={(value) => updateLeaf(index, { placementHeightMm: value })} />
          </div>
        </section>)}
      </div>
      {validationError && <div className="mt-4 rounded-md border border-heat/35 bg-heat-soft px-3 py-2 text-[12px] font-semibold text-heat">
        {validationError}
      </div>}
    </div>}
  </Modal>;
}

function MillimeterField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}>
    <Input type="number" value={value} onChange={onChange} placeholder="мм" className="text-right font-mono tabular-nums" />
  </Field>;
}
