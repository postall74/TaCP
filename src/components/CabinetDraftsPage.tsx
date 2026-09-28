import { useState } from "react";
import { useStore } from "../store";
import CabinetDraft from "./CabinetDraft";
import { IcBox } from "./icons";

export default function CabinetDraftsPage() {
  const projects = useStore((s) => s.projects);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);

  // Собираем все шкафы из всех проектов
  const allCabinets = projects.flatMap((p) =>
    p.cabinets.map((c) => ({ ...c, projectName: p.title }))
  );

  const selectedCabinet = allCabinets.find((c) => c.id === selectedCabinetId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IcBox size={24} className="text-accent" />
        <h1 className="text-2xl font-bold text-ink">Чертежи шкафов (ГОСТ)</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Список шкафов */}
        <div className="lg:col-span-1 bg-card rounded-lg border border-line p-4">
          <h2 className="text-lg font-bold mb-4 text-ink2">Выберите шкаф</h2>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {allCabinets.length === 0 ? (
              <p className="text-mute text-sm">Нет шкафов. Создайте проект и добавьте шкафы.</p>
            ) : (
              allCabinets.map((cab) => (
                <button
                  key={cab.id}
                  onClick={() => setSelectedCabinetId(cab.id)}
                  className={`w-full text-left p-3 rounded-md transition-colors ${
                    selectedCabinetId === cab.id
                      ? "bg-accent text-white"
                      : "bg-paper hover:bg-line/50 text-ink2"
                  }`}
                >
                  <div className="font-semibold text-sm">{cab.name}</div>
                  <div className="text-xs opacity-70 mt-1">{cab.projectName}</div>
                  <div className="text-xs opacity-60 mt-1">
                    Позиций: {cab.items.length}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Чертеж */}
        <div className="lg:col-span-2">
          {selectedCabinet ? (
            <CabinetDraft cabinet={selectedCabinet} width={500} height={600} />
          ) : (
            <div className="bg-card rounded-lg border border-line p-12 text-center">
              <IcBox size={64} className="text-mute mx-auto mb-4" />
              <p className="text-mute">Выберите шкаф из списка слева для просмотра чертежа</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}