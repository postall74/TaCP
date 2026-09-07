import { useState } from "react";
import { useAuthStore } from "../../store";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function UsersPage() {
  const { users } = useAuthStore();
  const [search, setSearch] = useState("");
  const filtered = users.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Управление пользователями</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-blue-700"><Plus size={18} /> Добавить</button>
      </div>
      <input type="text" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full mb-4 px-4 py-2 border border-slate-300 rounded-md" />
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-100 text-slate-600 text-sm uppercase"><tr><th className="px-6 py-3">Email</th><th className="px-6 py-3">Роль</th><th className="px-6 py-3">Действия</th></tr></thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-6 py-4">{u.email}</td>
                <td className="px-6 py-4"><span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">{u.role}</span></td>
                <td className="px-6 py-4 flex gap-2">
                  <button className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                  <button className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
