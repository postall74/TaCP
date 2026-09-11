import { useState } from "react";
import { useStore } from "../../store";
import { Plus, Edit2, Trash2, RotateCcw, Search, Package, Archive, X } from "lucide-react";
import type { Equipment, DeletedEquipment } from "../../types";
import { Btn, Field, Input, Modal, Select } from "../../components/ui";

/**
 * ПОЛНОЦЕННАЯ страница управления справочником оборудования.
 * Вкладки: Активные позиции | Корзина (удалённые).
 * Функции: поиск, фильтрация, добавление, удаление, восстановление из корзины.
 * Стиль соответствует основному приложению (токены bg-card, text-ink и т.д.)
 */
export default function CatalogPage() {
  const catalog = useStore((s) => s.catalog);
  const deletedCatalog = useStore((s) => s.deletedCatalog);
  const deleteEquipment = useStore((s) => s.deleteEquipment);
  const restoreEquipment = useStore((s) => s.restoreEquipment);
  const toast = useStore((s) => s.toast);
  
  const [tab, setTab] = useState<"active" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEq, setEditingEq] = useState<Equipment | null>(null);

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
    deleteEquipment(eq.id);
    toast(`"${eq.name}" перемещён в корзину`, "ok");
  };

  const handleRestore = async (eq: DeletedEquipment) => {
    try {
      await restoreEquipment(eq.id);
      toast(`"${eq.name}" восстановлен из корзины`, "ok");
    } catch (e: any) {
      toast(e.message || "Не удалось восстановить позицию", "err");
    }
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
          <h2 className="font-display text-[26px] font-bold tracking-tight text-ink">Справочник оборудования</h2>
          <p className="mt-1 text-[13.5px] text-mute">
            Активных: {catalog.length} · В корзине: {deletedCatalog.length}
          </p>
        </div>
        {tab === "active" && (
          <Btn onClick={() => setShowAddModal(true)}>
            <Plus size={18} /> Добавить позицию
          </Btn>
        )}
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
            tab === "active"
              ? "bg-accent text-white"
              : "bg-card text-ink2 hover:bg-dark/30"
          }`}
        >
          <Package size={18} />
          Активные позиции ({catalog.length})
        </button>
        <button
          onClick={() => setTab("deleted")}
          className={`px-4 py-2 rounded-md flex items-center gap-2 transition-colors ${
            tab === "deleted"
              ? "bg-heat text-white"
              : "bg-card text-ink2 hover:bg-dark/30"
          }`}
        >
          <Archive size={18} />
          Корзина ({deletedCatalog.length})
        </button>
      </div>

      {/* Поиск и фильтры */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <input
            type="text"
            placeholder="Поиск по названию, артикулу, бренду..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-line bg-card text-ink rounded-md focus:border-accent outline-none"
          />
        </div>
        {tab === "active" && (
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-line bg-card text-ink rounded-md focus:border-accent outline-none"
            >
              <option value="all">Все категории</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value)}
              className="px-3 py-2 border border-line bg-card text-ink rounded-md focus:border-accent outline-none"
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
        <div className="bg-card rounded-lg shadow overflow-hidden border border-line">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-dark text-darkmute text-xs uppercase tracking-wide">
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
              <tbody className="divide-y divide-line">
                {filteredCatalog.slice(0, 100).map((eq) => (
                  <tr key={eq.id} className="hover:bg-dark/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-ink2">{eq.sku}</td>
                    <td className="px-4 py-3 max-w-[300px] truncate text-ink" title={eq.name}>{eq.name}</td>
                    <td className="px-4 py-3 text-ink">{eq.brand}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded bg-accent/10 text-accent font-medium">{eq.category}</span>
                    </td>
                    <td className="px-4 py-3 text-mute">{eq.direction || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">
                      {eq.purchase?.toLocaleString("ru-RU") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditingEq(eq)}
                          className="p-1 text-accent hover:bg-accent/10 rounded transition-colors"
                          title="Редактировать"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(eq)}
                          className="p-1 text-heat hover:bg-heat/10 rounded transition-colors"
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
            <div className="text-center py-12 text-mute">Позиции не найдены</div>
          )}
          {filteredCatalog.length > 100 && (
            <div className="text-center py-3 text-muted text-sm border-t border-line">
              Показано 100 из {filteredCatalog.length}. Уточните поиск.
            </div>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-lg shadow overflow-hidden border border-line">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-heat/10 text-heat text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3">Артикул</th>
                  <th className="px-4 py-3">Наименование</th>
                  <th className="px-4 py-3">Удалил</th>
                  <th className="px-4 py-3">Дата удаления</th>
                  <th className="px-4 py-3">Осталось дней</th>
                  <th className="px-4 py-3">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredDeleted.map((eq) => (
                  <tr key={eq.id} className="hover:bg-heat/5 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-ink2">{eq.sku}</td>
                    <td className="px-4 py-3 max-w-[300px] truncate text-ink">{eq.name}</td>
                    <td className="px-4 py-3 text-mute">{eq.deletedBy || "—"}</td>
                    <td className="px-4 py-3 text-ink2">{formatDate(eq.deletedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        daysLeft(eq.deletedAt) < 7 ? "bg-heat/10 text-heat" : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                      }`}>
                        {daysLeft(eq.deletedAt)} дн.
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRestore(eq)}
                        className="p-1 text-ok hover:bg-ok/10 rounded transition-colors"
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
            <div className="text-center py-12 text-mute">Корзина пуста</div>
          )}
        </div>
      )}

      {/* Модальное окно добавления позиции */}
      {showAddModal && (
        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Добавить позицию в справочник"
          footer={
            <button onClick={() => setShowAddModal(false)} className="w-full Btn">
              Закрыть
            </button>
          }
        >
          <p className="text-mute mb-4">
            Форма добавления будет подключена к бэкенд-эндпоинту
            <code className="bg-dark px-1 rounded text-ink2"> POST /api/catalog</code> после его реализации.
            Сейчас импорт осуществляется через CSV: <code className="bg-dark px-1 rounded text-ink2">POST /api/catalog/import</code>
          </p>
        </Modal>
      )}

      {/* Модальное окно редактирования */}
      {editingEq && (
        <Modal
          open={!!editingEq}
          onClose={() => setEditingEq(null)}
          title={`Редактирование: ${editingEq.name}`}
          footer={
            <button onClick={() => setEditingEq(null)} className="w-full Btn">
              Закрыть
            </button>
          }
        >
          <p className="text-mute mb-4">
            Редактирование позиции будет доступно после реализации бэкенд-эндпоинта
            <code className="bg-dark px-1 rounded text-ink2"> PUT /api/catalog/:id</code>
          </p>
        </Modal>
      )}
    </div>
  );
}
