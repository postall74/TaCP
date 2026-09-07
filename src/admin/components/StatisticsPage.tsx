import { useState, useMemo } from "react";
import { useStore } from "../../store";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Download, TrendingUp, Factory, Layers } from "lucide-react";

/**
 * РЕАЛЬНАЯ статистика по проектам и оборудованию.
 * Данные берутся из store (проекты + справочник).
 */
export default function StatisticsPage() {
  const projects = useStore((s) => s.projects);
  const catalog = useStore((s) => s.catalog);

  // === РАСЧЁТ СТАТИСТИКИ ПО НАПРАВЛЕНИЯМ ===
  const directionStats = useMemo(() => {
    const stats: Record<string, number> = {};
    projects.forEach((p) => {
      const dir = p.direction || "Не указано";
      stats[dir] = (stats[dir] || 0) + 1;
    });
    return Object.entries(stats).map(([name, count]) => ({ name, count }));
  }, [projects]);

  // === РАСЧЁТ СТАТИСТИКИ ПО ПРОИЗВОДИТЕЛЯМ ===
  const brandStats = useMemo(() => {
    const stats: Record<string, { count: number; totalPurchase: number }> = {};
    
    projects.forEach((project) => {
      project.cabinets?.forEach((cab) => {
        cab.items?.forEach((item) => {
          // Ищем оборудование в каталоге по eqId или используем данные снимка
          const eq = catalog.find((e) => e.id === item.eqId);
          const brand = eq?.brand || item.brand || "Неизвестно";
          const purchase = eq?.purchase || item.purchase || 0;
          
          if (!stats[brand]) {
            stats[brand] = { count: 0, totalPurchase: 0 };
          }
          stats[brand].count += item.qty || 1;
          stats[brand].totalPurchase += purchase * (item.qty || 1);
        });
      });
    });

    return Object.entries(stats)
      .map(([brand, data]) => ({
        brand,
        count: data.count,
        totalPurchase: data.totalPurchase,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [projects, catalog]);

  // === СТАТИСТИКА ПО КАТЕГОРИЯМ ОБОРУДОВАНИЯ ===
  const categoryStats = useMemo(() => {
    const stats: Record<string, number> = {};
    projects.forEach((project) => {
      project.cabinets?.forEach((cab) => {
        cab.items?.forEach((item) => {
          const eq = catalog.find((e) => e.id === item.eqId);
          const cat = eq?.category || "Прочее";
          stats[cat] = (stats[cat] || 0) + (item.qty || 1);
        });
      });
    });
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [projects, catalog]);

  const COLORS = ["#2563eb", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#dc2626", "#ca8a04", "#4f46e5"];

  const exportCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0] || {});
    const csv = [headers.join(";"), ...data.map((row) => headers.map((h) => row[h]).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Аналитика и статистика</h2>
          <p className="text-slate-500 mt-1">
            Проектов: {projects.length} · Позиций в справочнике: {catalog.length}
          </p>
        </div>
      </div>

      {/* Карточки с ключевыми метриками */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Layers size={16} /> Всего проектов
          </div>
          <div className="text-3xl font-bold">{projects.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Factory size={16} /> Производителей
          </div>
          <div className="text-3xl font-bold">{brandStats.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <TrendingUp size={16} /> Направлений
          </div>
          <div className="text-3xl font-bold">{directionStats.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Layers size={16} /> Категорий
          </div>
          <div className="text-3xl font-bold">{categoryStats.length}</div>
        </div>
      </div>

      {/* Статистика по направлениям */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Проекты по направлениям работ</h3>
          <button
            onClick={() => exportCSV(directionStats, "статистика_направления.csv")}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <Download size={16} /> Экспорт CSV
          </button>
        </div>
        {directionStats.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={directionStats}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" name="Проектов" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-center py-8">Нет данных. Создайте проекты с указанием направления.</p>
        )}
      </div>

      {/* Статистика по производителям */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">ТОП-20 производителей (для переговоров с поставщиками)</h3>
          <button
            onClick={() => exportCSV(brandStats, "статистика_производители.csv")}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
          >
            <Download size={16} /> Экспорт CSV
          </button>
        </div>
        {brandStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Производитель</th>
                  <th className="px-4 py-2 text-right">Позиций в ТКП</th>
                  <th className="px-4 py-2 text-right">Сумма закупки, ₽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {brandStats.map((b, i) => (
                  <tr key={b.brand} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{b.brand}</td>
                    <td className="px-4 py-2 text-right">{b.count.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-2 text-right font-mono">{b.totalPurchase.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">Нет данных об оборудовании в проектах.</p>
        )}
      </div>

      {/* Статистика по категориям */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Распределение по категориям оборудования</h3>
        {categoryStats.length > 0 ? (
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie data={categoryStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120}>
                  {categoryStats.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {categoryStats.slice(0, 10).map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1">{c.name}</span>
                  <span className="font-mono">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-8">Нет данных.</p>
        )}
      </div>
    </div>
  );
}