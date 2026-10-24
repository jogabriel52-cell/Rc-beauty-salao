// Componentes de interface compartilhados.
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({ variant = "primary", busy, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...rest} className={`btn btn-${variant} ${rest.className ?? ""}`} disabled={rest.disabled || busy}
      aria-busy={busy || undefined}>
      {busy ? "Aguarde…" : children}
    </button>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className={`field ${error ? "field-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error && <small className="hint">{hint}</small>}
      {error && <small className="error-text" role="alert">{error}</small>}
    </div>
  );
}

export function TextInput({ label, hint, error, ...rest }:
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  return <Field label={label} hint={hint} error={error}>{(id) => <input id={id} {...rest} />}</Field>;
}

export function SelectInput({ label, hint, error, children, ...rest }:
  SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id) => <select id={id} {...rest}>{children}</select>}
    </Field>
  );
}

export function TextArea({ label, hint, error, ...rest }:
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string | null }) {
  return <Field label={label} hint={hint} error={error}>{(id) => <textarea id={id} rows={3} {...rest} />}</Field>;
}

export function Checkbox({ label, checked, onChange, disabled }:
  { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "info"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return <div className="spinner" role="status">{label}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Modal({ title, onClose, children, footer, wide }:
  { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }:
  { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value}
          className={`tab ${value === i.value ? "tab-active" : ""}`} onClick={() => onChange(i.value)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
