import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
const data = [{ name: "НКУ", count: 45 }, { name: "АСУ ТП", count: 28 }, { name: "Обогрев", count: 62 }];
export default function StatisticsPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Аналитика и Статистика</h2>
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-semibold mb-4">Распределение по направлениям</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="count" fill="#2563eb" /></BarChart>
        </ResponsiveContainer>
      </div>
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Топ производителей</h3>
        <ul className="space-y-2">
          <li className="flex justify-between border-b pb-2"><span>DKC</span><span className="font-bold">342 позиции</span></li>
          <li className="flex justify-between border-b pb-2"><span>EKF</span><span className="font-bold">215 позиций</span></li>
        </ul>
      </div>
    </div>
  );
}
