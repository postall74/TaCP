import { useState } from "react";
import AdminLayout from "./components/AdminLayout";
import UsersPage from "./components/UsersPage";
import CatalogPage from "./components/CatalogPage";
import StatisticsPage from "./components/StatisticsPage";
import TimeTrackerPage from "./components/TimeTrackerPage";

type AdminTab = "users" | "catalog" | "statistics" | "time";

interface AdminRouterProps {
  onBack: () => void;
}

export default function AdminRouter({ onBack }: AdminRouterProps) {
  const [tab, setTab] = useState<AdminTab>("users");

  const renderContent = () => {
    switch (tab) {
      case "users": return <UsersPage />;
      case "catalog": return <CatalogPage />;
      case "statistics": return <StatisticsPage />;
      case "time": return <TimeTrackerPage />;
    }
  };

  return (
    <AdminLayout onBack={onBack} tab={tab} setTab={setTab}>
      {renderContent()}
    </AdminLayout>
  );
}