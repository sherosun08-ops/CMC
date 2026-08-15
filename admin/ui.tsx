/** Shared UI primitives — the ONE set of states, drawer, toasts, table shell. */
import React, { createContext, useCallback, useContext, useState } from 'react';

export function Spinner() {
  return <div className="spinner" aria-label="loading" />;
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state">
      <Spinner />
      <div>{label}</div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="state">
      <div className="icon">◌</div>
      <div style={{ fontWeight: 650, color: 'var(--text)' }}>{title}</div>
      {hint && <div style={{ fontSize: 13 }}>{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="icon" style={{ color: 'var(--danger)' }}>⚠</div>
      <div style={{ color: 'var(--danger)' }}>{message}</div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Drawer({ title, onClose, children, footer, wide }: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" style={wide ? { width: 'min(860px, 96vw)' } : undefined}>
        <div className="drawer-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, body, onCancel, onConfirm, danger }: {
  title: string; body: string; onCancel: () => void; onConfirm: () => void; danger?: boolean;
}) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal card-pad">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p style={{ color: 'var(--text-dim)' }}>{body}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ── toasts ──
type Toast = { id: number; text: string; kind: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'err') => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Badge({ value }: { value: unknown }) {
  const s = String(value ?? '');
  const map: Record<string, string> = {
    published: 'badge-ok', active: 'badge-ok', approved: 'badge-ok', paid: 'badge-ok',
    completed: 'badge-ok', fulfilled: 'badge-ok', done: 'badge-ok',
    draft: 'badge-warn', pending: 'badge-warn', invited: 'badge-warn',
    archived: 'badge', suspended: 'badge-danger', cancelled: 'badge-danger',
    refunded: 'badge-danger', rejected: 'badge-danger', failed: 'badge-danger',
  };
  return <span className={`badge ${map[s] ?? 'badge-accent'}`}>{s}</span>;
}

export function formatCell(value: unknown, type?: string): React.ReactNode {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  if (type === 'money') return <span>{(Number(value) / 100).toFixed(2)}</span>;
  if (type === 'boolean') return value ? '✓' : '✗';
  if (type === 'datetime') return new Date(String(value)).toLocaleString();
  if (type === 'blocks') return <span className="badge">{Array.isArray(value) ? `${value.length} blocks` : 'blocks'}</span>;
  if (type === 'json') return <span className="badge">json</span>;
  const s = String(value);
  if (['status'].includes(type ?? '')) return <Badge value={s} />;
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}
