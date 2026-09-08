import { useState, type ReactNode } from "react";
import { Users, BookOpen, BarChart3, Clock, ArrowLeft } from "lucide-react";
import { cx } from "../../components/ui";
import { IcGear } from "../../components/icons";

type AdminTab = "users" | "catalog" | "statistics" | "time";

interface AdminLayoutProps {
  children: ReactNode;
  onBack: () => void;
}

export default function AdminLayout({ children, onBack }: AdminLayoutProps) {
  const [tab, setTab] = useState<AdminTab>("users");

  const links = [
    { id: "users" as const, label: "Пользователи", hint: "роли и доступ", icon: Users },
    { id: "catalog" as const, label: "Справочник", hint: "оборудование", icon: BookOpen },
    { id: "statistics" as const, label: "Статистика", hint: "аналитика", icon: BarChart3 },
    { id: "time" as const, label: "Учёт времени", hint: "подготовка ТКП", icon: Clock },
  ];

  return (
    <div className="fixed inset-0 z-50 flex bg-paper text-ink">
      {/* Сайдбар в стиле основного приложения */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-darkline bg-dark">
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-lg shadow-accent/30">
            <IcGear size={19} />
          </span>
          <div>
            <div className="font-display text-[15px] leading-none font-bold tracking-tight text-white">
              Админ-панель
            </div>
            <div className="mt-1 text-[8.5px] font-semibold tracking-[0.22em] text-darkmute uppercase">
              ТКП·Про
            </div>
          </div>
        </div>

        <nav className="mt-1 flex flex-col gap-1 px-3">
          {links.map((l) => {
            const Icon = l.icon;
            const active = tab === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setTab(l.id)}
                className={cx(
                  "group flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150",
                  active
                    ? "bg-accent text-white shadow-lg shadow-accent/25"
                    : "text-darkmute hover:bg-dark2 hover:text-white"
                )}
              >
                <Icon size={17} />
                <span className="flex-1">
                  <span className="block text-[13px] leading-tight font-bold">{l.label}</span>
                  <span
                    className={cx(
                      "block text-[10px] leading-tight",
                      active ? "text-white/70" : "text-darkmute"
                    )}
                  >
                    {l.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <button
          onClick={onBack}
          className="mx-3 mt-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-semibold text-darkmute transition-colors hover:bg-dark2 hover:text-white"
        >
          <ArrowLeft size={15} />
          <span>Вернуться в ТКП</span>
        </button>
      </aside>

      {/* Контент */}
      <main className="min-w-0 flex-1 bg-blueprint">
        <div className="h-full overflow-y-auto">
          <div className="mx-auto max-w-[1460px] px-6 py-6 lg:px-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}