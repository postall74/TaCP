import { useState, type FormEvent } from "react";
import { useStore } from "../store";
import { IcBolt, IcCheck, IcLayers, IcBox, IcDoc } from "./icons";
import { cx } from "./ui";

/* ============================================================
   ЭКРАН ВХОДА / РЕГИСТРАЦИИ (JWT).
   Показывается, когда settings.apiBaseUrl задан, но токена нет.
   После успешного логина store сохраняет token — запросы к API
   начинают носить заголовок Authorization: Bearer <token>.
   ============================================================ */

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  engineer: "Инженер",
};

export default function LoginGate() {
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);
  const toast = useStore((s) => s.toast);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"engineer" | "manager">("engineer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Укажите e-mail и пароль");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        toast("Добро пожаловать!");
      } else {
        if (!fullName.trim()) {
          setError("Укажите ФИО");
          setBusy(false);
          return;
        }
        await register(email.trim(), password, fullName.trim(), role);
        toast("Аккаунт создан — войдите");
        setMode("login");
      }
    } catch (err: any) {
      setError(err?.message ?? "Не удалось войти. Проверьте данные или подключение к API.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-paper">
      {/* ---------------- левая панель (бренд) ---------------- */}
      <aside className="bg-blueprint relative hidden w-[42%] flex-col justify-between overflow-hidden bg-dark p-10 lg:flex">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-white shadow-lg shadow-accent/30">
            <IcBolt size={22} />
          </span>
          <div>
            <div className="font-display text-xl font-bold tracking-tight text-white">ТКП·Про</div>
            <div className="mt-0.5 text-[9px] font-semibold tracking-[0.22em] text-darkmute uppercase">
              НКУ · АСУ · Обогрев
            </div>
          </div>
        </div>

        <div className="anim-up max-w-md">
          <h1 className="font-display text-[30px] leading-tight font-bold tracking-tight text-white">
            Технико-коммерческие предложения —<span className="text-accent"> от опросника до документа</span>
          </h1>
          <ul className="mt-6 space-y-3">
            {[
              { icon: <IcLayers size={16} />, text: "Конструктор шкафов с проверкой совместимости" },
              { icon: <IcBox size={16} />, text: "Справочник с реальными закупочными ценами" },
              { icon: <IcDoc size={16} />, text: "Документ А4: PDF, Word, Excel с расчётом" },
            ].map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-[13.5px] font-semibold text-darkmute">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-darkline text-accent">
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11px] leading-relaxed text-darkmute">
          Вход под своей ролью: инженер собирает шкафы, менеджер ведёт коммерцию. Права разграничены на сервере.
        </p>
      </aside>

      {/* ---------------- правая панель (форма) ---------------- */}
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="anim-up w-full max-w-md">
          {/* мобильный логотип */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white">
              <IcBolt size={18} />
            </span>
            <span className="font-display text-lg font-bold text-ink">ТКП·Про</span>
          </div>

          <div className="rounded-2xl border border-line bg-card p-7 shadow-xl shadow-dark/5">
            <h2 className="font-display text-[20px] font-bold tracking-tight text-ink">
              {mode === "login" ? "Вход" : "Регистрация"}
            </h2>
            <p className="mt-1 text-[12.5px] text-mute">
              {mode === "login" ? "Войдите, чтобы продолжить работу с проектами" : "Создайте учётную запись сотрудника"}
            </p>

            {/* переключатель */}
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-paper p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(""); }}
                  className={cx(
                    "cursor-pointer rounded-md py-1.5 text-[12.5px] font-bold transition-all duration-150",
                    mode === m ? "bg-dark text-white shadow-sm" : "text-mute hover:text-ink"
                  )}
                >
                  {m === "login" ? "Вход" : "Регистрация"}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-5 space-y-3.5">
              {mode === "register" && (
                <>
                  <Field label="ФИО">
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Иванов Иван Иванович" className={inputCls} />
                  </Field>
                  <Field label="Роль">
                    <div className="grid grid-cols-2 gap-2">
                      {(["engineer", "manager"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRole(r)}
                          className={cx(
                            "flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-bold transition-all active:scale-[0.98]",
                            role === r ? "border-accent bg-accent-soft/60 text-accent-deep" : "border-line text-mute hover:border-line2"
                          )}
                        >
                          {role === r && <IcCheck size={13} />}
                          {ROLE_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </Field>
                </>
              )}

              <Field label="E-mail">
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.ru" type="email" autoComplete="email" className={inputCls} />
              </Field>
              <Field label="Пароль">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} className={inputCls} placeholder="••••••••" />
              </Field>

              {error && (
                <div className="anim-scale rounded-md bg-heat-soft px-3 py-2 text-[12px] font-semibold text-heat">{error}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[13.5px] font-bold text-white transition-all duration-150 hover:bg-accent-deep active:scale-[0.99] disabled:opacity-60"
              >
                {busy ? "Проверяем…" : mode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </form>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-mute">
              Администратор по умолчанию: <span className="font-mono">admin@tkp.local</span> / <span className="font-mono">Admin#12345</span> — смените пароль после первого входа.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-line bg-card px-3 py-2 text-[13px] font-semibold text-ink outline-none transition-all placeholder:font-normal placeholder:text-mute/70 focus:border-accent focus:ring-2 focus:ring-accent/15";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold tracking-wide text-mute uppercase">{label}</span>
      {children}
    </label>
  );
}
