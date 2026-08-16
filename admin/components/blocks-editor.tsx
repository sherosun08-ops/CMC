/**
 * BlocksEditor — the visual composer over the blocks field type.
 * Manipulates the serializable component tree (never HTML) and previews via
 * the server renderer — the same renderer used for public pages.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

interface Block {
  type: string;
  props?: Record<string, unknown>;
  children?: Block[];
}

interface BlockType {
  type: string;
  label: string;
  props: { name: string; type: string; required?: boolean; relationCollection?: string }[];
  container?: boolean;
}

export function BlocksEditor({ value, onChange }: { value: unknown[]; onChange: (v: Block[]) => void }) {
  const blocks = value as Block[];
  const [types, setTypes] = useState<BlockType[]>([]);
  const [preview, setPreview] = useState(false);
  const [html, setHtml] = useState('');

  useEffect(() => {
    api.blockTypes().then((r) => setTypes(r.data)).catch(() => setTypes([]));
  }, []);

  useEffect(() => {
    if (!preview) return;
    const t = setTimeout(() => {
      api.renderBlocks(blocks).then((r) => setHtml(r.data.html)).catch(() => setHtml('<p>Preview failed</p>'));
    }, 250);
    return () => clearTimeout(t);
  }, [preview, JSON.stringify(blocks)]);

  const typeMap = useMemo(() => new Map(types.map((t) => [t.type, t])), [types]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <AddBlockButton types={types} onAdd={(b) => onChange([...blocks, b])} />
        <button type="button" className={`btn btn-sm ${preview ? 'btn-primary' : ''}`} onClick={() => setPreview(!preview)}>
          {preview ? 'Editing preview on' : 'Preview'}
        </button>
      </div>
      {blocks.length === 0 && <div className="field-hint">No blocks yet — add one above.</div>}
      <BlockList blocks={blocks} typeMap={typeMap} types={types} onChange={onChange} />
      {preview && <div className="blocks-preview" dangerouslySetInnerHTML={{ __html: html }} />}
    </div>
  );
}

function BlockList({ blocks, typeMap, types, onChange }: {
  blocks: Block[];
  typeMap: Map<string, BlockType>;
  types: BlockType[];
  onChange: (b: Block[]) => void;
}) {
  const dragIndex = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <>
      {blocks.map((block, i) => {
        const def = typeMap.get(block.type);
        return (
          <div
            key={i}
            className="block-item"
            draggable
            onDragStart={() => {
              dragIndex.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragIndex.current !== null && dragIndex.current !== i) move(dragIndex.current, i);
              dragIndex.current = null;
            }}
          >
            <div className="block-item-head">
              <span style={{ cursor: 'grab', color: 'var(--text-faint)' }}>⠿</span>
              <span className="type">{def?.label ?? block.type}</span>
              <span style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i - 1)} title="Move up">↑</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i + 1)} title="Move down">↓</button>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                onClick={() => onChange(blocks.filter((_, j) => j !== i))}>✕</button>
            </div>
            <div className="block-item-body">
              {(def?.props ?? []).map((prop) => (
                <BlockPropInput key={prop.name} prop={prop}
                  value={block.props?.[prop.name]}
                  onChange={(v) => {
                    const next = [...blocks];
                    next[i] = { ...block, props: { ...block.props, [prop.name]: v } };
                    onChange(next);
                  }} />
              ))}
              {def?.container && (
                <div className="block-children">
                  <BlockList blocks={block.children ?? []} typeMap={typeMap} types={types}
                    onChange={(children) => {
                      const next = [...blocks];
                      next[i] = { ...block, children };
                      onChange(next);
                    }} />
                  <div>
                    <AddBlockButton types={types}
                      onAdd={(b) => {
                        const next = [...blocks];
                        next[i] = { ...block, children: [...(block.children ?? []), b] };
                        onChange(next);
                      }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function AddBlockButton({ types, onAdd }: { types: BlockType[]; onAdd: (b: Block) => void }) {
  return (
    <select className="select" style={{ width: 'auto', fontSize: 12.5 }} value=""
      onChange={(e) => {
        const def = types.find((t) => t.type === e.target.value);
        if (!def) return;
        onAdd({ type: def.type, props: {}, ...(def.container ? { children: [] } : {}) });
      }}>
      <option value="">+ Add block…</option>
      {types.map((t) => (
        <option key={t.type} value={t.type}>{t.label}</option>
      ))}
    </select>
  );
}

function BlockPropInput({ prop, value, onChange }: {
  prop: { name: string; type: string; required?: boolean; relationCollection?: string };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (prop.type === 'boolean') {
    return (
      <label className="checkbox-row">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        <span className="field-label" style={{ margin: 0 }}>{prop.name}</span>
      </label>
    );
  }
  if (prop.type === 'integer') {
    return (
      <div className="field">
        <span className="field-label">{prop.name}{prop.required && <span className="req"> *</span>}</span>
        <input className="input" type="number" value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      </div>
    );
  }
  if (prop.type === 'text' || prop.type === 'richtext') {
    return (
      <div className="field">
        <span className="field-label">{prop.name}{prop.required && <span className="req"> *</span>}</span>
        <textarea className="textarea" style={{ minHeight: 60 }} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  if (prop.type === 'relation' && prop.relationCollection === 'files') {
    return <BlockFileProp prop={prop} value={value} onChange={onChange} />;
  }
  return (
    <div className="field">
      <span className="field-label">{prop.name}{prop.required && <span className="req"> *</span>}</span>
      <input className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function BlockFileProp({ prop, value, onChange }: {
  prop: { name: string; required?: boolean };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="field">
      <span className="field-label">{prop.name}{prop.required && <span className="req"> *</span>}</span>
      <div className="row">
        {value ? (
          <>
            <img src={`/api/files/${value}/data`} alt="" style={{ height: 40, borderRadius: 6 }} />
            <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange(undefined)}>Remove</button>
          </>
        ) : (
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            {busy ? 'Uploading…' : 'Upload'}
            <input type="file" accept="image/*" style={{ display: 'none' }} disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const res = await api.upload(f);
                  onChange(res.data.id);
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
