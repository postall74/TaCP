import { useMemo } from "react";
import { useStore } from "../../store";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Download, TrendingUp, Factory, Layers } from "lucide-react";
import { Btn } from "../../components/ui";

/**
 * РЕАЛЬНАЯ статистика по проектам и оборудованию.
 * Данные берутся из store (проекты + справочник).
 * Стиль соответствует основному приложению (токены bg-card, text-ink и т.д.)
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
          <h2 className="font-display text-[26px] font-bold tracking-tight text-ink">Аналитика и статистика</h2>
          <p className="mt-1 text-[13.5px] text-mute">
            Проектов: {projects.length} · Позиций в справочнике: {catalog.length}
          </p>
        </div>
      </div>

      {/* Карточки с ключевыми метриками */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-lg shadow border border-line">
          <div className="flex items-center gap-2 text-muted text-sm mb-1">
            <Layers size={16} /> Всего проектов
          </div>
          <div className="text-3xl font-bold text-ink">{projects.length}</div>
        </div>
        <div className="bg-card p-4 rounded-lg shadow border border-line">
          <div className="flex items-center gap-2 text-muted text-sm mb-1">
            <Factory size={16} /> Производителей
          </div>
          <div className="text-3xl font-bold text-ink">{brandStats.length}</div>
        </div>
        <div className="bg-card p-4 rounded-lg shadow border border-line">
          <div className="flex items-center gap-2 text-muted text-sm mb-1">
            <TrendingUp size={16} /> Направлений
          </div>
          <div className="text-3xl font-bold text-ink">{directionStats.length}</div>
        </div>
        <div className="bg-card p-4 rounded-lg shadow border border-line">
          <div className="flex items-center gap-2 text-muted text-sm mb-1">
            <Layers size={16} /> Категорий
          </div>
          <div className="text-3xl font-bold text-ink">{categoryStats.length}</div>
        </div>
      </div>

      {/* Статистика по направлениям */}
      <div className="bg-card p-6 rounded-lg shadow border border-line">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-ink">Проекты по направлениям работ</h3>
          <Btn variant="ghost" onClick={() => exportCSV(directionStats, "статистика_направления.csv")}>
            <Download size={16} /> Экспорт CSV
          </Btn>
        </div>
        {directionStats.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={directionStats}>
              <XAxis dataKey="name" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip 
                contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
                itemStyle={{ color: "#f1f5f9" }}
              />
              <Bar dataKey="count" name="Проектов" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted text-center py-8">Нет данных. Создайте проекты с указанием направления.</p>
        )}
      </div>

      {/* Статистика по производителям */}
      <div className="bg-card p-6 rounded-lg shadow border border-line">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-ink">ТОП-20 производителей (для переговоров с поставщиками)</h3>
          <Btn variant="ghost" onClick={() => exportCSV(brandStats, "статистика_производители.csv")}>
            <Download size={16} /> Экспорт CSV
          </Btn>
        </div>
        {brandStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-dark text-darkmute text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Производитель</th>
                  <th className="px-4 py-2 text-right">Позиций в ТКП</th>
                  <th className="px-4 py-2 text-right">Сумма закупки, ₽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {brandStats.map((b, i) => (
                  <tr key={b.brand} className="hover:bg-dark/30 transition-colors">
                    <td className="px-4 py-2 text-muted">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-ink">{b.brand}</td>
                    <td className="px-4 py-2 text-right text-ink">{b.count.toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{b.totalPurchase.toLocaleString("ru-RU")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted text-center py-8">Нет данных об оборудовании в проектах.</p>
        )}
      </div>

      {/* Статистика по категориям */}
      <div className="bg-card p-6 rounded-lg shadow border border-line">
        <h3 className="text-lg font-semibold text-ink mb-4">Распределение по категориям оборудования</h3>
        {categoryStats.length > 0 ? (
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={300} height={300}>
              <PieChart>
                <Pie data={categoryStats} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={120}>
                  {categoryStats.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", color: "#f1f5f9" }}
                  itemStyle={{ color: "#f1f5f9" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {categoryStats.slice(0, 10).map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 text-ink">{c.name}</span>
                  <span className="font-mono text-ink2">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-muted text-center py-8">Нет данных.</p>
        )}
      </div>
    </div>
  );
}
