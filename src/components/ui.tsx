import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../store";
import { IcCheck, IcAlert, IcInfo, IcMinus, IcPlus, IcX, IcChevronDown } from "./icons";

export const cx = (...xs: (string | false | undefined | null)[]) => xs.filter(Boolean).join(" ");

/* ------------------------------ Кнопки ------------------------------ */

type BtnProps = {
  variant?: "primary" | "dark" | "outline" | "ghost" | "danger";
  size?: "md" | "sm" | "xs";
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
};

export const Btn = ({ variant = "primary", size = "md", className, children, ...rest }: BtnProps) => (
  <button
    type={rest.type ?? "button"}
    title={rest.title}
    disabled={rest.disabled}
    onClick={rest.onClick}
    className={cx(
      "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-all duration-150 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
      size === "md" && "h-9 px-3.5 text-[13px]",
      size === "sm" && "h-8 px-3 text-xs",
      size === "xs" && "h-7 px-2.5 text-[11.5px]",
      variant === "primary" && "bg-accent text-white shadow-sm shadow-accent/40 hover:bg-accent-deep",
      variant === "dark" && "bg-dark text-white hover:bg-darkline",
      variant === "outline" && "border border-line2 bg-card text-ink hover:border-ink/40 hover:shadow-sm",
      variant === "ghost" && "text-ink2 hover:bg-line/50 hover:text-ink",
      variant === "danger" && "bg-heat text-white hover:brightness-90",
      className
    )}
  >
    {children}
  </button>
);

export const IconBtn = ({
  title,
  onClick,
  children,
  danger,
  className,
}: {
  title: string;
  onClick?: () => void;
  children: ReactNode;
  danger?: boolean;
  className?: string;
}) => (
  <button
    type="button"
    title={title}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.();
    }}
    className={cx(
      "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-mute transition-all duration-150 active:scale-90",
      danger ? "hover:bg-heat-soft hover:text-heat" : "hover:bg-line/60 hover:text-ink",
      className
    )}
  >
    {children}
  </button>
);

/* ------------------------------ Поля ------------------------------ */

export const Field = ({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) => (
  <label className={cx("block", className)}>
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-mute">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
  </label>
);

const inputCls =
  "h-9 w-full rounded-md border border-line bg-card px-3 text-[13px] font-medium text-ink outline-none transition-all duration-150 placeholder:font-normal placeholder:text-mute/70 focus:border-accent focus:ring-2 focus:ring-accent/15";

export const Input = ({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) => (
  <input
    className={cx(inputCls, className)}
    value={value}
    autoFocus={autoFocus}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
);

export const NumInput = ({
  value,
  onChange,
  className,
  min,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  min?: number;
  step?: number;
}) => (
  <input
    type="number"
    className={cx(inputCls, "text-right font-mono font-semibold tabular-nums", className)}
    value={Number.isFinite(value) ? value : 0}
    min={min}
    step={step ?? 1}
    onChange={(e) => onChange(Number(e.target.value))}
  />
);

export const Select = ({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) => (
  <div className={cx("relative", className)}>
    <select
      className="h-9 w-full cursor-pointer appearance-none rounded-md border border-line bg-card pl-3 pr-8 text-[13px] font-medium text-ink outline-none transition-all duration-150 focus:border-accent focus:ring-2 focus:ring-accent/15"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-mute">
      <IcChevronDown size={14} />
    </span>
  </div>
);

export const Textarea = ({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) => (
  <textarea
    className={cx(inputCls, "h-auto py-2 leading-relaxed")}
    rows={rows}
    value={value}
    placeholder={placeholder}
    onChange={(e) => onChange(e.target.value)}
  />
);

export const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button
    type="button"
    onClick={() => onChange(!on)}
    className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2.5 transition-colors hover:border-line2"
  >
    <span className="text-[13px] font-semibold">{label}</span>
    <span
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-accent" : "bg-line2"
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
          on && "translate-x-4"
        )}
      />
    </span>
  </button>
);

/* ------------------------------ Бейджи и сегменты ------------------------------ */

export const Badge = ({ children, cls }: { children: ReactNode; cls: string }) => (
  <span className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide uppercase", cls)}>
    {children}
  </span>
);

export const Seg = ({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: ReactNode }[];
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="inline-flex rounded-lg border border-line bg-line/40 p-0.5">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={cx(
          "cursor-pointer rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-bold transition-all duration-150",
          value === o.value ? "bg-dark text-white shadow-sm" : "text-ink2 hover:text-ink"
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

/* ------------------------------ Модальное окно ------------------------------ */

export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  w = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  w?: string;
}) => {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="anim-backdrop fixed inset-0 bg-dark/55 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx("anim-scale relative w-full rounded-xl border border-line bg-card shadow-2xl shadow-dark/30", w)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="font-display text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
          <IconBtn title="Закрыть" onClick={onClose}>
            <IcX size={15} />
          </IconBtn>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};

/* ------------------------------ Степпер количества ------------------------------ */

export const Stepper = ({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) => (
  <div className="inline-flex items-center rounded-md border border-line bg-card">
    <button
      type="button"
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-l-md text-mute transition-colors hover:bg-line/60 hover:text-ink active:scale-90"
      onClick={() => onChange(Math.max(step, value - step))}
    >
      <IcMinus size={13} />
    </button>
    <input
      type="number"
      className="h-7 w-14 border-x border-line bg-transparent text-center font-mono text-[12.5px] font-semibold outline-none"
      value={value}
      step={step}
      onChange={(e) => onChange(Math.max(step, Number(e.target.value) || step))}
    />
    <button
      type="button"
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-r-md text-mute transition-colors hover:bg-line/60 hover:text-ink active:scale-90"
      onClick={() => onChange(value + step)}
    >
      <IcPlus size={13} />
    </button>
  </div>
);

/* ------------------------------ Пустое состояние ------------------------------ */

export const EmptyState = ({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) => (
  <div className="anim-up flex flex-col items-center justify-center rounded-xl border border-dashed border-line2 bg-card/60 px-6 py-12 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-dark text-accent">{icon}</div>
    <h3 className="font-display text-[14px] font-semibold text-ink">{title}</h3>
    <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-mute">{text}</p>
    {children && <div className="mt-4">{children}</div>}
  </div>
);

/* ------------------------------ Тосты ------------------------------ */

export const ToastHost = () => {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), 3200));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "anim-toast pointer-events-auto flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] font-semibold shadow-lg",
            t.kind === "ok" && "border-ok/30 bg-dark text-white",
            t.kind === "err" && "border-heat/40 bg-heat text-white",
            t.kind === "info" && "border-steel/40 bg-dark text-white"
          )}
        >
          <span className={cx("shrink-0", t.kind === "ok" ? "text-ok" : t.kind === "err" ? "text-heat-soft" : "text-steel-soft")}>
            {t.kind === "ok" ? <IcCheck size={15} /> : t.kind === "err" ? <IcAlert size={15} /> : <IcInfo size={15} />}
          </span>
          <span className="flex-1">{t.text}</span>
          <button className="cursor-pointer opacity-50 transition-opacity hover:opacity-100" onClick={() => dismiss(t.id)}>
            <IcX size={13} />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
};
