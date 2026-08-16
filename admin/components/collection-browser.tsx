/**
 * CollectionBrowser — THE one list+detail surface for every collection
 * (system, user-defined, plugin-defined). Table columns, filters, sort,
 * search, bulk actions, form drawer, revisions — all schema-driven.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, RequestError, type CollectionDef } from '../api.js';
import { LoadingState, EmptyState, ErrorState, Drawer, Confirm, useToast, formatCell, Badge } from '../ui.js';
import { RecordForm } from './record-form.js';

const PAGE_SIZE = 25;

export function CollectionBrowser({ collection, canWrite, extraRowActions }: {
  collection: CollectionDef;
  canWrite: { create: boolean; update: boolean; delete: boolean };
  extraRowActions?: (record: Record<string, unknown>, reload: () => void) => React.ReactNode;
}) {
  const [items, setItems] = useState<Record<string, unknown>[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('-created_at');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [showRevisions, setShowRevisions] = useState<string | null>(null);
  const toast = useToast();

  const displayFields = useMemo(
    () => collection.fields.filter((f) => !f.hidden && f.type !== 'hash' && !['blocks', 'json', 'text', 'richtext'].includes(f.type)).slice(0, 6),
    [collection],
  );

  const load = useCallback(() => {
    setError(null);
    api.list(collection.name, { page, limit: PAGE_SIZE, search: search || undefined, sort })
      .then((res) => {
        setItems(res.data);
        setTotal(res.meta.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [collection.name, page, search, sort]);

  useEffect(() => {
    setItems(null);
    setSelected(new Set());
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const save = async () => {
    if (!editing) return;
    try {
      const payload: Record<string, unknown> = {};
      for (const f of collection.fields) {
        if (f.hidden || f.type === 'hash') continue;
        if (editing[f.name] !== undefined) payload[f.name] = editing[f.name];
      }
      if (isNew) {
        await api.createRecord(collection.name, payload);
        toast('Created');
      } else {
        await api.updateRecord(collection.name, String(editing.id), payload);
        toast('Saved');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast(err instanceof RequestError ? err.apiError.message : 'Save failed', 'err');
    }
  };

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const sortField = sort.startsWith('-') ? sort.slice(1) : sort;
  const sortDesc = sort.startsWith('-');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{collection.label ?? collection.name}</h1>
          <p className="page-sub">{total} records{collection.versioned ? ' · versioned' : ''}</p>
        </div>
        <div className="row">
          {selected.size > 0 && canWrite.delete && (
            <button className="btn btn-danger" onClick={() => setBulkConfirm(true)}>
              Delete {selected.size} selected
            </button>
          )}
          {canWrite.create && (
            <button className="btn btn-primary" onClick={() => {
              const defaults: Record<string, unknown> = {};
              for (const f of collection.fields) {
                if (f.default !== undefined && !f.hidden) defaults[f.name] = f.default;
              }
              setEditing(defaults);
              setIsNew(true);
            }}>+ New</button>
          )}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search…" value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }} />
      </div>

      <div className="card">
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : items === null ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState title={search ? 'No matching records' : 'No records yet'}
            hint={search ? 'Try a different search term.' : canWrite.create ? 'Create the first one.' : undefined} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {canWrite.delete && (
                    <th style={{ width: 34 }}>
                      <input type="checkbox"
                        checked={selected.size === items.length && items.length > 0}
                        onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => String(i.id))) : new Set())} />
                    </th>
                  )}
                  {displayFields.map((f) => (
                    <th key={f.name} className={sortField === f.name ? 'sorted' : ''}
                      onClick={() => setSort(sortField === f.name && !sortDesc ? `-${f.name}` : f.name)}>
                      {f.name.replace(/_/g, ' ')} {sortField === f.name ? (sortDesc ? '↓' : '↑') : ''}
                    </th>
                  ))}
                  <th className={sortField === 'created_at' ? 'sorted' : ''}
                    onClick={() => setSort(sortField === 'created_at' && !sortDesc ? 'created_at' : '-created_at')}>
                    created {sortField === 'created_at' ? (sortDesc ? '↓' : '↑') : ''}
                  </th>
                  <th style={{ width: 10 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((record) => (
                  <tr key={String(record.id)} onClick={() => {
                    setEditing(record);
                    setIsNew(false);
                  }}>
                    {canWrite.delete && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(String(record.id))}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(String(record.id));
                            else next.delete(String(record.id));
                            setSelected(next);
                          }} />
                      </td>
                    )}
                    {displayFields.map((f) => (
                      <td key={f.name}>
                        {f.name === 'status' ? <Badge value={record[f.name]} /> : formatCell(record[f.name], f.type)}
                      </td>
                    ))}
                    <td className="mono">{new Date(String(record.created_at)).toLocaleDateString()}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="row" style={{ gap: 4 }}>
                        {extraRowActions?.(record, load)}
                        {collection.versioned && (
                          <button className="btn btn-ghost btn-sm" title="History" onClick={() => setShowRevisions(String(record.id))}>⟲</button>
                        )}
                        {canWrite.delete && (
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} title="Delete"
                            onClick={() => setDeleting(String(record.id))}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Page {page} / {totalPages}</span>
          <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}

      {editing && (
        <Drawer wide={collection.fields.some((f) => f.type === 'blocks')}
          title={isNew ? `New ${collection.label ?? collection.name}` : `Edit ${String(editing[collection.titleField ?? 'id'] ?? '')}`}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              {(isNew ? canWrite.create : canWrite.update) && (
                <button className="btn btn-primary" onClick={save}>{isNew ? 'Create' : 'Save'}</button>
              )}
            </>
          }>
          <RecordForm collection={collection} record={editing} onChange={setEditing} />
        </Drawer>
      )}

      {deleting && (
        <Confirm title="Delete record?" body="This action cannot be undone." danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.deleteRecord(collection.name, deleting);
              toast('Deleted');
              setDeleting(null);
              load();
            } catch (err) {
              toast(err instanceof RequestError ? err.apiError.message : 'Delete failed', 'err');
              setDeleting(null);
            }
          }} />
      )}

      {bulkConfirm && (
        <Confirm title={`Delete ${selected.size} records?`} body="All selected records will be removed atomically." danger
          onCancel={() => setBulkConfirm(false)}
          onConfirm={async () => {
            try {
              await api.bulk(collection.name, 'delete', [...selected].map((id) => ({ id })));
              toast(`Deleted ${selected.size} records`);
            } catch (err) {
              toast(err instanceof RequestError ? err.apiError.message : 'Bulk delete failed', 'err');
            }
            setBulkConfirm(false);
            setSelected(new Set());
            load();
          }} />
      )}

      {showRevisions && (
        <RevisionsDrawer collection={collection.name} recordId={showRevisions}
          onClose={() => setShowRevisions(null)} onReverted={load} />
      )}
    </div>
  );
}

function RevisionsDrawer({ collection, recordId, onClose, onReverted }: {
  collection: string; recordId: string; onClose: () => void; onReverted: () => void;
}) {
  const [revs, setRevs] = useState<Record<string, unknown>[] | null>(null);
  const toast = useToast();
  useEffect(() => {
    api.revisions(collection, recordId).then((r) => setRevs(r.data)).catch(() => setRevs([]));
  }, [collection, recordId]);
  return (
    <Drawer title="Version history" onClose={onClose}>
      {revs === null ? (
        <LoadingState />
      ) : revs.length === 0 ? (
        <EmptyState title="No revisions" />
      ) : (
        <div className="stack">
          {revs.map((rev) => (
            <div key={String(rev.id)} className="card card-pad" style={{ padding: '12px 16px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <Badge value={rev.action} />
                  <span style={{ marginInlineStart: 10, color: 'var(--text-dim)', fontSize: 12.5 }}>
                    {new Date(String(rev.created_at)).toLocaleString()}
                  </span>
                </div>
                {rev.action !== 'delete' && (
                  <button className="btn btn-sm" onClick={async () => {
                    try {
                      await api.revert(collection, recordId, String(rev.id));
                      toast('Reverted');
                      onReverted();
                      onClose();
                    } catch (err) {
                      toast(err instanceof RequestError ? err.apiError.message : 'Revert failed', 'err');
                    }
                  }}>Restore</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
