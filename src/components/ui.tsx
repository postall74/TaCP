import { ReactNode } from "react";
import { IcMinus, IcPlus, IcX } from "./icons";

/* ============================================================
   UI-ПРИМИТИВЫ ТКП·Про: единый визуальный язык приложения.
   ============================================================ */

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------------- кнопки ---------------- */

export function Btn({ children, onClick, variant = "primary", size = "md", disabled, title, className }: {
  children: ReactNode; onClick?: () => void;
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "xs" | "sm" | "md"; disabled?: boolean; title?: string; className?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        size === "xs" && "h-7 px-2.5 text-[11px]",
        size === "sm" && "h-8 px-3 text-[12px]",
        size === "md" && "h-10 px-4 text-[13px]",
        variant === "primary" && "bg-accent text-white shadow-md shadow-accent/25 hover:bg-accent-deep",
        variant === "outline" && "border border-line bg-card text-ink2 hover:border-steel hover:text-steel",
        variant === "ghost" && "text-ink2 hover:bg-paper",
        variant === "danger" && "bg-heat text-white hover:brightness-95",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, title, danger, className }: {
  children: ReactNode; onClick?: () => void; title?: string; danger?: boolean; className?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className={cx(
        "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-all duration-150 active:scale-90",
        danger ? "text-mute hover:bg-heat-soft hover:text-heat" : "text-mute hover:bg-steel-soft hover:text-steel",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- метки ---------------- */

export function Badge({ children, cls }: { children: ReactNode; cls?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold", cls ?? "bg-steel-soft text-steel")}>
      {children}
    </span>
  );
}

/* ---------------- поля ---------------- */

export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-[10.5px] font-bold tracking-wide text-mute uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-mute">{hint}</span>}
    </label>
  );
}

export function Input({ value, onChange, placeholder, type = "text", className, autoFocus, disabled }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
  className?: string; autoFocus?: boolean; disabled?: boolean;
}) {
  return (
    <input
      value={value} type={type} placeholder={placeholder} autoFocus={autoFocus} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        "h-9 w-full rounded-md border border-line bg-card px-3 text-[12.5px] font-semibold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-mute/70 focus:border-steel disabled:opacity-50",
        className,
      )}
    />
  );
}

export function Textarea({ value, onChange, placeholder, rows = 3, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string;
}) {
  return (
    <textarea
      value={value} placeholder={placeholder} rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        "w-full rounded-md border border-line bg-card px-3 py-2 text-[12.5px] font-semibold text-ink outline-none transition-colors placeholder:font-normal placeholder:text-mute/70 focus:border-steel",
        className,
      )}
    />
  );
}

export function NumInput({ value, step = 1, onChange, min, className, disabled }: {
  value: number; step?: number; onChange: (v: number) => void; min?: number; className?: string; disabled?: boolean;
}) {
  const clamp = (v: number) => (min !== undefined ? Math.max(min, v) : v);
  return (
    <div className={cx("flex h-9 items-stretch overflow-hidden rounded-md border border-line bg-card transition-colors focus-within:border-steel", className)}>
      <button type="button" disabled={disabled} aria-label="меньше"
        className="w-7 shrink-0 cursor-pointer text-mute transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
        onClick={() => onChange(clamp(value - step))}>
        <IcMinus size={12} />
      </button>
      <input
        type="number" value={value} min={min} disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value) || 0))}
        className="num w-full min-w-0 border-x border-line bg-transparent px-1 text-center text-[12.5px] font-bold text-ink outline-none"
      />
      <button type="button" disabled={disabled} aria-label="больше"
        className="w-7 shrink-0 cursor-pointer text-mute transition-colors hover:bg-paper hover:text-ink disabled:opacity-40"
        onClick={() => onChange(clamp(value + step))}>
        <IcPlus size={12} />
      </button>
    </div>
  );
}

export function Select({ value, onChange, options, className, disabled }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
  className?: string; disabled?: boolean;
}) {
  return (
    <select
      value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        "h-9 w-full cursor-pointer rounded-md border border-line bg-card px-2 text-[12px] font-semibold text-ink outline-none transition-colors focus:border-steel disabled:opacity-50",
        className,
      )}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Сегментированный переключатель (2–4 варианта). */
export function Seg({ value, onChange, options, className }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string;
}) {
  return (
    <div className={cx("inline-flex overflow-hidden rounded-md border border-line bg-card p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx(
            "cursor-pointer rounded px-2.5 py-1 text-[11.5px] font-bold transition-all duration-150",
            value === o.value ? "bg-dark text-white shadow-sm" : "text-ink2 hover:bg-paper",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Компактный степпер с пределами (перегородки, двери…). */
export function Stepper({ value, min = 0, max = 99, onChange }: {
  value: number; min?: number; max?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-8 items-stretch overflow-hidden rounded-md border border-line bg-card">
      <button type="button" aria-label="меньше" onClick={() => onChange(Math.max(min, value - 1))}
        className="w-7 cursor-pointer text-mute transition-colors hover:bg-paper hover:text-ink"><IcMinus size={12} /></button>
      <span className="num flex w-8 items-center justify-center border-x border-line text-[12px] font-bold text-ink">{value}</span>
      <button type="button" aria-label="больше" onClick={() => onChange(Math.min(max, value + 1))}
        className="w-7 cursor-pointer text-mute transition-colors hover:bg-paper hover:text-ink"><IcPlus size={12} /></button>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="group flex cursor-pointer items-center gap-2.5 text-left">
      <span className={cx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200", on ? "bg-ok" : "bg-line2 group-hover:bg-mute/60")}>
        <span className={cx("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      {label && <span className={cx("text-[12.5px] font-bold", on ? "text-ink" : "text-ink2")}>{label}</span>}
    </button>
  );
}

/* ---------------- модальное окно ---------------- */

export function Modal({ open, onClose, title, w = "max-w-lg", footer, children }: {
  open: boolean; onClose: () => void; title: ReactNode; w?: string; footer?: ReactNode; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="anim-backdrop fixed inset-0 z-50 flex items-center justify-center bg-dark/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={cx("anim-scale flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-2xl", w)} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <div className="text-[13.5px] font-bold text-ink">{title}</div>
          <IconBtn title="Закрыть" onClick={onClose}><IcX size={15} /></IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-card px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------- пустые состояния ---------------- */

export function EmptyState({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="anim-up flex flex-col items-center justify-center rounded-xl border border-dashed border-line2 bg-card/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-steel-soft text-steel">{icon}</div>}
      <div className="text-[14px] font-bold text-ink">{title}</div>
      {text && <div className="mt-1 max-w-md text-[12px] leading-relaxed text-mute">{text}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ---------------- строки опросника мастера ----------------
   Единая сетка «вопрос — элемент управления»: ровно, в два уровня,
   без разбежек (итерации А.3/А.6 дорожной карты). */

export function CountRow({ label, hint, value, onChange, step = 1, min = 0 }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 transition-colors last:border-b-0 hover:bg-paper/60">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] leading-snug text-mute">{hint}</div>}
      </div>
      <div className="w-[118px] shrink-0">
        <NumInput value={value} step={step} min={min} onChange={onChange} />
      </div>
    </div>
  );
}

export function SelectRow({ label, hint, value, onChange, options }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 transition-colors last:border-b-0 hover:bg-paper/60">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] leading-snug text-mute">{hint}</div>}
      </div>
      <div className="w-[220px] shrink-0">
        <Select value={value} onChange={onChange} options={options} />
      </div>
    </div>
  );
}

export function ToggleRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 transition-colors last:border-b-0 hover:bg-paper/60">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] leading-snug text-mute">{hint}</div>}
      </div>
      <div className="shrink-0"><Toggle on={on} onChange={onChange} label="" /></div>
    </div>
  );
}
