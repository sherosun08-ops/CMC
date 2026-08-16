/** Dashboard — KPIs, orders chart, recent activity. Data from /system/stats. */
import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LoadingState, ErrorState, Badge } from '../ui.js';

export function Dashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api.stats().then((r) => setStats(r.data)).catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <LoadingState />;

  const days: { day: string; c: number; total: number }[] = stats.orders_by_day ?? [];
  const maxTotal = Math.max(...days.map((d) => d.total), 1);

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Platform overview</p>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="Revenue" value={`$${(stats.revenue / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} sub={`${stats.orders} orders`} />
        <Kpi label="Pending orders" value={String(stats.pending_orders)} sub="awaiting payment" />
        <Kpi label="Users" value={String(stats.users)} sub={`${stats.files} files stored`} />
        <Kpi label="Published products" value={String(stats.products)} sub={`${stats.pages} pages`} />
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <div className="stat-label">Orders — last 14 days</div>
          {days.length === 0 ? (
            <p style={{ color: 'var(--text-faint)', marginTop: 24 }}>No orders yet.</p>
          ) : (
            <div className="bars">
              {days.map((d) => (
                <div key={d.day} className="bar" title={`${d.day}: ${d.c} orders, $${(d.total / 100).toFixed(2)}`}>
                  <i style={{ height: `${Math.max((d.total / maxTotal) * 100, 4)}%`, top: 'auto' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="stat-label" style={{ marginBottom: 10 }}>Recent orders</div>
          {(stats.recent_orders ?? []).length === 0 ? (
            <p style={{ color: 'var(--text-faint)' }}>No orders yet.</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {stats.recent_orders.map((o: any) => (
                <div key={o.id} className="row" style={{ justifyContent: 'space-between', cursor: 'pointer' }}
                  onClick={() => onNavigate('/collections/orders')}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{o.number}</span>
                  <span style={{ color: 'var(--text-dim)', fontSize: 12.5, flex: 1, marginInline: 10, overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.email}</span>
                  <Badge value={o.status} />
                  <strong style={{ fontSize: 13 }}>${(o.grand_total / 100).toFixed(2)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="stat-label" style={{ marginBottom: 10 }}>Recent activity</div>
        {(stats.recent_activity ?? []).length === 0 ? (
          <p style={{ color: 'var(--text-faint)' }}>Nothing yet.</p>
        ) : (
          <div className="stack" style={{ gap: 6 }}>
            {stats.recent_activity.map((a: any, i: number) => (
              <div key={i} className="row" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                <Badge value={a.action} />
                <span><b style={{ color: 'var(--text)' }}>{a.actor ?? 'system'}</b> · {a.collection}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{new Date(a.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card card-pad">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
