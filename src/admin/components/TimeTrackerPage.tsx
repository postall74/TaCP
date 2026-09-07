export default function TimeTrackerPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Учёт рабочего времени (Только для админа)</h2>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-100 text-slate-600 text-sm uppercase"><tr><th className="px-6 py-3">ТКП</th><th className="px-6 py-3">Инженер</th><th className="px-6 py-3">Время</th><th className="px-6 py-3">Дата</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            <tr><td className="px-6 py-4">Шкаф управления насосом</td><td className="px-6 py-4">Иванов И.И.</td><td className="px-6 py-4 font-mono">04:32:15</td><td className="px-6 py-4">07.09.2026</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
