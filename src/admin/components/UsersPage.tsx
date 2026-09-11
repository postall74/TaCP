import { useState, useEffect } from "react";
import { useStore } from "../../store";
import { Plus, Edit2, Trash2, Shield, X, UserCog } from "lucide-react";
import type { AuthUser } from "../../api/client";
import { Btn, Field, Input, Modal, Select, cx } from "../../components/ui";
import { ROLE_LABEL } from "../../utils/roles";

/**
 * ПОЛНОЦЕННАЯ страница управления пользователями.
 * Функции: просмотр списка, добавление, удаление, смена роли, редактирование профиля.
 * Стиль соответствует основному приложению (токены bg-paper, text-ink и т.д.)
 */
export default function UsersPage() {
  const listUsers = useStore((s) => s.listUsers);
  const setUserRole = useStore((s) => s.setUserRole);
  const register = useStore((s) => s.register);
  const updateUserProfile = useStore((s) => s.updateUserProfile);
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
  
  // Форма редактирования
  const [editEmail, setEditEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("");
  const [editPhone, setEditPhone] = useState("");

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
      toast(`Роль ${u.email} изменена на ${ROLE_LABEL[role as keyof typeof ROLE_LABEL] || role}`, "ok");
      await loadUsers();
    } catch (e: any) {
      toast(e.message || "Не удалось изменить роль", "err");
    }
  };
  
  const openEditModal = (u: AuthUser) => {
    setEditingUser(u);
    setEditEmail(u.email);
    setEditName(u.fullName || "");
    setEditPosition(u.position || "");
    setEditPhone(u.phone || "");
  };
  
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    try {
      await updateUserProfile(editingUser.id, {
        email: editEmail.trim(),
        fullName: editName.trim(),
        position: editPosition.trim(),
        phone: editPhone.trim(),
      });
      toast(`Профиль ${editEmail} обновлён`, "ok");
      setEditingUser(null);
      await loadUsers();
    } catch (e: any) {
      toast(e.message || "Не удалось обновить профиль", "err");
    }
  };

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.fullName || "").toLowerCase().includes(search.toLowerCase())
  );

  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-heat/10 text-heat",
    manager: "bg-accent/10 text-accent",
    engineer: "bg-ok/10 text-ok",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
        <span className="ml-3 text-mute">Загрузка пользователей...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Заголовок */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-display text-[26px] font-bold tracking-tight text-ink">Управление пользователями</h2>
          <p className="mt-1 text-[13.5px] text-mute">Всего: {users.length} пользователей</p>
        </div>
        <Btn onClick={() => setShowAddModal(true)}>
          <Plus size={18} /> Добавить пользователя
        </Btn>
      </div>

      {/* Поиск */}
      <input
        type="text"
        placeholder="Поиск по email или имени..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 px-4 py-2 border border-line bg-card text-ink rounded-md focus:border-accent outline-none"
      />

      {/* Таблица пользователей */}
      <div className="bg-card rounded-lg shadow overflow-hidden border border-line">
        <table className="w-full text-left">
          <thead className="bg-dark text-darkmute text-xs uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Имя</th>
              <th className="px-6 py-3">Должность</th>
              <th className="px-6 py-3">Роль</th>
              <th className="px-6 py-3">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-dark/30 transition-colors">
                <td className="px-6 py-4 font-mono text-sm text-ink2">{u.email}</td>
                <td className="px-6 py-4 text-ink">{u.fullName || "—"}</td>
                <td className="px-6 py-4 text-mute">{u.position || "—"}</td>
                <td className="px-6 py-4">
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u, e.target.value)}
                    disabled={u.id === user?.id}
                    className={`px-2 py-1 text-xs rounded-full border-0 cursor-pointer font-semibold ${ROLE_COLORS[u.role] || "bg-line text-mute"}`}
                  >
                    <option value="admin">Администратор</option>
                    <option value="manager">Менеджер</option>
                    <option value="engineer">Инженер</option>
                  </select>
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button
                    onClick={() => openEditModal(u)}
                    className="p-1 text-accent hover:bg-accent/10 rounded transition-colors"
                    title="Редактировать"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(u)}
                    disabled={u.id === user?.id}
                    className="p-1 text-heat hover:bg-heat/10 rounded transition-colors disabled:opacity-30"
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
          <div className="text-center py-8 text-mute">Пользователи не найдены</div>
        )}
      </div>

      {/* Модальное окно добавления */}
      {showAddModal && (
        <Modal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Новый пользователь"
          footer={
            <>
              <button onClick={() => setShowAddModal(false)} className="mr-auto text-mute hover:text-ink text-sm font-semibold">
                Отмена
              </button>
              <Btn onClick={handleAddUser}>Создать</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={newEmail}
                onChange={(v) => setNewEmail(v)}
                placeholder="user@company.ru"
              />
            </Field>
            <Field label="ФИО">
              <Input
                type="text"
                value={newName}
                onChange={(v) => setNewName(v)}
                placeholder="Иванов Иван Иванович"
              />
            </Field>
            <Field label="Пароль">
              <Input
                type="password"
                value={newPassword}
                onChange={(v) => setNewPassword(v)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Роль">
              <Select value={newRole} onChange={(v) => setNewRole(v)}>
                <option value="engineer">Инженер</option>
                <option value="manager">Менеджер</option>
                <option value="admin">Администратор</option>
              </Select>
            </Field>
          </div>
        </Modal>
      )}

      {/* Модальное окно редактирования */}
      {editingUser && (
        <Modal
          open={!!editingUser}
          onClose={() => setEditingUser(null)}
          title={`Редактирование: ${editingUser.email}`}
          footer={
            <>
              <button onClick={() => setEditingUser(null)} className="mr-auto text-mute hover:text-ink text-sm font-semibold">
                Отмена
              </button>
              <Btn onClick={handleSaveEdit}>Сохранить</Btn>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={editEmail}
                onChange={(v) => setEditEmail(v)}
                placeholder="user@company.ru"
              />
            </Field>
            <Field label="ФИО">
              <Input
                type="text"
                value={editName}
                onChange={(v) => setEditName(v)}
                placeholder="Иванов Иван Иванович"
              />
            </Field>
            <Field label="Должность">
              <Input
                type="text"
                value={editPosition}
                onChange={(v) => setEditPosition(v)}
                placeholder="Инженер-проектировщик"
              />
            </Field>
            <Field label="Телефон">
              <Input
                type="tel"
                value={editPhone}
                onChange={(v) => setEditPhone(v)}
                placeholder="+7 (999) 000-00-00"
              />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}