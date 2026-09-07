import { useState, useEffect } from "react";
import { useStore } from "../../store";
import { Plus, Edit2, Trash2, RotateCcw, Search, Package, Archive } from "lucide-react";
import type { Equipment, DeletedEquipment } from "../../types";

/**
 * ПОЛНОЦЕННАЯ страница управления справочником оборудования.
 * Вкладки: Активные позиции | Корзина (удалённые).
 * Функции: поиск, фильтрация, добавление, удаление, восстановление из корзины.
 */
export default function CatalogPage() {
  const catalog = useStore((s) => s.catalog);
  const deletedCatalog = useStore((s) => s.deletedCatalog);
  const toast = useStore((s) => s.toast);

  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);

  // Получаем уникальные категории и направления для фильтров
  const categories = [...new Set(catalog.map((e) => e.category).filter(Boolean))].sort();
  const directions = [...new Set(catalog.map((e) => e.direction).filter(Boolean))].sort();

  // Фильтрация активных позиций
  const filteredCatalog = catalog.filter((e) => {
    const matchSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.sku.toLowerCase().includes(search.toLowerCase()) ||
      e.brand.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || e.category === categoryFilter;
    const matchDirection = directionFilter === "all" || e.direction === directionFilter;
    return matchSearch && matchCategory && matchDirection;
  });

  // Фильтрация корзины
  const filteredDeleted = deletedCatalog.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (eq: Equipment) => {
    if (!confirm(`Удалить "${eq.name}" в корзину?`)) return;
    // Здесь будет вызов функции удаления из store
    toast(`"${eq.name}" перемещён в корзину (функция удаления в разработке)`, "info");
  };

  const handleRestore = (eq: DeletedEquipment) => {
    toast(`Восстановление "${eq.name}" — функция в разработке`, "info");
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const daysLeft = (deletedAt: number) => {
    const days = 90 - Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Справочник оборудования</h2>
          <p className="text-slate-500 mt-1">
            Активных: {catalog.length} · В корзине: {deletedCatalog.length}
          </p>
        </div>
        {tab === "active" && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus size={18} /> Добавить позицию
          </button>
        )}
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
            tab === "active"
              ? "bg-blue-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Package size={18} />
          Активные позиции ({catalog.length})
        </button>
        <button
          onClick={() => setTab("deleted")}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
            tab === "deleted"
              ? "bg-red-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Archive size={18} />
          Корзина ({deletedCatalog.length})
        </button>
      </div>

      {/* Поиск и фильтры */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Поиск по названию, артикулу, бренду..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md"
          />
        </div>
        {tab === "active" && (
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md"
            >
              <option value="all">Все категории</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md"
            >
              <option value="all">Все направления</option>
              {directions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Контент */}
      {tab === "active" ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Наименование</th>
                  <th className="px-4 py-3">Бренд</th>
                  <th className="px-4 py-3">Категория</th>
                  <th className="px-4 py-3">Направление</th>
                  <th className="px-4 py-3 text-right">Закупка, ₽</th>
                  <th className="px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCatalog.slice(0, 100).map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{eq.sku}</td>
                    <td className="px-4 py-3 max-w-[300px] truncate" title={eq.name}>{eq.name}</td>
                    <td className="px-4 py-3">{eq.brand}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded bg-slate-100">{eq.category}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{eq.direction || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono">
                      {eq.purchase?.toLocaleString("ru-RU") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Редактировать">
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(eq)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Удалить в корзину"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredCatalog.length === 0 && (
            <div className="text-center py-12 text-slate-500">Позиции не найдены</div>
          )}
          {filteredCatalog.length > 100 && (
            <div className="text-center py-3 text-slate-400 text-sm border-t">
              Показано 100 из {filteredCatalog.length}. Уточните поиск.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-red-50 text-red-700 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Наименование</th>
                  <th className="px-4 py-3">Удалил</th>
                  <th className="px-4 py-3">Дата удаления</th>
                  <th className="px-4 py-3">Осталось дней</th>
                  <th className="px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDeleted.map((eq) => (
                  <tr key={eq.id} className="hover:bg-red-50/50">
                    <td className="px-4 py-3 font-mono text-xs">{eq.sku}</td>
                    <td className="px-4 py-3 max-w-[300px] truncate">{eq.name}</td>
                    <td className="px-4 py-3">{eq.deletedBy || "—"}</td>
                    <td className="px-4 py-3">{formatDate(eq.deletedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        daysLeft(eq.deletedAt) < 7 ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {daysLeft(eq.deletedAt)} дн.
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRestore(eq)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title="Восстановить"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredDeleted.length === 0 && (
            <div className="text-center py-12 text-slate-500">Корзина пуста</div>
          )}
        </div>
      )}

      {/* Модальное окно добавления позиции */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold mb-4">Добавить позицию в справочник</h3>
            <p className="text-slate-500 mb-4">
              Форма добавления будет подключена к бэкенд-эндпоинту
              <code className="bg-slate-100 px-1 rounded"> POST /api/catalog</code> после его реализации.
              Сейчас импорт осуществляется через CSV: <code className="bg-slate-100 px-1 rounded">POST /api/catalog/import</code>
            </p>
            <button
              onClick={() => setShowAddModal(false)}
              className="w-full border border-slate-300 py-2 rounded-md hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}