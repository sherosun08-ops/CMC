/** Schema designer — create/edit collections & fields at runtime (admins). */
import React, { useEffect, useState } from 'react';
import { api, RequestError, type CollectionDef, type FieldDef } from '../api.js';
import { LoadingState, Drawer, Confirm, useToast, EmptyState } from '../ui.js';

export function SchemaDesigner({ onChanged }: { onChanged: () => void }) {
  const [collections, setCollections] = useState<CollectionDef[] | null>(null);
  const [fieldTypes, setFieldTypes] = useState<string[]>([]);
  const [editing, setEditing] = useState<CollectionDef | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [dropping, setDropping] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    api.collections().then((r) => setCollections(r.data));
    api.fieldTypes().then((r) => setFieldTypes(r.data.map((t) => t.name).filter((n) => n !== 'hash')));
  };
  useEffect(load, []);

  const save = async () => {
    if (!editing) return;
    try {
      if (isNew) await api.createCollection(editing);
      else await api.updateCollection(editing.name, { label: editing.label, versioned: editing.versioned, titleField: editing.titleField, fields: editing.fields });
      toast(isNew ? 'Collection created' : 'Collection updated');
      setEditing(null);
      load();
      onChanged();
    } catch (err) {
      toast(err instanceof RequestError ? err.apiError.message : 'Save failed', 'err');
    }
  };

  if (!collections) return <LoadingState />;

  const userCols = collections.filter((c) => c.kind === 'user');
  const systemCols = collections.filter((c) => c.kind === 'system');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Data model</h1>
          <p className="page-sub">Collections are live — changes apply instantly to API, admin and search.</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setEditing({ name: '', kind: 'user', fields: [{ name: 'title', type: 'string', required: true }] });
          setIsNew(true);
        }}>+ New collection</button>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--border)' }}>
            <strong>Your collections</strong>
          </div>
          {userCols.length === 0 ? (
            <EmptyState title="No custom collections yet" hint="Create one to model your own data." />
          ) : (
            userCols.map((c) => (
              <CollectionRow key={c.name} col={c}
                onEdit={() => {
                  setEditing(JSON.parse(JSON.stringify(c)));
                  setIsNew(false);
                }}
                onDrop={() => setDropping(c.name)} />
            ))
          )}
        </div>

        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--border)' }}>
            <strong>System collections</strong>
            <span style={{ color: 'var(--text-faint)', fontSize: 12.5, marginInlineStart: 10 }}>structure managed by the platform</span>
          </div>
          {systemCols.map((c) => (
            <CollectionRow key={c.name} col={c} readonly />
          ))}
        </div>
      </div>

      {editing && (
        <Drawer wide title={isNew ? 'New collection' : `Edit ${editing.name}`} onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>{isNew ? 'Create' : 'Save'}</button>
            </>
          }>
          <div className="stack">
            <div className="grid grid-2">
              <div className="field">
                <label className="field-label">Name (snake_case) <span className="req">*</span></label>
                <input className="input" value={editing.name} disabled={!isNew}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. testimonials" />
              </div>
              <div className="field">
                <label className="field-label">Label</label>
                <input className="input" value={editing.label ?? ''}
                  onChange={(e) => setEditing({ ...editing, label: e.target.value || undefined })} />
              </div>
            </div>
            <div className="row">
              <label className="checkbox-row">
                <input type="checkbox" checked={!!editing.versioned}
                  onChange={(e) => setEditing({ ...editing, versioned: e.target.checked })} />
                <span className="field-label" style={{ margin: 0 }}>Versioned (revisions & restore)</span>
              </label>
              <div className="field" style={{ flex: 1 }}>
                <input className="input" placeholder="title field (for display)" value={editing.titleField ?? ''}
                  onChange={(e) => setEditing({ ...editing, titleField: e.target.value || undefined })} />
              </div>
            </div>

            <div className="field-label" style={{ marginTop: 8 }}>Fields</div>
            {editing.fields.map((f, i) => (
              <FieldRow key={i} field={f} fieldTypes={fieldTypes} collections={collections}
                onChange={(nf) => {
                  const fields = [...editing.fields];
                  fields[i] = nf;
                  setEditing({ ...editing, fields });
                }}
                onRemove={() => setEditing({ ...editing, fields: editing.fields.filter((_, j) => j !== i) })} />
            ))}
            <div>
              <button className="btn btn-sm" onClick={() => setEditing({ ...editing, fields: [...editing.fields, { name: '', type: 'string' }] })}>
                + Add field
              </button>
            </div>
          </div>
        </Drawer>
      )}

      {dropping && (
        <Confirm title={`Drop collection "${dropping}"?`} body="All records in this collection will be permanently deleted." danger
          onCancel={() => setDropping(null)}
          onConfirm={async () => {
            try {
              await api.dropCollection(dropping);
              toast('Collection dropped');
              load();
              onChanged();
            } catch (err) {
              toast(err instanceof RequestError ? err.apiError.message : 'Drop failed', 'err');
            }
            setDropping(null);
          }} />
      )}
    </div>
  );
}

function CollectionRow({ col, onEdit, onDrop, readonly }: {
  col: CollectionDef; onEdit?: () => void; onDrop?: () => void; readonly?: boolean;
}) {
  return (
    <div className="row" style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <strong>{col.label ?? col.name}</strong>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-faint)', marginInlineStart: 10 }}>{col.name}</span>
      </div>
      <span className="badge">{col.fields.length} fields</span>
      {col.versioned && <span className="badge badge-accent">versioned</span>}
      {!readonly && (
        <>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onDrop}>Drop</button>
        </>
      )}
    </div>
  );
}

function FieldRow({ field, fieldTypes, collections, onChange, onRemove }: {
  field: FieldDef; fieldTypes: string[]; collections: CollectionDef[];
  onChange: (f: FieldDef) => void; onRemove: () => void;
}) {
  return (
    <div className="card" style={{ padding: '10px 14px', background: 'var(--bg)' }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 180 }} placeholder="field_name" value={field.name}
          onChange={(e) => onChange({ ...field, name: e.target.value })} />
        <select className="select" style={{ maxWidth: 130 }} value={field.type}
          onChange={(e) => onChange({ ...field, type: e.target.value, relation: e.target.value === 'relation' ? { collection: collections[0]?.name ?? '' } : undefined })}>
          {fieldTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {field.type === 'relation' && (
          <select className="select" style={{ maxWidth: 160 }} value={field.relation?.collection ?? ''}
            onChange={(e) => onChange({ ...field, relation: { collection: e.target.value } })}>
            {collections.map((c) => (
              <option key={c.name} value={c.name}>→ {c.name}</option>
            ))}
          </select>
        )}
        <label className="checkbox-row">
          <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ ...field, required: e.target.checked })} />
          <span style={{ fontSize: 12.5 }}>required</span>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={!!field.unique} onChange={(e) => onChange({ ...field, unique: e.target.checked })} />
          <span style={{ fontSize: 12.5 }}>unique</span>
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={onRemove}>✕</button>
      </div>
    </div>
  );
}
