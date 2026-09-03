import { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export function Btn({ children, onClick, variant = "primary", size = "md", disabled, title, className }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md"; disabled?: boolean; title?: string; className?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-[12px]" : "h-10 px-4 text-[13px]",
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

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold tracking-wide text-mute uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-mute">{hint}</span>}
    </label>
  );
}

export function NumInput({ value, step = 1, onChange, min }: { value: number; step?: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-line bg-card transition-colors focus-within:border-steel">
      <button type="button" className="w-8 cursor-pointer text-mute transition-colors hover:bg-paper hover:text-ink"
        onClick={() => onChange(Math.max(min ?? 0, value - step))} aria-label="меньше">
        <Minus size={13} className="mx-auto" />
      </button>
      <input
        type="number" value={value} min={min}
        onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
        className="num w-full min-w-0 border-x border-line bg-transparent px-1 text-center text-[13px] font-bold text-ink outline-none"
      />
      <button type="button" className="w-8 cursor-pointer text-mute transition-colors hover:bg-paper hover:text-ink"
        onClick={() => onChange(value + step)} aria-label="больше">
        <Plus size={13} className="mx-auto" />
      </button>
    </div>
  );
}

export function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full cursor-pointer rounded-md border border-line bg-card px-2 text-[12.5px] font-semibold text-ink outline-none transition-colors focus:border-steel"
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="group flex cursor-pointer items-center gap-2.5 text-left">
      <span className={cx(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
        on ? "bg-ok" : "bg-line2 group-hover:bg-mute/60",
      )}>
        <span className={cx(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
          on ? "translate-x-[18px]" : "translate-x-0.5",
        )} />
      </span>
      <span className={cx("text-[12.5px] font-bold", on ? "text-ink" : "text-ink2")}>{label}</span>
    </button>
  );
}

export function Badge({ children, tone = "steel" }: { children: ReactNode; tone?: "steel" | "ok" | "warn" | "accent" | "dark" }) {
  return (
    <span className={cx(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold",
      tone === "steel" && "bg-steel-soft text-steel",
      tone === "ok" && "bg-ok-soft text-ok",
      tone === "warn" && "bg-warn-soft text-warn",
      tone === "accent" && "bg-accent-soft text-accent-deep",
      tone === "dark" && "bg-dark text-white",
    )}>
      {children}
    </span>
  );
}

/** Выровненная строка опросника «вопрос — количество». Единая сетка шага. */
export function CountRow({ label, hint, value, onChange, step = 1, min = 0 }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 transition-colors last:border-b-0 hover:bg-paper/60">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] leading-snug text-mute">{hint}</div>}
      </div>
      <div className="w-[120px] shrink-0">
        <NumInput value={value} step={step} min={min} onChange={onChange} />
      </div>
    </div>
  );
}

/** Выровненная строка «вопрос — выпадающий список» (та же сетка, что у CountRow). */
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

/** Выровненная строка «вопрос — переключатель». */
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
