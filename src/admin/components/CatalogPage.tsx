export default function CatalogPage() {
  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Справочник оборудования</h2>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow"><h3 className="text-lg font-semibold mb-4">Активные позиции</h3><p className="text-slate-500">CRUD таблица позиций.</p></div>
        <div className="bg-white p-6 rounded-lg shadow"><h3 className="text-lg font-semibold mb-4 text-red-600">Корзина (Удалённые)</h3><p className="text-slate-500">Позиции, удалённые из справочника. Автоматически удаляются через 90 дней.</p></div>
      </div>
    </div>
  );
}
