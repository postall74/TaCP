import { useEffect, type ReactNode } from "react";

/* ============================================================
   UI-КИТ: единый промышленный стиль приложения.
   ============================================================ */

export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");

/* ---------------- кнопки ---------------- */

const BTN_SIZE = {
  xs: "h-7 px-2 text-[11px] gap-1 rounded-md",
  sm: "h-8 px-3 text-[11.5px] gap-1.5 rounded-md",
  md: "h-9 px-4 text-[12.5px] gap-1.5 rounded-lg",
} as const;

const BTN_VARIANT = {
  primary: "bg-accent text-white shadow-sm shadow-accent/30 hover:bg-accent-deep",
  outline: "border border-line bg-card text-ink2 hover:border-line2 hover:bg-paper",
  ghost: "text-mute hover:bg-line/50 hover:text-ink",
  danger: "bg-heat text-white shadow-sm shadow-heat/30 hover:brightness-110",
} as const;

export function Btn({
  size = "md", variant = "primary", className, title, disabled, onClick, children,
}: {
  size?: keyof typeof BTN_SIZE;
  variant?: keyof typeof BTN_VARIANT;
  className?: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center font-bold whitespace-nowrap transition-all duration-150 active:scale-95",
        BTN_SIZE[size], BTN_VARIANT[variant],
        disabled && "cursor-not-allowed opacity-45 active:scale-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconBtn({
  title, danger, onClick, children,
}: { title: string; danger?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx(
        "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-all duration-150 active:scale-90",
        danger ? "text-mute hover:bg-heat-soft hover:text-heat" : "text-mute hover:bg-paper hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ---------------- поля ввода ---------------- */

const FIELD_CLS =
  "h-9 w-full rounded-md border border-line bg-card px-3 text-[12.5px] font-medium text-ink outline-none transition-all duration-150 placeholder:text-mute/70 hover:border-line2 focus:border-accent focus:ring-2 focus:ring-accent/15";

export function Input({
  value, onChange, placeholder, className, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cx(FIELD_CLS, className)}
    />
  );
}

export function NumInput({
  value, step = 1, onChange, className,
}: {
  value: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      step={step}
      min={0}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className={cx(FIELD_CLS, "font-mono", className)}
    />
  );
}

export function Textarea({
  value, onChange, rows = 3, placeholder, className,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cx(FIELD_CLS, "h-auto resize-y py-2 leading-relaxed", className)}
    />
  );
}

export function Select({
  value, onChange, options, className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(FIELD_CLS, "cursor-pointer appearance-none bg-no-repeat pr-8 select-field", className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Сегментированный переключатель. */
export function Seg({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-paper p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "cursor-pointer rounded-md px-3 py-1.5 text-[11.5px] font-bold transition-all duration-150",
            value === o.value ? "bg-dark text-white shadow-sm" : "text-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Компактный счётчик «−  значение  +». */
export function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="inline-flex shrink-0 items-center overflow-hidden rounded-md border border-line bg-card">
      <button type="button" onClick={() => onChange(value - 1)} className="flex h-7 w-7 cursor-pointer items-center justify-center text-mute transition-colors hover:bg-paper hover:text-heat active:bg-heat-soft" title="Уменьшить">
        <span className="text-[15px] leading-none font-bold">−</span>
      </button>
      <span className="w-9 border-x border-line text-center font-mono text-[12px] font-bold text-ink">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} className="flex h-7 w-7 cursor-pointer items-center justify-center text-mute transition-colors hover:bg-paper hover:text-ok active:bg-ok-soft" title="Увеличить">
        <span className="text-[15px] leading-none font-bold">+</span>
      </button>
    </span>
  );
}

/* ---------------- разметка ---------------- */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-bold tracking-wide text-mute uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-mute">{hint}</span>}
    </label>
  );
}

export function Badge({ cls, children }: { cls?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide uppercase", cls)}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon, title, text, children,
}: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="anim-scale flex flex-col items-center rounded-xl border border-dashed border-line2 bg-card/60 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-dark text-white shadow-lg shadow-dark/20">{icon}</span>
      <div className="mt-3 font-display text-[14px] font-bold text-ink">{title}</div>
      <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-mute">{text}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ---------------- модальное окно ---------------- */

export function Modal({
  open, onClose, title, w = "max-w-lg", footer, children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  w?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-dark/60 p-4 backdrop-blur-sm lg:p-10" onMouseDown={onClose}>
      <div
        className={cx("anim-scale my-auto flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-2xl", w)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line bg-card px-5 py-3.5">
          <span className="font-display text-[13.5px] font-bold text-ink">{title}</span>
          <IconBtn title="Закрыть" onClick={onClose}>
            <span className="text-[15px] leading-none font-bold">×</span>
          </IconBtn>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-card px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

