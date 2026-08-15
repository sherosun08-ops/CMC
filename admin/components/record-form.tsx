/**
 * RecordForm — THE one form. Renders any collection's fields from the schema
 * registry: widgets, requirements and constraints all derive from the same
 * field definitions the server validates with. No per-entity forms exist.
 */
import React, { useEffect, useState } from 'react';
import { api, type CollectionDef, type FieldDef } from '../api.js';
import { useToast } from '../ui.js';
import { BlocksEditor } from './blocks-editor.js';

export function RecordForm({ collection, record, onChange }: {
  collection: CollectionDef;
  record: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const visible = collection.fields.filter((f) => !f.hidden && f.type !== 'hash');
  return (
    <div className="stack">
      {visible.map((f) => (
        <FieldInput
          key={f.name}
          field={f}
          value={record[f.name]}
          onChange={(v) => onChange({ ...record, [f.name]: v })}
        />
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange }: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = (
    <label className="field-label">
      {field.name.replace(/_/g, ' ')}
      {field.required && <span className="req"> *</span>}
      {field.localized && <span className="badge" style={{ marginInlineStart: 6 }}>i18n</span>}
    </label>
  );

  const opts = field.options ?? {};

  switch (field.type) {
    case 'boolean':
      return (
        <div className="field">
          <label className="checkbox-row">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            <span className="field-label" style={{ margin: 0 }}>{field.name.replace(/_/g, ' ')}</span>
          </label>
        </div>
      );
    case 'text':
    case 'richtext':
      return (
        <div className="field">
          {label}
          <textarea className="textarea" value={String(value ?? '')} maxLength={opts.maxLength}
            onChange={(e) => onChange(e.target.value || null)} />
        </div>
      );
    case 'integer':
    case 'float':
      return (
        <div className="field">
          {label}
          <input className="input" type="number" step={field.type === 'float' ? 'any' : 1}
            min={opts.min} max={opts.max}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
        </div>
      );
    case 'money':
      return (
        <div className="field">
          {label}
          <input className="input" type="number" step="0.01" min={0}
            value={value === null || value === undefined ? '' : (Number(value) / 100).toFixed(2)}
            onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))} />
          <span className="field-hint">Stored as integer minor units</span>
        </div>
      );
    case 'datetime':
      return (
        <div className="field">
          {label}
          <input className="input" type="datetime-local"
            value={value ? toLocalInput(String(value)) : ''}
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />
        </div>
      );
    case 'json':
      return <JsonInput label={label} value={value} onChange={onChange} />;
    case 'blocks':
      return (
        <div className="field">
          {label}
          <BlocksEditor value={Array.isArray(value) ? (value as unknown[]) : []} onChange={onChange} />
        </div>
      );
    case 'relation':
      return <RelationInput label={label} field={field} value={value} onChange={onChange} />;
    default: {
      if (opts.choices && opts.choices.length > 0) {
        return (
          <div className="field">
            {label}
            <select className="select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
              {!field.required && <option value="">—</option>}
              {opts.choices.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div className="field">
          {label}
          <input className="input" type={field.type === 'email' ? 'email' : 'text'} maxLength={opts.maxLength}
            value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}
            placeholder={field.type === 'slug' ? 'lowercase-with-hyphens' : undefined} />
        </div>
      );
    }
  }
}

function JsonInput({ label, value, onChange }: { label: React.ReactNode; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => (value === undefined || value === null ? '' : JSON.stringify(value, null, 2)));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(value === undefined || value === null ? '' : JSON.stringify(value, null, 2));
  }, [value === undefined]);
  return (
    <div className="field">
      {label}
      <textarea className="textarea" style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }} value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            setError(null);
            onChange(null);
            return;
          }
          try {
            onChange(JSON.parse(e.target.value));
            setError(null);
          } catch {
            setError('Invalid JSON');
          }
        }} />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

function RelationInput({ label, field, value, onChange }: {
  label: React.ReactNode; field: FieldDef; value: unknown; onChange: (v: unknown) => void;
}) {
  const target = field.relation!.collection;
  const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let dead = false;
    api.collections()
      .then(async (cols) => {
        const def = cols.data.find((c) => c.name === target);
        const titleField = def?.titleField ?? 'id';
        const res = await api.list(target, { limit: 100, sort: '-created_at' });
        if (dead) return;
        setOptions(res.data.map((r) => ({ id: String(r.id), title: String(r[titleField] ?? r.id) })));
      })
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [target]);

  if (target === 'files') {
    return <FileInput label={label} value={value} onChange={onChange} toast={toast} />;
  }

  return (
    <div className="field">
      {label}
      {failed ? (
        <input className="input" value={String(value ?? '')} placeholder={`${target} id`}
          onChange={(e) => onChange(e.target.value || null)} />
      ) : (
        <select className="select" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.title}</option>
          ))}
        </select>
      )}
      <span className="field-hint">→ {target}</span>
    </div>
  );
}

function FileInput({ label, value, onChange, toast }: {
  label: React.ReactNode; value: unknown; onChange: (v: unknown) => void; toast: (t: string, k?: 'ok' | 'err') => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="field">
      {label}
      <div className="row">
        {value ? (
          <>
            <img src={`/api/files/${value}/data`} alt="" style={{ height: 44, borderRadius: 6, border: '1px solid var(--border)' }}
              onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />
            <button className="btn btn-sm btn-danger" onClick={() => onChange(null)}>Remove</button>
          </>
        ) : (
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            {busy ? 'Uploading…' : 'Upload file'}
            <input type="file" style={{ display: 'none' }} disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const res = await api.upload(f);
                  onChange(res.data.id);
                  toast('File uploaded');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Upload failed', 'err');
                } finally {
                  setBusy(false);
                }
              }} />
          </label>
        )}
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
