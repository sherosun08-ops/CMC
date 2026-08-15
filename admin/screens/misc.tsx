/** Activity log, settings, and order detail — thin screens over the API. */
import React, { useEffect, useState } from 'react';
import { api, RequestError } from '../api.js';
import { LoadingState, EmptyState, ErrorState, Badge, useToast, Drawer } from '../ui.js';

export function ActivityLog() {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api.activity(page).then((r) => {
      setRows(r.data);
      setTotal(r.meta.total);
    }).catch((e) => setError(e.message));
  };
  useEffect(load, [page]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  return (
    <div>
      <h1 className="page-title">Activity</h1>
      <p className="page-sub">{total} audit entries — every mutation in the system</p>
      <div className="card">
        {rows === null ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <EmptyState title="No activity yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>action</th><th>collection</th><th>record</th><th>actor</th><th>ip</th><th>when</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} style={{ cursor: 'default' }}>
                    <td><Badge value={r.action} /></td>
                    <td>{String(r.collection ?? '—')}</td>
                    <td className="mono">{String(r.record_id ?? '').slice(0, 13)}…</td>
                    <td>{String(r.actor_email ?? 'system')}</td>
                    <td className="mono">{String(r.ip ?? '—')}</td>
                    <td className="mono">{new Date(String(r.created_at)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
        <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Page {page}</span>
        <button className="btn btn-sm" disabled={rows !== null && page * 50 >= total} onClick={() => setPage(page + 1)}>→</button>
      </div>
    </div>
  );
}

const SETTING_DEFS: { key: string; label: string; type: 'boolean' | 'string'; hint: string }[] = [
  { key: 'site.name', label: 'Site name', type: 'string', hint: 'Shown in public pages and notifications' },
  { key: 'auth.public_registration', label: 'Public registration', type: 'boolean', hint: 'Allow anyone to create an account via the API' },
  { key: 'auth.default_role', label: 'Default role id', type: 'string', hint: 'Role assigned to newly registered users' },
  { key: 'shop.default_currency', label: 'Default currency', type: 'string', hint: 'ISO code used for new carts (e.g. USD)' },
];

export function Settings() {
  const [values, setValues] = useState<Record<string, unknown> | null>(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all(SETTING_DEFS.map((d) => api.getSetting(d.key).then((r) => [d.key, r.data.value] as const)))
      .then((entries) => setValues(Object.fromEntries(entries)))
      .catch(() => setValues({}));
  }, []);

  if (values === null) return <LoadingState />;

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Stored in the settings collection — audited like all data</p>
      <div className="card card-pad stack" style={{ maxWidth: 620 }}>
        {SETTING_DEFS.map((d) => (
          <div key={d.key} className="field">
            {d.type === 'boolean' ? (
              <label className="checkbox-row">
                <input type="checkbox" checked={!!values[d.key]}
                  onChange={async (e) => {
                    const v = e.target.checked;
                    setValues({ ...values, [d.key]: v });
                    try {
                      await api.putSetting(d.key, v);
                      toast('Saved');
                    } catch (err) {
                      toast(err instanceof RequestError ? err.apiError.message : 'Save failed', 'err');
                    }
                  }} />
                <span className="field-label" style={{ margin: 0 }}>{d.label}</span>
              </label>
            ) : (
              <>
                <label className="field-label">{d.label}</label>
                <div className="row">
                  <input className="input" value={String(values[d.key] ?? '')}
                    onChange={(e) => setValues({ ...values, [d.key]: e.target.value })} />
                  <button className="btn btn-sm" onClick={async () => {
                    try {
                      await api.putSetting(d.key, values[d.key] || null);
                      toast('Saved');
                    } catch (err) {
                      toast(err instanceof RequestError ? err.apiError.message : 'Save failed', 'err');
                    }
                  }}>Save</button>
                </div>
              </>
            )}
            <span className="field-hint">{d.hint} · <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{d.key}</code></span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ORDER_NEXT: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'cancelled'],
  fulfilled: ['completed', 'refunded'],
};

export function OrderActions({ record, reload }: { record: Record<string, unknown>; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const toast = useToast();
  const nexts = ORDER_NEXT[String(record.status)] ?? [];

  return (
    <>
      <button className="btn btn-ghost btn-sm" title="Order detail" onClick={() => {
        setOpen(true);
        api.orderItems(String(record.id)).then((r) => setItems(r.data)).catch(() => setItems([]));
      }}>⧉</button>
      {open && (
        <Drawer title={`Order ${record.number}`} onClose={() => setOpen(false)}>
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <Badge value={record.status} />
              <strong>${(Number(record.grand_total) / 100).toFixed(2)} {String(record.currency)}</strong>
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{String(record.email)}</div>
            {items === null ? (
              <LoadingState />
            ) : (
              <div className="card">
                <table className="table">
                  <thead><tr><th>item</th><th>sku</th><th>qty</th><th>total</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={String(i.id)} style={{ cursor: 'default' }}>
                        <td>{String(i.title)}</td>
                        <td className="mono">{String(i.sku)}</td>
                        <td>{String(i.quantity)}</td>
                        <td>${(Number(i.total) / 100).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {Number(record.discount_total) > 0 && (
              <div style={{ fontSize: 13, color: 'var(--ok)' }}>
                Discount {String(record.discount_code)}: −${(Number(record.discount_total) / 100).toFixed(2)}
              </div>
            )}
            {nexts.length > 0 && (
              <div className="row">
                {nexts.map((s) => (
                  <button key={s} className={`btn btn-sm ${s === 'cancelled' || s === 'refunded' ? 'btn-danger' : 'btn-primary'}`}
                    onClick={async () => {
                      try {
                        await api.transitionOrder(String(record.id), s);
                        toast(`Order → ${s}`);
                        setOpen(false);
                        reload();
                      } catch (err) {
                        toast(err instanceof RequestError ? err.apiError.message : 'Transition failed', 'err');
                      }
                    }}>Mark {s}</button>
                ))}
              </div>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}

export function StockActions({ record, reload }: { record: Record<string, unknown>; reload: () => void }) {
  const [stock, setStock] = useState<number | null>(null);
  const toast = useToast();
  useEffect(() => {
    api.stock(String(record.id)).then((r) => setStock(r.data.stock)).catch(() => setStock(null));
  }, [record.id]);
  return (
    <span className="row" style={{ gap: 4 }}>
      <span className="badge" title="Current stock">{stock === null ? '…' : `${stock} in stock`}</span>
      <button className="btn btn-ghost btn-sm" title="Receive 10"
        onClick={async () => {
          try {
            await api.receiveStock(String(record.id), 10);
            const r = await api.stock(String(record.id));
            setStock(r.data.stock);
            toast('Received 10 units');
            reload();
          } catch (err) {
            toast(err instanceof RequestError ? err.apiError.message : 'Failed', 'err');
          }
        }}>+10</button>
    </span>
  );
}
