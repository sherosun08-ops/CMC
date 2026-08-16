/** Media library — grid over the single files collection. */
import React, { useCallback, useEffect, useState } from 'react';
import { api, RequestError } from '../api.js';
import { LoadingState, EmptyState, ErrorState, Confirm, useToast } from '../ui.js';

export function MediaLibrary() {
  const [files, setFiles] = useState<Record<string, unknown>[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(() => {
    setError(null);
    api.list('files', { limit: 60, sort: '-created_at', search: search || undefined })
      .then((r) => {
        setFiles(r.data);
        setTotal(r.meta.total);
      })
      .catch((e) => setError(e.message));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        await api.upload(f);
      }
      toast(`Uploaded ${list.length} file(s)`);
      load();
    } catch (err) {
      toast(err instanceof RequestError ? err.apiError.message : 'Upload failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      e.preventDefault();
      void upload(e.dataTransfer.files);
    }}>
      <div className="page-head">
        <div>
          <h1 className="page-title">Media</h1>
          <p className="page-sub">{total} files · drag & drop to upload</p>
        </div>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {busy ? 'Uploading…' : '+ Upload'}
          <input type="file" multiple style={{ display: 'none' }} disabled={busy} onChange={(e) => void upload(e.target.files)} />
        </label>
      </div>

      <input className="input" style={{ maxWidth: 320, marginBottom: 14 }} placeholder="Search files…"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : files === null ? (
        <LoadingState />
      ) : files.length === 0 ? (
        <div className="card"><EmptyState title="No files" hint="Upload or drop files here." /></div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {files.map((f) => {
            const isImage = String(f.mime_type).startsWith('image/');
            return (
              <div key={String(f.id)} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ height: 100, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isImage ? (
                    <img src={`/api/files/${f.id}/data`} alt={String(f.title ?? '')}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  ) : (
                    <span style={{ fontSize: 26, color: 'var(--text-faint)' }}>▤</span>
                  )}
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(f.filename)}
                  </div>
                  <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{formatSize(Number(f.size))}</span>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '1px 6px' }}
                      onClick={() => setDeleting(String(f.id))}>✕</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleting && (
        <Confirm title="Delete file?" body="The file and its data will be permanently removed." danger
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            try {
              await api.deleteFile(deleting);
              toast('File deleted');
              load();
            } catch (err) {
              toast(err instanceof RequestError ? err.apiError.message : 'Delete failed', 'err');
            }
            setDeleting(null);
          }} />
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
