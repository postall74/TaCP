import { useState } from "react";
import { Users, BookOpen, BarChart3, Clock, ArrowLeft, LayoutDashboard } from "lucide-react";
import UsersPage from "./components/UsersPage";
import CatalogPage from "./components/CatalogPage";
import StatisticsPage from "./components/StatisticsPage";
import TimeTrackerPage from "./components/TimeTrackerPage";

type AdminTab = "users" | "catalog" | "statistics" | "time";

interface AdminRouterProps { onBack: () => void; }

export default function AdminRouter({ onBack }: AdminRouterProps) {
  const [tab, setTab] = useState<AdminTab>("users");
  const links = [
    { id: "users" as const, label: "Пользователи", icon: Users },
    { id: "catalog" as const, label: "Справочник", icon: BookOpen },
    { id: "statistics" as const, label: "Статистика", icon: BarChart3 },
    { id: "time" as const, label: "Учёт времени", icon: Clock },
  ];

  const renderContent = () => {
    switch (tab) {
      case "users": return <UsersPage />;
      case "catalog": return <CatalogPage />;
      case "statistics": return <StatisticsPage />;
      case "time": return <TimeTrackerPage />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-50 text-slate-900">
      <aside className="w-64 bg-slate-900 text-slate-100 p-4 flex flex-col shadow-xl">
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
          <span className="text-blue-400">ТКП·Про</span> Админ
        </h1>
        <nav className="flex-1 space-y-2">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <button key={l.id} onClick={() => setTab(l.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-left ${tab === l.id ? "bg-blue-600 text-white" : "hover:bg-slate-800 text-slate-300"}`}>
                <Icon size={18} /> <span>{l.label}</span>
              </button>
            );
          })}
        </nav>
        <button onClick={onBack} className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white mt-auto">
          <ArrowLeft size={16} /> <LayoutDashboard size={16} /> <span>Вернуться в ТКП</span>
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-8 bg-slate-50">{renderContent()}</main>
    </div>
  );
}
