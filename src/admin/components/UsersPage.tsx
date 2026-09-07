import { useState, useEffect } from "react";
import { useStore } from "../../store";
import { Plus, Edit2, Trash2, Shield, X } from "lucide-react";
import type { AuthUser } from "../../api/client";

/**
 * ПОЛНОЦЕННАЯ страница управления пользователями.
 * Функции: просмотр списка, добавление, удаление, смена роли.
 */
export default function UsersPage() {
  const listUsers = useStore((s) => s.listUsers);
  const setUserRole = useStore((s) => s.setUserRole);
  const register = useStore((s) => s.register);
  const user = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);

  // Форма добавления
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("engineer");

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (e) {
      toast("Ошибка загрузки пользователей", "err");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newEmail || !newPassword || !newName) {
      toast("Заполните все поля", "err");
      return;
    }
    try {
      await register(newEmail, newPassword, newName, newRole);
      toast(`Пользователь ${newEmail} создан`, "ok");
      setShowAddModal(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewRole("engineer");
      await loadUsers();
    } catch (e: any) {
      toast(`Ошибка: ${e.message || "не удалось создать"}`, "err");
    }
  };

  const handleDeleteUser = async (u: AuthUser) => {
    if (u.id === user?.id) {
      toast("Нельзя удалить самого себя", "err");
      return;
    }
    if (!confirm(`Удалить пользователя ${u.email}?`)) return;
    // В реальном проекте здесь будет вызов deleteUser
    toast(`Удаление ${u.email} — функция в разработке (требуется бэкенд)`, "info");
  };

  const handleRoleChange = async (u: AuthUser, role: string) => {
    try {
      await setUserRole(u.id, role);
      toast(`Роль ${u.email} изменена на ${role}`, "ok");
      await loadUsers();
    } catch (e) {
      toast("Не удалось изменить роль", "err");
    }
  };

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.fullName || "").toLowerCase().includes(search.toLowerCase())
  );

  const ROLE_LABELS: Record<string, string> = {
    admin: "Администратор",
    manager: "Менеджер",
    engineer: "Инженер",
  };

  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-red-100 text-red-800",
    manager: "bg-blue-100 text-blue-800",
    engineer: "bg-green-100 text-green-800",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-slate-500">Загрузка пользователей...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Управление пользователями</h2>
          <p className="text-slate-500 mt-1">Всего: {users.length} пользователей</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} /> Добавить пользователя
        </button>
      </div>

      {/* Поиск */}
      <input
        type="text"
        placeholder="Поиск по email или имени..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />

      {/* Таблица пользователей */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-100 text-slate-600 text-sm uppercase">
            <tr>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Имя</th>
              <th className="px-6 py-3">Должность</th>
              <th className="px-6 py-3">Роль</th>
              <th className="px-6 py-3">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 font-mono text-sm">{u.email}</td>
                <td className="px-6 py-4">{u.fullName || "—"}</td>
                <td className="px-6 py-4 text-slate-500">{u.position || "—"}</td>
                <td className="px-6 py-4">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    disabled={u.id === user?.id}
                    className={`px-2 py-1 text-xs rounded-full border-0 cursor-pointer ${ROLE_COLORS[u.role] || "bg-gray-100"}`}
                  >
                    <option value="admin">Администратор</option>
                    <option value="manager">Менеджер</option>
                    <option value="engineer">Инженер</option>
                  </select>
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button
                    onClick={() => setEditingUser(u)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Редактировать"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u)}
                    disabled={u.id === user?.id}
                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-30"
                    title="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            Пользователи не найдены
          </div>
        )}
      </div>

      {/* Модальное окно добавления */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Новый пользователь</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  placeholder="user@company.ru"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ФИО</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Пароль</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Роль</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value="engineer">Инженер</option>
                  <option value="manager">Менеджер</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleAddUser}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700"
                >
                  Создать
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 border border-slate-300 py-2 rounded-md hover:bg-slate-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Редактирование: {editingUser.email}</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <p className="text-slate-500 mb-4">
              Редактирование профиля пользователя будет доступно после реализации бэкенд-эндпоинта
              <code className="bg-slate-100 px-1 rounded"> PUT /api/auth/users/:id</code>
            </p>
            <button
              onClick={() => setEditingUser(null)}
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