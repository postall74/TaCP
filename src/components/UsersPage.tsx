import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { restApi, type AuthUser } from "../api/client";
import { currentRole, ROLE_LABEL, type Role } from "../utils/roles";
import { Badge, Select, cx } from "./ui";
import { IcDatabase, IcInfo } from "./icons";

/* ============================================================
   СТРАНИЦА «ПОЛЬЗОВАТЕЛИ» (только админ, только серверный режим).
   Просмотр списка и смена ролей через PUT /api/auth/users/{id}/role.
   Роль в JWT обновится у пользователя при следующем входе.
   ============================================================ */

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-accent-soft text-accent-deep",
  manager: "bg-steel-soft text-steel",
  engineer: "bg-ok-soft text-ok",
};

const ROLE_OPTIONS = [
  { value: "engineer", label: "Инженер — сборка и расчёт ТКП" },
  { value: "manager", label: "Менеджер — воронка, решения, удаление" },
  { value: "admin", label: "Администратор — полный доступ" },
];

export default function UsersPage() {
  const settings = useStore((s) => s.settings);
  const me = useStore((s) => s.user);
  const toast = useStore((s) => s.toast);

  const apiBase = (settings.apiBaseUrl ?? "").trim();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      setUsers(await restApi(apiBase).users());
    } catch {
      toast("Не удалось загрузить список пользователей", "err");
    } finally {
      setLoading(false);
    }
  }, [apiBase, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  /* локальный режим — пользователей нет, объясняем почему */
  if (!apiBase) {
    return (
      <div className="mx-auto max-w-xl pb-10">
        <div className="anim-up rounded-xl border border-line bg-card p-8 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-dark text-steel">
            <IcDatabase size={22} />
          </span>
          <h2 className="font-display text-[18px] font-bold text-ink">Пользователи хранятся на сервере</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-mute">
            Управление пользователями и ролями работает в серверном режиме: подключите C#-бэкенд
            («Реквизиты компании» → «Подключение к C#-бэкенду»), войдите под администратором — и здесь
            появится список пользователей со сменой ролей.
          </p>
        </div>
      </div>
    );
  }

  const changeRole = async (u: AuthUser, role: Role) => {
    setBusyId(u.id);
    try {
      await restApi(apiBase).setUserRole(u.id, role);
      await load();
      toast(`Роль «${ROLE_LABEL[role]}» назначена: ${u.fullName}`);
    } catch {
      toast("Не удалось изменить роль", "err");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pb-10">
      <div className="anim-up">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-mute uppercase">
            Identity · роли admin / manager / engineer
          </span>
        </div>
        <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Пользователи</h1>
        <p className="mt-1 text-[13.5px] text-mute">
          Назначение ролей определяет права в системе: кто может удалять ТКП, принимать решения по воронке
          и управлять справочниками
        </p>
      </div>

      <div className="anim-up mt-4 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[12px] leading-relaxed text-warn" style={{ animationDelay: "60ms" }}>
        <IcInfo size={15} />
        <span>
          Смена роли вступает в силу <b>при следующем входе</b> пользователя: текущий JWT содержит прежние роли
          до истечения или повторного логина.
        </span>
      </div>

      {/* таблица пользователей */}
      <div className="anim-up mt-4 overflow-hidden rounded-xl border border-line bg-card" style={{ animationDelay: "110ms" }}>
        {loading && users.length === 0 ? (
          <div className="px-5 py-10 text-center font-mono text-[12px] text-mute">загрузка…</div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line bg-paper/70 text-[10px] font-bold tracking-wide text-mute uppercase">
                <th className="py-2.5 pl-4">Пользователь</th>
                <th className="py-2.5">E-mail</th>
                <th className="py-2.5">Должность</th>
                <th className="py-2.5 pr-3">Роль</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const role = currentRole(u);
                const isMe = me?.id === u.id;
                return (
                  <tr key={u.id} className="border-b border-line/60 transition-colors last:border-b-0 hover:bg-paper/70">
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark font-display text-[11px] font-bold text-white">
                          {u.fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
                        </span>
                        <span className="text-[13px] font-bold text-ink">
                          {u.fullName}
                          {isMe && <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-bold text-accent-deep uppercase">это вы</span>}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-[12px] text-ink2">{u.email}</td>
                    <td className="py-3 pr-3 text-[12px] text-mute">{u.position || "—"}</td>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <Badge cls={ROLE_BADGE[role]}>{ROLE_LABEL[role]}</Badge>
                        <div className={cx("w-56", busyId === u.id && "opacity-50")}>
                          <Select
                            value={role}
                            onChange={(v) => {
                              if (v !== role && busyId !== u.id) void changeRole(u, v as Role);
                            }}
                            options={ROLE_OPTIONS}
                            className="[&_select]:h-8 [&_select]:text-[11.5px]"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[13px] text-mute">
                    Список пуст — зарегистрируйте пользователей на экране входа
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* памятка по матрице прав */}
      <div className="anim-up mt-4 grid gap-3 md:grid-cols-3" style={{ animationDelay: "160ms" }}>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r} className="rounded-xl border border-line bg-card p-4">
            <Badge cls={ROLE_BADGE[r]}>{ROLE_LABEL[r]}</Badge>
            <ul className="mt-2.5 space-y-1 text-[11.5px] leading-relaxed text-ink2">
              {r === "engineer" && (
                <>
                  <li>· создание и редактирование ТКП, расчёты</li>
                  <li>· перевод «черновик → на расчёте → отправлено»</li>
                  <li>· ведение справочника оборудования</li>
                  <li className="text-mute">· без удаления ТКП и без решений «выиграно/проиграно»</li>
                </>
              )}
              {r === "manager" && (
                <>
                  <li>· всё, что инженер</li>
                  <li>· решения «выиграно / проиграно»</li>
                  <li>· удаление ТКП и дублирование</li>
                  <li className="text-mute">· без тарифов, реквизитов и пользователей</li>
                </>
              )}
              {r === "admin" && (
                <>
                  <li>· всё, что менеджер</li>
                  <li>· тарифы нормо-часов и реквизиты компании</li>
                  <li>· управление пользователями и ролями</li>
                </>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
