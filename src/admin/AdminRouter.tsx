import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { currentRole } from "../utils/roles";
import AdminLayout from "./components/AdminLayout";
import UsersPage from "./components/UsersPage";
import CatalogPage from "./components/CatalogPage";
import StatisticsPage from "./components/StatisticsPage";
import TimeTrackerPage from "./components/TimeTrackerPage";

export default function AdminRouter({ onBack }: { onBack: () => void }) {
  const user = useStore((s) => s.user);
  const location = useLocation();
  const navigate = useNavigate();
  // Guard the content, not only its navigation link.
  if (!user || currentRole(user) !== "admin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper p-6 text-ink">
        <h1 className="text-xl font-bold">Доступ ограничен</h1>
        <p>Административная панель доступна только администратору.</p>
        <button className="rounded-lg bg-accent px-4 py-2 font-bold text-white" onClick={onBack}>Вернуться в ТКП</button>
      </main>
    );
  }
  const tab = location.pathname.split("/")[2];
  return (
    <AdminLayout onBack={onBack} tab={tab} setTab={(next) => navigate(`/admin/${next}`)}>
      <Routes>
        <Route path="/admin" element={<Navigate to="/admin/users" replace />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/catalog" element={<CatalogPage />} />
        <Route path="/admin/statistics" element={<StatisticsPage />} />
        <Route path="/admin/time" element={<TimeTrackerPage />} />
        <Route path="*" element={<Navigate to="/admin/users" replace />} />
      </Routes>
    </AdminLayout>
  );
}
