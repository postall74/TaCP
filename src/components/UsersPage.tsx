import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import type { AuthUser } from "../api/client";
import { currentRole, ROLE_LABEL, type Role } from "../utils/roles";
import { ADMIN_SEED } from "../utils/localAuth";
import { Badge, Btn, Select, cx } from "./ui";
import { IcInfo, IcRefresh, IcUser } from "./icons";

/* ============================================================
   СТРАНИЦА «ПОЛЬЗОВАТЕЛИ» (только админ).
   Двухрежимная: сервер (ASP.NET Identity) или localStorage.
   Список и смена ролей — через store.listUsers / setUserRole.
   Роль вступает в силу при следующем входе (JWT несёт прежние роли).
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
  const listUsers = useStore((s) => s.listUsers);
  const setUserRole = useStore((s) => s.setUserRole);
  const toast = useStore((s) => s.toast);

  const isRemote = !!(settings.apiBaseUrl ?? "").trim();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } catch {
      toast("Не удалось загрузить список пользователей", "err");
    } finally {
      setLoading(false);
    }
  }, [listUsers, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (u: AuthUser, role: Role) => {
    setBusyId(u.id);
    try {
      await setUserRole(u.id, role);
      await load();
      toast(`Роль «${ROLE_LABEL[role]}» назначена: ${u.fullName}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось изменить роль", "err");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pb-10">
      <div className="anim-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-mute uppercase">
              Identity · роли admin / manager / engineer
            </span>
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">Пользователи</h1>
          <p className="mt-1 text-[13.5px] text-mute">
            Роли определяют права: кто удаляет ТКП, принимает решения по воронке и управляет справочниками
          </p>
        </div>
        <Btn variant="outline" size="sm" onClick={() => void load()}>
          <IcRefresh size={14} /> Обновить
        </Btn>
      </div>

      {/* режим хранения пользователей */}
      <div
        className={cx(
          "anim-up mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12px] leading-relaxed",
          isRemote ? "border-ok/30 bg-ok-soft text-ok" : "border-warn/30 bg-warn-soft text-warn"
        )}
        style={{ animationDelay: "60ms" }}
      >
        <IcInfo size={15} />
        <span>
          {isRemote ? (
            <>
              Пользователи хранятся в <b>PostgreSQL (ASP.NET Identity)</b>. Смена роли вступает в силу при
              следующем входе пользователя: текущий JWT несёт прежние роли.
            </>
          ) : (
            <>
              <b>Локальный режим</b>: пользователи хранятся в браузере (localStorage), администратор по
              умолчанию <span className="font-mono">{ADMIN_SEED.email}</span>. Для боевой работы подключите
              C#-бэкенд — тогда включится серверная Identity с политиками паролей.
            </>
          )}
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
                const initials = u.fullName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
                return (
                  <tr key={u.id} className="border-b border-line/60 transition-colors last:border-b-0 hover:bg-paper/70">
                    <td className="py-3 pl-4">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-dark font-display text-[11px] font-bold text-white">
                          {initials || <IcUser size={14} />}
                        </span>
                        <span className="text-[13px] font-bold text-ink">
                          {u.fullName}
                          {isMe && (
                            <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[9.5px] font-bold text-accent-deep uppercase">
                              это вы
                            </span>
                          )}
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
                            onChange={(v) => v !== role && void changeRole(u, v as Role)}
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
          <div key={r} className="rounded-xl border border-line bg-card p-4 transition-all duration-200 hover:border-line2 hover:shadow-md hover:shadow-dark/5">
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
