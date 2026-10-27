"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.4" />
        <rect x="14" y="3" width="7" height="7" rx="1.4" />
        <rect x="3" y="14" width="7" height="7" rx="1.4" />
        <rect x="14" y="14" width="7" height="7" rx="1.4" />
      </>
    ),
    layers: (
      <>
        <path d="m3 7 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    quote: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M7 8h10M7 12h10M7 16h6" />
      </>
    ),
    supplier: (
      <>
        <path d="M3 21V9l6 3V6l6 3V3h6v18H3Zm5-5h1m4 0h1m4 0h1" />
      </>
    ),
    inbox: (
      <>
        <path d="m4 4-2 11v5h20v-5L20 4H4Z" />
        <path d="M2 15h6l2 3h4l2-3h6" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5" />
      </>
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4L22 2ZM22 2 11 13" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    plus: <path d="M12 4v16M4 12h16" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    logout: (
      <>
        <path d="M9 3H3v18h6M8 12h13m-5-5 5 5-5 5" />
      </>
    ),
    menu: <path d="M3 6h18M3 12h18M3 18h18" />,
    down: <path d="m6 9 6 6 6-6" />,
    chart: (
      <>
        <path d="M3 3v18h18M7 17v-5m5 5V7m5 10V4" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.layers}
    </svg>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function EmptyState({
  title,
  detail,
  action,
  icon = "layers",
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  optional = false,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  optional?: boolean;
}) {
  const id = useId();
  const controlId = `field-${id}`;
  const hintId = `hint-${id}`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<{ id?: string; "aria-describedby"?: string }>, {
        id: controlId,
        ...(hint ? { "aria-describedby": hintId } : {}),
      })
    : children;
  return (
    <div className={`field${optional ? " optional" : ""}`}>
      <span>
        <label htmlFor={controlId}>{label}</label>
        {optional ? <small>Optional</small> : null}
      </span>
      {control}
      {hint ? (
        <small id={hintId} className="field-hint">
          {hint}
        </small>
      ) : null}
    </div>
  );
}

export function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <header className="modal-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description ? <p id={descriptionId}>{description}</p> : null}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function FormShell({
  children,
  error,
  busy,
  label = "Save changes",
  onSubmit,
  onClose,
}: {
  children: ReactNode;
  error: string;
  busy: boolean;
  label?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="modal-body">
        {children}
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
      <footer className="modal-footer">
        <span>Changes are saved to your shared workspace.</span>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : label}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </footer>
    </form>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <span className="coverage">
      <span
        className="progress-track"
        role="progressbar"
        aria-label="Material coverage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </span>
      <strong>{value}%</strong>
    </span>
  );
}

export function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

export function money(value: string | null, currency = "USD", maximumFractionDigits = 2) {
  if (value === null) return "N/A";
  // Formatting must not hide precision that the authoritative decimal strings retain.
  const exact = /^-?(\d+)(?:\.(\d+))?$/.exec(value);
  if (!exact) return `${value} ${currency}`;
  const places = Math.max(maximumFractionDigits, exact[2]?.length || 0);
  const scaled =
    BigInt(exact[1]) * 10n ** BigInt(places) + BigInt((exact[2] || "").padEnd(places, "0") || "0");
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(Number(value));
  } catch {
    return `${value} ${currency}`;
  }
}

export function label(value: string) {
  if (value === "LTA") return "LTA";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function values(form: HTMLFormElement): Record<string, FormDataEntryValue> {
  return Object.fromEntries(new FormData(form).entries());
}

export function downloadContent(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
