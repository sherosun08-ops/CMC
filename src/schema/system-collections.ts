/**
 * System collections — the platform's own entities, defined through the SAME
 * registry as user collections (ADR-001). One identity system, one file system,
 * one activity stream, one settings store, one notification inbox, one webhook
 * registry, one job queue. Commerce entities are collections too.
 */
import type { SchemaRegistry, CollectionDef } from './registry.js';

const defs: CollectionDef[] = [
  // ── Identity & Access ────────────────────────────────────────────────
  {
    name: 'users', kind: 'system', label: 'Users', icon: 'user', titleField: 'email', audit: true,
    fields: [
      { name: 'email', type: 'email', required: true, unique: true },
      { name: 'password', type: 'hash', hidden: true },
      { name: 'first_name', type: 'string', options: { maxLength: 120 } },
      { name: 'last_name', type: 'string', options: { maxLength: 120 } },
      { name: 'status', type: 'string', required: true, default: 'active', options: { choices: ['active', 'suspended', 'invited'] } },
      { name: 'last_login_at', type: 'datetime' },
      { name: 'avatar_file', type: 'relation', relation: { collection: 'files', onDelete: 'set null' } },
    ],
  },
  {
    name: 'roles', kind: 'system', label: 'Roles', icon: 'shield', titleField: 'name',
    fields: [
      { name: 'name', type: 'string', required: true, unique: true, options: { maxLength: 80 } },
      { name: 'description', type: 'text' },
      { name: 'admin_access', type: 'boolean', default: false },
    ],
  },
  {
    name: 'user_roles', kind: 'system', internal: true, audit: false,
    fields: [
      { name: 'user', type: 'relation', required: true, relation: { collection: 'users', onDelete: 'cascade' } },
      { name: 'role', type: 'relation', required: true, relation: { collection: 'roles', onDelete: 'cascade' } },
    ],
  },
  {
    name: 'policies', kind: 'system', label: 'Policies', icon: 'lock', titleField: 'collection',
    fields: [
      { name: 'role', type: 'relation', required: true, relation: { collection: 'roles', onDelete: 'cascade' } },
      { name: 'collection', type: 'string', required: true },
      { name: 'action', type: 'string', required: true, options: { choices: ['create', 'read', 'update', 'delete'] } },
      { name: 'row_filter', type: 'json' },
      { name: 'fields', type: 'json' },   // allowlist of field names; null = all
      { name: 'presets', type: 'json' },  // server-enforced values on create/update
    ],
  },

  // ── Files (single media system) ──────────────────────────────────────
  {
    name: 'files', kind: 'system', label: 'Files', icon: 'image', titleField: 'filename',
    fields: [
      { name: 'filename', type: 'string', required: true },
      { name: 'mime_type', type: 'string', required: true },
      { name: 'size', type: 'integer', required: true },
      { name: 'storage_key', type: 'string', required: true, hidden: true },
      { name: 'title', type: 'string' },
      { name: 'width', type: 'integer' },
      { name: 'height', type: 'integer' },
      { name: 'folder', type: 'string' },
      { name: 'uploaded_by', type: 'relation', relation: { collection: 'users', onDelete: 'set null' } },
    ],
  },

  // ── Settings / Notifications / Webhooks ─────────────────────────────
  {
    name: 'settings', kind: 'system', label: 'Settings', icon: 'settings', titleField: 'key',
    fields: [
      { name: 'key', type: 'string', required: true, unique: true },
      { name: 'value', type: 'json' },
    ],
  },
  {
    name: 'notifications', kind: 'system', label: 'Notifications', icon: 'bell', titleField: 'subject',
    fields: [
      { name: 'recipient', type: 'relation', required: true, relation: { collection: 'users', onDelete: 'cascade' } },
      { name: 'subject', type: 'string', required: true },
      { name: 'body', type: 'text' },
      { name: 'read', type: 'boolean', default: false },
      { name: 'link', type: 'string' },
    ],
  },
  {
    name: 'webhooks', kind: 'system', label: 'Webhooks', icon: 'zap', titleField: 'name',
    fields: [
      { name: 'name', type: 'string', required: true },
      { name: 'url', type: 'string', required: true, options: { pattern: '^https?://' } },
      { name: 'events', type: 'json', required: true },  // array of event types / prefixes
      { name: 'active', type: 'boolean', default: true },
      { name: 'secret', type: 'string', hidden: true },
    ],
  },

  // ── Content ──────────────────────────────────────────────────────────
  {
    name: 'pages', kind: 'system', label: 'Pages', icon: 'file-text', titleField: 'title', versioned: true,
    fields: [
      { name: 'title', type: 'string', required: true, options: { maxLength: 200 }, localized: true },
      { name: 'slug', type: 'slug', required: true, unique: true },
      { name: 'status', type: 'string', required: true, default: 'draft', options: { choices: ['draft', 'published', 'archived'] } },
      { name: 'blocks', type: 'blocks', default: [] },
      { name: 'seo_title', type: 'string', options: { maxLength: 70 }, localized: true },
      { name: 'seo_description', type: 'string', options: { maxLength: 160 }, localized: true },
      { name: 'publish_at', type: 'datetime' },
      { name: 'author', type: 'relation', relation: { collection: 'users', onDelete: 'set null' } },
    ],
  },

  // ── Commerce (same engine, domain services on top) ──────────────────
  {
    name: 'products', kind: 'system', label: 'Products', icon: 'package', titleField: 'title', versioned: true,
    fields: [
      { name: 'title', type: 'string', required: true, options: { maxLength: 200 }, localized: true },
      { name: 'slug', type: 'slug', required: true, unique: true },
      { name: 'description', type: 'richtext', localized: true },
      { name: 'status', type: 'string', required: true, default: 'draft', options: { choices: ['draft', 'published', 'archived'] } },
      { name: 'blocks', type: 'blocks', default: [] },
      { name: 'cover_file', type: 'relation', relation: { collection: 'files', onDelete: 'set null' } },
      { name: 'seo_title', type: 'string', options: { maxLength: 70 } },
      { name: 'seo_description', type: 'string', options: { maxLength: 160 } },
      { name: 'publish_at', type: 'datetime' },
    ],
  },
  {
    name: 'product_variants', kind: 'system', label: 'Variants', icon: 'layers', titleField: 'sku',
    fields: [
      { name: 'product', type: 'relation', required: true, relation: { collection: 'products', onDelete: 'cascade' } },
      { name: 'sku', type: 'string', required: true, unique: true, options: { maxLength: 64 } },
      { name: 'title', type: 'string', options: { maxLength: 200 } },
      { name: 'price', type: 'money', required: true },
      { name: 'compare_at_price', type: 'money' },
      { name: 'currency', type: 'string', required: true, default: 'USD', options: { pattern: '^[A-Z]{3}$' } },
      { name: 'options', type: 'json' },     // { size: "M", color: "red" }
      { name: 'track_inventory', type: 'boolean', default: true },
    ],
  },
  {
    name: 'inventory_movements', kind: 'system', label: 'Inventory', icon: 'trending-up', internal: false, audit: false,
    fields: [
      { name: 'variant', type: 'relation', required: true, relation: { collection: 'product_variants', onDelete: 'cascade' } },
      { name: 'quantity', type: 'integer', required: true }, // +receive / -reserve
      { name: 'reason', type: 'string', required: true, options: { choices: ['received', 'sold', 'returned', 'adjusted', 'released'] } },
      { name: 'reference', type: 'string' }, // e.g. order id
    ],
  },
  {
    name: 'carts', kind: 'system', label: 'Carts', icon: 'shopping-cart', internal: false, audit: false,
    fields: [
      { name: 'user', type: 'relation', relation: { collection: 'users', onDelete: 'set null' } },
      { name: 'token', type: 'string', unique: true, hidden: true }, // guest cart access
      { name: 'currency', type: 'string', required: true, default: 'USD' },
      { name: 'discount_code', type: 'string' },
      { name: 'status', type: 'string', required: true, default: 'active', options: { choices: ['active', 'converted', 'abandoned'] } },
    ],
  },
  {
    name: 'cart_items', kind: 'system', internal: true, audit: false,
    fields: [
      { name: 'cart', type: 'relation', required: true, relation: { collection: 'carts', onDelete: 'cascade' } },
      { name: 'variant', type: 'relation', required: true, relation: { collection: 'product_variants', onDelete: 'cascade' } },
      { name: 'quantity', type: 'integer', required: true, options: { min: 1, max: 999 } },
      { name: 'unit_price', type: 'money', required: true }, // captured at add time
    ],
  },
  {
    name: 'discounts', kind: 'system', label: 'Discounts', icon: 'percent', titleField: 'code',
    fields: [
      { name: 'code', type: 'string', required: true, unique: true, options: { maxLength: 40 } },
      { name: 'type', type: 'string', required: true, options: { choices: ['percent', 'fixed'] } },
      { name: 'value', type: 'integer', required: true, options: { min: 1 } }, // percent (1-100) or minor units
      { name: 'min_subtotal', type: 'money' },
      { name: 'usage_limit', type: 'integer' },
      { name: 'used_count', type: 'integer', default: 0 },
      { name: 'starts_at', type: 'datetime' },
      { name: 'ends_at', type: 'datetime' },
      { name: 'active', type: 'boolean', default: true },
    ],
  },
  {
    name: 'orders', kind: 'system', label: 'Orders', icon: 'clipboard', titleField: 'number', audit: true,
    fields: [
      { name: 'number', type: 'string', required: true, unique: true },
      { name: 'user', type: 'relation', relation: { collection: 'users', onDelete: 'set null' } },
      { name: 'email', type: 'email', required: true },
      { name: 'status', type: 'string', required: true, default: 'pending', options: { choices: ['pending', 'paid', 'fulfilled', 'completed', 'cancelled', 'refunded'] } },
      { name: 'currency', type: 'string', required: true },
      { name: 'subtotal', type: 'money', required: true },
      { name: 'discount_total', type: 'money', default: 0 },
      { name: 'grand_total', type: 'money', required: true },
      { name: 'discount_code', type: 'string' },
      { name: 'shipping_address', type: 'json' },
      { name: 'billing_address', type: 'json' },
      { name: 'notes', type: 'text' },
      { name: 'placed_at', type: 'datetime' },
    ],
  },
  {
    name: 'order_items', kind: 'system', internal: true, audit: false,
    fields: [
      { name: 'order', type: 'relation', required: true, relation: { collection: 'orders', onDelete: 'cascade' } },
      { name: 'variant', type: 'relation', relation: { collection: 'product_variants', onDelete: 'set null' } },
      { name: 'title', type: 'string', required: true },   // immutable snapshot
      { name: 'sku', type: 'string', required: true },
      { name: 'quantity', type: 'integer', required: true },
      { name: 'unit_price', type: 'money', required: true },
      { name: 'total', type: 'money', required: true },
    ],
  },
];

/** Non-collection infrastructure tables (queue, sessions, revisions, activity, search). */
const INFra_DDL = `
  CREATE TABLE IF NOT EXISTS _sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_sessions_user ON _sessions(user_id);
  CREATE TABLE IF NOT EXISTS _api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS _revisions (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL,
    data TEXT,
    delta TEXT,
    actor_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_revisions_record ON _revisions(collection, record_id, created_at);
  CREATE TABLE IF NOT EXISTS _activity (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    collection TEXT,
    record_id TEXT,
    actor_id TEXT,
    ip TEXT,
    comment TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_activity_time ON _activity(created_at DESC);
  CREATE TABLE IF NOT EXISTS _jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    run_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_jobs_due ON _jobs(status, run_at);
  CREATE TABLE IF NOT EXISTS _translations (
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    locale TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (collection, record_id, locale, field)
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS _search USING fts5(
    collection UNINDEXED, record_id UNINDEXED, title, body
  );
`;

export function bootstrapSystemCollections(registry: SchemaRegistry, dbExec: (sql: string) => void): void {
  dbExec(INFra_DDL);
  for (const def of defs) {
    registry.define(def);
  }
  // Reserved "$public" role: the FK target for anonymous-access policies.
  // Real users are never assigned to it; AccessService treats it specially.
  const now = new Date().toISOString();
  dbExec(
    `INSERT INTO roles (id, created_at, updated_at, name, description, admin_access)
     SELECT '$public', '${now}', '${now}', 'Public', 'Anonymous visitors (reserved)', 0
     WHERE NOT EXISTS (SELECT 1 FROM roles WHERE id = '$public')`,
  );
}
