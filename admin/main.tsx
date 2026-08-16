/**
 * CMC Admin — one schema-driven SPA. Navigation is generated from the
 * Schema Registry; every collection screen is the same CollectionBrowser.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, RequestError, type CollectionDef } from './api.js';
import { ToastProvider, LoadingState, useToast, Badge, Drawer, EmptyState } from './ui.js';
import { CollectionBrowser } from './components/collection-browser.js';
import { Dashboard } from './screens/dashboard.js';
import { SchemaDesigner } from './screens/schema-designer.js';
import { MediaLibrary } from './screens/media.js';
import { ActivityLog, Settings, OrderActions, StockActions } from './screens/misc.js';

type Session = { user: Record<string, unknown>; admin: boolean; permissions: Record<string, string[]> };

// ── tiny hash router ──
function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const fn = () => setPath(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return [path, (p) => (location.hash = p)];
}

const NAV_GROUPS: { label: string; match: (c: CollectionDef) => boolean }[] = [
  { label: 'Content', match: (c) => ['pages'].includes(c.name) || (c.kind === 'user') },
  { label: 'Commerce', match: (c) => ['products', 'product_variants', 'orders', 'discounts', 'carts', 'inventory_movements'].includes(c.name) },
  { label: 'People & access', match: (c) => ['users', 'roles', 'policies'].includes(c.name) },
  { label: 'Platform', match: (c) => ['webhooks', 'notifications', 'settings'].includes(c.name) },
];

function App() {
  const [session, setSession] = useState<Session | null | 'loading'>('loading');
  const [collections, setCollections] = useState<CollectionDef[]>([]);
  const [path, navigate] = usePath();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadCollections = useCallback(() => {
    api.collections().then((r) => setCollections(r.data.filter((c) => !c.internal))).catch(() => setCollections([]));
  }, []);

  useEffect(() => {
    api.me()
      .then((r) => {
        setSession(r.data as Session);
        loadCollections();
      })
      .catch(() => setSession(null));
  }, [loadCollections]);

  if (session === 'loading') return <div className="auth-wrap"><LoadingState /></div>;
  if (session === null) {
    return <Login onLogin={(s) => {
      setSession(s);
      loadCollections();
    }} />;
  }

  const perms = session.permissions ?? {};
  const can = (col: string, action: string) => session.admin || (perms[col] ?? []).includes(action);

  return (
    <div className="shell">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)}>
        <div className="sidebar-brand"><span className="dot" /> CMC</div>
        <NavItem label="Dashboard" path="/" current={path} onNavigate={navigate} />
        {NAV_GROUPS.map((group) => {
          const cols = collections.filter((c) => group.match(c) && can(c.name, 'read'));
          if (group.label === 'Content') {
            // media + designer live under Content
            return (
              <React.Fragment key={group.label}>
                <div className="sidebar-section">{group.label}</div>
                {cols.map((c) => (
                  <NavItem key={c.name} label={c.label ?? c.name} path={`/collections/${c.name}`} current={path} onNavigate={navigate} />
                ))}
                {can('files', 'read') && <NavItem label="Media" path="/media" current={path} onNavigate={navigate} />}
                {session.admin && <NavItem label="Data model" path="/schema" current={path} onNavigate={navigate} />}
              </React.Fragment>
            );
          }
          if (cols.length === 0) return null;
          return (
            <React.Fragment key={group.label}>
              <div className="sidebar-section">{group.label}</div>
              {cols.map((c) => (
                <NavItem key={c.name} label={c.label ?? c.name} path={`/collections/${c.name}`} current={path} onNavigate={navigate} />
              ))}
            </React.Fragment>
          );
        })}
        {session.admin && (
          <>
            <div className="sidebar-section">System</div>
            <NavItem label="Activity" path="/activity" current={path} onNavigate={navigate} />
            <NavItem label="Settings" path="/settings" current={path} onNavigate={navigate} />
            <NavItem label="API docs" path="/apidocs" current={path} onNavigate={navigate} />
          </>
        )}
        <div style={{ flex: 1 }} />
      </aside>

      <div className="main">
        <Topbar session={session} onMenu={() => setSidebarOpen(!sidebarOpen)} onLogout={async () => {
          await api.logout().catch(() => {});
          setSession(null);
        }} onNavigate={navigate} />
        <main className="content">
          <Route path={path} navigate={navigate} collections={collections} session={session} can={can} onSchemaChanged={loadCollections} />
        </main>
      </div>
    </div>
  );
}

function Route({ path, navigate, collections, session, can, onSchemaChanged }: {
  path: string;
  navigate: (p: string) => void;
  collections: CollectionDef[];
  session: Session;
  can: (col: string, action: string) => boolean;
  onSchemaChanged: () => void;
}) {
  if (path === '/') {
    return session.admin ? <Dashboard onNavigate={navigate} /> : <EmptyState title={`Welcome`} hint="Use the sidebar to browse what you have access to." />;
  }
  if (path === '/media') return <MediaLibrary />;
  if (path === '/schema') return <SchemaDesigner onChanged={onSchemaChanged} />;
  if (path === '/activity') return <ActivityLog />;
  if (path === '/settings') return <Settings />;
  if (path === '/apidocs') return <ApiDocs />;
  const m = path.match(/^\/collections\/([a-z0-9_]+)$/);
  if (m) {
    const col = collections.find((c) => c.name === m[1]);
    if (!col) return <EmptyState title="Collection not found" />;
    const extraRowActions = col.name === 'orders'
      ? (record: Record<string, unknown>, reload: () => void) => <OrderActions record={record} reload={reload} />
      : col.name === 'product_variants'
        ? (record: Record<string, unknown>, reload: () => void) => <StockActions record={record} reload={reload} />
        : undefined;
    return (
      <CollectionBrowser
        key={col.name}
        collection={col}
        canWrite={{ create: can(col.name, 'create'), update: can(col.name, 'update'), delete: can(col.name, 'delete') }}
        extraRowActions={extraRowActions}
      />
    );
  }
  return <EmptyState title="Page not found" />;
}

function NavItem({ label, path, current, onNavigate }: { label: string; path: string; current: string; onNavigate: (p: string) => void }) {
  return (
    <button className={`nav-item ${current === path ? 'active' : ''}`} onClick={() => onNavigate(path)}>
      {label}
    </button>
  );
}

function Topbar({ session, onMenu, onLogout, onNavigate }: {
  session: Session; onMenu: () => void; onLogout: () => void; onNavigate: (p: string) => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ collection: string; recordId: string; title: string }[] | null>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [notifs, setNotifs] = useState<Record<string, unknown>[]>([]);
  const unread = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    api.notifications().then((r) => setNotifs(r.data)).catch(() => {});
    const t = setInterval(() => api.notifications().then((r) => setNotifs(r.data)).catch(() => {}), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setHits(null);
      return;
    }
    const t = setTimeout(() => api.search(q).then((r) => setHits(r.data)).catch(() => setHits([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="topbar">
      <button className="btn btn-ghost btn-sm" style={{ display: 'none' }} onClick={onMenu}>☰</button>
      <div style={{ position: 'relative', width: 'min(380px, 40vw)' }}>
        <input className="input" placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} />
        {hits && (
          <div className="card" style={{ position: 'absolute', top: 42, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 30, maxHeight: 320, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
            {hits.length === 0 ? (
              <div style={{ padding: 14, color: 'var(--text-faint)', fontSize: 13 }}>No results</div>
            ) : (
              hits.map((h, i) => (
                <div key={i} className="row" style={{ padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onClick={() => {
                    onNavigate(`/collections/${h.collection}`);
                    setQ('');
                  }}>
                  <span className="badge badge-accent">{h.collection}</span>
                  <span style={{ fontSize: 13 }}>{h.title}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <div className="spacer" />
      <button className="btn btn-ghost btn-sm" style={{ position: 'relative' }} onClick={() => setShowNotif(true)}>
        ◔ {unread > 0 && <span className="badge badge-danger" style={{ marginInlineStart: 4 }}>{unread}</span>}
      </button>
      <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{String(session.user.email)}</span>
      <button className="btn btn-sm" onClick={onLogout}>Sign out</button>

      {showNotif && (
        <Drawer title="Notifications" onClose={() => setShowNotif(false)}>
          {notifs.length === 0 ? (
            <EmptyState title="All caught up" />
          ) : (
            <div className="stack">
              {notifs.map((n) => (
                <div key={String(n.id)} className="card card-pad" style={{ padding: '12px 16px', opacity: n.read ? 0.55 : 1 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13.5 }}>{String(n.subject)}</strong>
                    {!n.read && (
                      <button className="btn btn-ghost btn-sm" onClick={async () => {
                        await api.markRead(String(n.id)).catch(() => {});
                        setNotifs(notifs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                      }}>Mark read</button>
                    )}
                  </div>
                  {typeof n.body === 'string' && n.body && <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{n.body}</div>}
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{new Date(String(n.created_at)).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      const me = await api.me();
      onLogin(me.data as Session);
    } catch (err) {
      setError(err instanceof RequestError ? err.apiError.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card card card-pad" onSubmit={submit}>
        <div className="auth-logo"><span className="dot" style={{ width: 12, height: 12, borderRadius: 4, background: 'var(--accent)', boxShadow: '0 0 14px var(--accent)' }} /> CMC</div>
        {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="stack">
          <div className="field">
            <label className="field-label">Email</label>
            <input className="input" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Password</label>
            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ApiDocs() {
  const [doc, setDoc] = useState<Record<string, any> | null>(null);
  useEffect(() => {
    fetch('/api/openapi.json').then((r) => r.json()).then(setDoc).catch(() => setDoc({}));
  }, []);
  if (!doc) return <LoadingState />;
  const paths = Object.entries(doc.paths ?? {});
  return (
    <div>
      <h1 className="page-title">API reference</h1>
      <p className="page-sub">Generated live from the schema registry · <a href="/api/openapi.json" target="_blank" rel="noreferrer">openapi.json</a></p>
      <div className="stack">
        {paths.map(([p, methods]) => (
          <div key={p} className="card card-pad" style={{ padding: '12px 18px' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{p}</div>
            <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {Object.entries(methods as Record<string, any>).map(([verb, op]) => (
                <span key={verb} className="row" style={{ gap: 6 }}>
                  <Badge value={verb.toUpperCase()} />
                  <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{op.summary}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
