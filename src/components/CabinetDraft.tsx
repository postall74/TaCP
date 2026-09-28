import type { Cabinet } from "../types";

interface CabinetDraftProps {
  cabinet: Cabinet;
  width?: number;
  height?: number;
}

/**
 * SVG-генератор фронтального вида шкафа по ГОСТ.
 * Рисует корпус, двери, цоколь, габаритные размеры.
 */
export default function CabinetDraft({ cabinet, width = 400, height = 500 }: CabinetDraftProps) {
  // Получаем габариты из первого элемента (корпуса)
  const cabinetItem = cabinet.items.find(i => i.name.toLowerCase().includes("корпус") || i.name.toLowerCase().includes("шкаф"));
  const dims = parseDimensions(cabinetItem?.name || cabinet.name);
  
  const scale = Math.min(width / dims.width, height / dims.height) * 0.7;
  const svgWidth = dims.width * scale;
  const svgHeight = dims.height * scale;
  const pedestalHeight = 100 * scale; // Цоколь 100 мм

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-bold mb-4">Общий вид шкафа (ГОСТ)</h3>
      <svg
        viewBox={`0 0 ${svgWidth + 100} ${svgHeight + pedestalHeight + 100}`}
        className="w-full max-w-md mx-auto"
      >
        {/* Цоколь */}
        <rect
          x="50"
          y={svgHeight + 20}
          width={svgWidth}
          height={pedestalHeight}
          fill="#e5e7eb"
          stroke="#374151"
          strokeWidth="2"
        />
        <text
          x={50 + svgWidth / 2}
          y={svgHeight + 20 + pedestalHeight / 2 + 5}
          textAnchor="middle"
          className="text-xs"
          fill="#6b7280"
        >
          Цоколь 100 мм
        </text>

        {/* Корпус шкафа */}
        <rect
          x="50"
          y="20"
          width={svgWidth}
          height={svgHeight}
          fill="#f3f4f6"
          stroke="#1f2937"
          strokeWidth="3"
        />

        {/* Дверь */}
        <rect
          x="55"
          y="25"
          width={svgWidth - 10}
          height={svgHeight - 10}
          fill="none"
          stroke="#6b7280"
          strokeWidth="1.5"
          strokeDasharray="5,5"
        />

        {/* Ручка двери */}
        <rect
          x={50 + svgWidth - 30}
          y={20 + svgHeight / 2 - 20}
          width="8"
          height="40"
          fill="#9ca3af"
          stroke="#374151"
          strokeWidth="1"
        />

        {/* Габаритные размеры */}
        {/* Высота */}
        <line x1="30" y1="20" x2="30" y2={20 + svgHeight} stroke="#ef4444" strokeWidth="1" />
        <line x1="25" y1="20" x2="35" y2="20" stroke="#ef4444" strokeWidth="1" />
        <line x1="25" y1={20 + svgHeight} x2="35" y2={20 + svgHeight} stroke="#ef4444" strokeWidth="1" />
        <text x="15" y={20 + svgHeight / 2} textAnchor="middle" fill="#ef4444" className="text-xs font-bold">
          {dims.height}
        </text>

        {/* Ширина */}
        <line x1="50" y1={svgHeight + pedestalHeight + 40} x2={50 + svgWidth} y2={svgHeight + pedestalHeight + 40} stroke="#ef4444" strokeWidth="1" />
        <line x1="50" y1={svgHeight + pedestalHeight + 35} x2="50" y2={svgHeight + pedestalHeight + 45} stroke="#ef4444" strokeWidth="1" />
        <line x1={50 + svgWidth} y1={svgHeight + pedestalHeight + 35} x2={50 + svgWidth} y2={svgHeight + pedestalHeight + 45} stroke="#ef4444" strokeWidth="1" />
        <text x={50 + svgWidth / 2} y={svgHeight + pedestalHeight + 55} textAnchor="middle" fill="#ef4444" className="text-xs font-bold">
          {dims.width}
        </text>

        {/* Название шкафа */}
        <text x={50 + svgWidth / 2} y="10" textAnchor="middle" className="text-sm font-bold" fill="#1f2937">
          {cabinet.name}
        </text>
      </svg>

      {/* Техническая информация */}
      <div className="mt-4 text-sm text-slate-600 space-y-1">
        <p><strong>Габариты:</strong> {dims.height} × {dims.width} × {dims.depth} мм (В×Ш×Г)</p>
        <p><strong>Степень защиты:</strong> IP{dims.ip || "54"}</p>
        <p><strong>Тип:</strong> {cabinet.kind}</p>
      </div>
    </div>
  );
}

/**
 * Парсит габариты из названия шкафа (формат: "2000×800×600" или "2000x800x600").
 */
function parseDimensions(name: string): { height: number; width: number; depth: number; ip?: number } {
  const match = name.match(/(\d{3,4})[×xX](\d{3,4})[×xX](\d{3,4})/);
  const ipMatch = name.match(/IP(\d{2})/i);
  
  if (match) {
    return {
      height: parseInt(match[1]),
      width: parseInt(match[2]),
      depth: parseInt(match[3]),
      ip: ipMatch ? parseInt(ipMatch[1]) : 54
    };
  }
  
  return { height: 2000, width: 800, depth: 600, ip: 54 };
}