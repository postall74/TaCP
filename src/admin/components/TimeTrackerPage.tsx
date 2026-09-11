import { useState, useEffect } from "react";
import { useStore } from "../../store";
import { Play, Square, Clock, Download } from "lucide-react";
import { Btn } from "../../components/ui";

/**
 * Учёт времени подготовки ТКП (видит только админ).
 * Регистрирует время начала/окончания работы над каждым проектом.
 * Стиль соответствует основному приложению (токены bg-card, text-ink и т.д.)
 */
export default function TimeTrackerPage() {
  const projects = useStore((s) => s.projects);
  const toast = useStore((s) => s.toast);

  interface TimeEntry {
    projectId: string;
    projectTitle: string;
    startTime: number;
    endTime: number | null;
  }

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});

  // Загрузка сохранённых записей из localStorage
  useEffect(() => {
    const saved = localStorage.getItem("tkp_time_tracking");
    if (saved) {
      try {
        setEntries(JSON.parse(saved));
      } catch {}
    }
    // Восстановление активных таймеров
    const activeSaved = localStorage.getItem("tkp_active_timers");
    if (activeSaved) {
      try {
        setActiveTimers(JSON.parse(activeSaved));
      } catch {}
    }
  }, []);

  const saveEntries = (newEntries: TimeEntry[]) => {
    setEntries(newEntries);
    localStorage.setItem("tkp_time_tracking", JSON.stringify(newEntries));
  };

  const saveActiveTimers = (timers: Record<string, number>) => {
    setActiveTimers(timers);
    localStorage.setItem("tkp_active_timers", JSON.stringify(timers));
  };

  const startTimer = (projectId: string, title: string) => {
    const now = Date.now();
    saveActiveTimers({ ...activeTimers, [projectId]: now });
    toast(`Таймер запущен: ${title}`, "ok");
  };

  const stopTimer = (projectId: string, title: string) => {
    const startTime = activeTimers[projectId];
    if (!startTime) return;

    const entry: TimeEntry = {
      projectId,
      projectTitle: title,
      startTime,
      endTime: Date.now(),
    };
    saveEntries([entry, ...entries]);
    
    const { [projectId]: _, ...rest } = activeTimers;
    saveActiveTimers(rest);
    
    const duration = formatDuration(Date.now() - startTime);
    toast(`Таймер остановлен: ${title} (${duration})`, "ok");
  };

  const formatDuration = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatDateTime = (ts: number) => {
    return new Date(ts).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const totalHours = entries.reduce((sum, e) => {
    if (e.endTime) return sum + (e.endTime - e.startTime);
    return sum;
  }, 0);

  const exportCSV = () => {
    const data = entries.map((e) => ({
      Проект: e.projectTitle,
      Начало: formatDateTime(e.startTime),
      Окончание: e.endTime ? formatDateTime(e.endTime) : "В процессе",
      Длительность: e.endTime ? formatDuration(e.endTime - e.startTime) : "—",
    }));
    const headers = Object.keys(data[0] || {});
    const csv = [headers.join(";"), ...data.map((row) => Object.values(row).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "учёт_времени_ТКП.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-display text-[26px] font-bold tracking-tight text-ink">Учёт времени подготовки ТКП</h2>
          <p className="mt-1 text-[13.5px] text-mute">
            Записей: {entries.length} · Общее время: {formatDuration(totalHours)}
          </p>
        </div>
        <Btn variant="ghost" onClick={exportCSV}>
          <Download size={18} /> Экспорт CSV
        </Btn>
      </div>

      {/* Список проектов с таймерами */}
      <div className="bg-card rounded-lg shadow mb-6 overflow-hidden border border-line">
        <div className="px-6 py-4 border-b border-line bg-dark/50">
          <h3 className="font-semibold text-ink">Запуск/остановка таймера</h3>
        </div>
        <div className="divide-y divide-line">
          {projects.map((p) => {
            const isActive = !!activeTimers[p.id];
            const elapsed = isActive ? Date.now() - activeTimers[p.id] : 0;
            return (
              <div key={p.id} className="px-6 py-3 flex items-center justify-between hover:bg-dark/30 transition-colors">
                <div>
                  <div className="font-medium text-ink">{p.title}</div>
                  <div className="text-sm text-muted">{p.direction || "Без направления"}</div>
                </div>
                <div className="flex items-center gap-3">
                  {isActive && (
                    <span className="font-mono text-ok">{formatDuration(elapsed)}</span>
                  )}
                  <button
                    onClick={() =>
                      isActive ? stopTimer(p.id, p.title) : startTimer(p.id, p.title)
                    }
                    className={`px-3 py-1.5 rounded-md flex items-center gap-2 text-sm transition-colors ${
                      isActive
                        ? "bg-heat/10 text-heat hover:bg-heat/20"
                        : "bg-ok/10 text-ok hover:bg-ok/20"
                    }`}
                  >
                    {isActive ? <Square size={14} /> : <Play size={14} />}
                    {isActive ? "Стоп" : "Старт"}
                  </button>
                </div>
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="px-6 py-8 text-center text-muted">
              Нет проектов. Создайте проект чтобы начать учёт времени.
            </div>
          )}
        </div>
      </div>

      {/* История записей */}
      <div className="bg-card rounded-lg shadow overflow-hidden border border-line">
        <div className="px-6 py-4 border-b border-line bg-dark/50">
          <h3 className="font-semibold text-ink">История рабочего времени</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-dark/50 text-ink2 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-6 py-3 text-left">Проект</th>
              <th className="px-6 py-3 text-left">Начало</th>
              <th className="px-6 py-3 text-left">Окончание</th>
              <th className="px-6 py-3 text-right">Длительность</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e, i) => (
              <tr key={i} className="hover:bg-dark/30 transition-colors">
                <td className="px-6 py-3 text-ink">{e.projectTitle}</td>
                <td className="px-6 py-3 text-ink2">{formatDateTime(e.startTime)}</td>
                <td className="px-6 py-3 text-ink2">
                  {e.endTime ? formatDateTime(e.endTime) : (
                    <span className="text-ok flex items-center gap-1">
                      <Clock size={14} /> В процессе
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-right font-mono text-ink">
                  {e.endTime ? formatDuration(e.endTime - e.startTime) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && (
          <div className="px-6 py-8 text-center text-muted">
            Записей пока нет. Запустите таймер для проекта выше.
          </div>
        )}
      </div>
    </div>
  );
}
