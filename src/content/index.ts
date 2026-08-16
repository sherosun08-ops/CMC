/**
 * Content module — scheduled publishing + the blocks system (the visual-builder
 * data model, ANALYSIS.md §6). Works for ANY collection that has `status` +
 * `publish_at` or a `blocks` field — pages and products alike, zero duplication.
 */
import type { RecordsService } from '../engine/records.js';
import type { JobQueue } from '../jobs/index.js';
import type { SchemaRegistry } from '../schema/registry.js';
import { SYSTEM } from '../access/index.js';
import { ValidationError } from '../kernel/errors.js';

// ── Blocks registry ─────────────────────────────────────────────────────
export interface BlockTypeDef {
  type: string;
  label: string;
  /** field schema for the block's props — reuses the SAME field-def shape */
  props: { name: string; type: 'string' | 'text' | 'richtext' | 'integer' | 'boolean' | 'json' | 'relation'; required?: boolean; relationCollection?: string }[];
  /** whether the block accepts children */
  container?: boolean;
  /** server-side HTML renderer for previews */
  render(props: Record<string, unknown>, childrenHtml: string): string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export class BlockRegistry {
  private types = new Map<string, BlockTypeDef>();

  register(def: BlockTypeDef): void {
    if (this.types.has(def.type)) {
      throw new Error(`Block type "${def.type}" already registered (duplication guard)`);
    }
    this.types.set(def.type, def);
  }

  get(type: string): BlockTypeDef | undefined {
    return this.types.get(type);
  }

  list(): BlockTypeDef[] {
    return [...this.types.values()];
  }

  /** Validate a block tree against registered types (used as an engine filter hook). */
  validateTree(blocks: unknown[]): void {
    for (const raw of blocks) {
      const block = raw as { type: string; props?: Record<string, unknown>; children?: unknown[] };
      const def = this.types.get(block.type);
      if (!def) throw new ValidationError(`Unknown block type "${block.type}"`);
      for (const prop of def.props) {
        if (prop.required && (block.props?.[prop.name] === undefined || block.props?.[prop.name] === null || block.props?.[prop.name] === '')) {
          throw new ValidationError(`Block "${block.type}" requires prop "${prop.name}"`);
        }
      }
      if (block.children && block.children.length > 0) {
        if (!def.container) throw new ValidationError(`Block "${block.type}" cannot contain children`);
        this.validateTree(block.children);
      }
    }
  }

  renderTree(blocks: unknown[]): string {
    return blocks
      .map((raw) => {
        const block = raw as { type: string; props?: Record<string, unknown>; children?: unknown[] };
        const def = this.types.get(block.type);
        if (!def) return '';
        const childrenHtml = block.children ? this.renderTree(block.children) : '';
        return def.render(block.props ?? {}, childrenHtml);
      })
      .join('\n');
  }
}

export function registerCoreBlocks(registry: BlockRegistry): void {
  registry.register({
    type: 'heading', label: 'Heading',
    props: [{ name: 'text', type: 'string', required: true }, { name: 'level', type: 'integer' }],
    render: (p) => {
      const lvl = Math.min(Math.max(Number(p.level) || 2, 1), 6);
      return `<h${lvl}>${esc(p.text)}</h${lvl}>`;
    },
  });
  registry.register({
    type: 'paragraph', label: 'Paragraph',
    props: [{ name: 'text', type: 'text', required: true }],
    render: (p) => `<p>${esc(p.text)}</p>`,
  });
  registry.register({
    type: 'image', label: 'Image',
    props: [
      { name: 'file', type: 'relation', required: true, relationCollection: 'files' },
      { name: 'alt', type: 'string' },
    ],
    render: (p) => `<img src="/api/files/${esc(p.file)}/data" alt="${esc(p.alt)}" loading="lazy" />`,
  });
  registry.register({
    type: 'button', label: 'Button',
    props: [{ name: 'label', type: 'string', required: true }, { name: 'href', type: 'string', required: true }],
    render: (p) => {
      const href = String(p.href ?? '');
      const safe = /^(https?:\/\/|\/)/.test(href) ? href : '#';
      return `<a class="btn" href="${esc(safe)}">${esc(p.label)}</a>`;
    },
  });
  registry.register({
    type: 'section', label: 'Section', container: true,
    props: [{ name: 'background', type: 'string' }],
    render: (p, children) => `<section style="background:${esc(p.background || 'transparent')}">${children}</section>`,
  });
  registry.register({
    type: 'columns', label: 'Columns', container: true,
    props: [{ name: 'count', type: 'integer' }],
    render: (p, children) =>
      `<div style="display:grid;grid-template-columns:repeat(${Math.min(Math.max(Number(p.count) || 2, 1), 6)},1fr);gap:1rem">${children}</div>`,
  });
  registry.register({
    type: 'product_grid', label: 'Product grid',
    props: [{ name: 'limit', type: 'integer' }],
    render: (p) => `<div data-block="product-grid" data-limit="${Math.min(Number(p.limit) || 8, 48)}"></div>`,
  });
}

// ── Scheduled publishing ────────────────────────────────────────────────
export function setupContentScheduling(deps: { records: RecordsService; jobs: JobQueue; registry: SchemaRegistry }): void {
  const { records, jobs, registry } = deps;

  jobs.register('content.publish', async (payload) => {
    const { collection, id } = payload as { collection: string; id: string };
    const record = await records.getById(SYSTEM, collection, id);
    if (record.status === 'draft' && record.publish_at && new Date(record.publish_at as string) <= new Date()) {
      // normal engine update → revisions, activity, events, webhooks all fire
      await records.update(SYSTEM, collection, id, { status: 'published' });
    }
  });

  // Any collection with status+publish_at participates — pages, products, user CTs.
  records.hooks.onAction('*', 'create', schedule);
  records.hooks.onAction('*', 'update', schedule);

  function schedule(record: Record<string, unknown>, ctx: { collection: string }) {
    if (!registry.has(ctx.collection)) return;
    const def = registry.get(ctx.collection);
    const hasFields = def.fields.some((f) => f.name === 'publish_at') && def.fields.some((f) => f.name === 'status');
    if (!hasFields) return;
    if (record.status === 'draft' && record.publish_at) {
      jobs.enqueue(
        'content.publish',
        { collection: ctx.collection, id: record.id },
        { runAt: new Date(record.publish_at as string), dedupeKey: `${ctx.collection}:${record.id}` },
      );
    }
  }
}
