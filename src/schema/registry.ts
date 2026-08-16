/**
 * Schema Registry — the single source of truth for the shape of ALL data.
 * Collections (system and user-defined) are persisted in _collections/_fields
 * and synced to real tables via additive DDL. No schema files, no codegen,
 * no restart (ANALYSIS.md §1, ADR-001).
 */
import type { Db } from '../db/adapter.js';
import { ident } from '../db/adapter.js';
import { getFieldType, type FieldDef } from './field-types.js';
import { ConflictError, InvalidPayloadError, NotFoundError } from '../kernel/errors.js';

export interface CollectionDef {
  name: string;
  kind: 'system' | 'user';
  /** Human labels + icon for the admin. */
  label?: string;
  icon?: string;
  /** Snapshot every mutation into _revisions and support draft/publish. */
  versioned?: boolean;
  /** Write activity entries for mutations (default true). */
  audit?: boolean;
  /** Field used as display title in the admin. */
  titleField?: string;
  fields: FieldDef[];
  /** Do not expose through the generic /api/records surface (internal tables). */
  internal?: boolean;
}

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const RESERVED_FIELDS = new Set(['id', 'created_at', 'updated_at', 'rowid']);

export class SchemaRegistry {
  private cache = new Map<string, CollectionDef>();

  constructor(private db: Db) {
    this.ensureMetaTables();
    this.loadAll();
  }

  private ensureMetaTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _collections (
        name TEXT PRIMARY KEY,
        kind TEXT NOT NULL DEFAULT 'user',
        label TEXT,
        icon TEXT,
        versioned INTEGER NOT NULL DEFAULT 0,
        audit INTEGER NOT NULL DEFAULT 1,
        title_field TEXT,
        internal INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS _fields (
        collection TEXT NOT NULL REFERENCES _collections(name) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        required INTEGER NOT NULL DEFAULT 0,
        "unique" INTEGER NOT NULL DEFAULT 0,
        "default" TEXT,
        relation TEXT,
        options TEXT,
        localized INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        ui TEXT,
        sort INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection, name)
      );
    `);
  }

  private loadAll() {
    this.cache.clear();
    const cols = this.db.all('SELECT * FROM _collections');
    for (const c of cols) {
      const fields = this.db
        .all('SELECT * FROM _fields WHERE collection = ? ORDER BY sort', [c.name])
        .map(rowToField);
      this.cache.set(c.name as string, {
        name: c.name as string,
        kind: c.kind as 'system' | 'user',
        label: (c.label as string) ?? undefined,
        icon: (c.icon as string) ?? undefined,
        versioned: !!c.versioned,
        audit: !!c.audit,
        titleField: (c.title_field as string) ?? undefined,
        internal: !!c.internal,
        fields,
      });
    }
  }

  list(includeInternal = false): CollectionDef[] {
    return [...this.cache.values()].filter((c) => includeInternal || !c.internal);
  }

  has(name: string): boolean {
    return this.cache.has(name);
  }

  get(name: string): CollectionDef {
    const def = this.cache.get(name);
    if (!def) throw new NotFoundError('Collection', name);
    return def;
  }

  /** Column names of a collection incl. base columns — used by the filter compiler. */
  columns(name: string): Set<string> {
    const def = this.get(name);
    const cols = new Set(['id', 'created_at', 'updated_at']);
    for (const f of def.fields) cols.add(f.name);
    return cols;
  }

  /** Create or update (additively) a collection: registry rows + real DDL. */
  define(def: CollectionDef): CollectionDef {
    validateCollectionDef(def);
    return this.db.transaction(() => {
      const existing = this.cache.get(def.name);
      if (existing && existing.kind === 'system' && def.kind !== 'system') {
        throw new ConflictError(`Collection "${def.name}" is a system collection`);
      }
      this.upsertMeta(def);
      this.syncTable(def, existing);
      this.loadAll();
      return this.get(def.name);
    });
  }

  addField(collection: string, field: FieldDef): CollectionDef {
    const def = this.get(collection);
    if (def.fields.some((f) => f.name === field.name)) {
      throw new ConflictError(`Field "${field.name}" already exists on "${collection}"`);
    }
    return this.define({ ...def, fields: [...def.fields, field] });
  }

  removeField(collection: string, fieldName: string): CollectionDef {
    const def = this.get(collection);
    if (def.kind === 'system') {
      throw new ConflictError('Cannot remove fields from system collections');
    }
    if (!def.fields.some((f) => f.name === fieldName)) {
      throw new NotFoundError('Field', fieldName);
    }
    // Registry-level removal; the physical column stays (additive DDL policy) but
    // is invisible to every consumer since the registry is the source of truth.
    return this.db.transaction(() => {
      this.db.run('DELETE FROM _fields WHERE collection = ? AND name = ?', [collection, fieldName]);
      this.loadAll();
      return this.get(collection);
    });
  }

  drop(name: string): void {
    const def = this.get(name);
    if (def.kind === 'system') throw new ConflictError('Cannot drop a system collection');
    // Block if any relation points here (DOMAIN-MODEL invariant 5).
    for (const other of this.cache.values()) {
      if (other.name === name) continue;
      for (const f of other.fields) {
        if (f.type === 'relation' && f.relation?.collection === name) {
          throw new ConflictError(`Collection "${other.name}" has a relation to "${name}"`);
        }
      }
    }
    this.db.transaction(() => {
      this.db.run('DELETE FROM _collections WHERE name = ?', [name]);
      this.db.exec(`DROP TABLE IF EXISTS ${ident(name)}`);
      this.loadAll();
    });
  }

  private upsertMeta(def: CollectionDef) {
    this.db.run(
      `INSERT INTO _collections (name, kind, label, icon, versioned, audit, title_field, internal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET kind=excluded.kind, label=excluded.label, icon=excluded.icon,
         versioned=excluded.versioned, audit=excluded.audit, title_field=excluded.title_field, internal=excluded.internal`,
      [def.name, def.kind, def.label ?? null, def.icon ?? null, def.versioned ? 1 : 0,
       def.audit === false ? 0 : 1, def.titleField ?? null, def.internal ? 1 : 0],
    );
    this.db.run('DELETE FROM _fields WHERE collection = ?', [def.name]);
    def.fields.forEach((f, i) => {
      this.db.run(
        `INSERT INTO _fields (collection, name, type, required, "unique", "default", relation, options, localized, hidden, ui, sort)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [def.name, f.name, f.type, f.required ? 1 : 0, f.unique ? 1 : 0,
         f.default === undefined ? null : JSON.stringify(f.default),
         f.relation ? JSON.stringify(f.relation) : null,
         f.options ? JSON.stringify(f.options) : null,
         f.localized ? 1 : 0, f.hidden ? 1 : 0,
         f.ui ? JSON.stringify(f.ui) : null, i],
      );
    });
  }

  private syncTable(def: CollectionDef, existing?: CollectionDef) {
    const tableExists = !!this.db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [def.name],
    );
    if (!tableExists) {
      const cols = [
        `id TEXT PRIMARY KEY`,
        `created_at TEXT NOT NULL`,
        `updated_at TEXT NOT NULL`,
        ...def.fields.map((f) => this.columnDdl(f)),
      ];
      this.db.exec(`CREATE TABLE ${ident(def.name)} (${cols.join(', ')})`);
    } else {
      const existingCols = new Set(
        this.db.all(`PRAGMA table_info(${ident(def.name)})`).map((r) => r.name as string),
      );
      for (const f of def.fields) {
        if (!existingCols.has(f.name)) {
          this.db.exec(`ALTER TABLE ${ident(def.name)} ADD COLUMN ${this.columnDdl(f, true)}`);
        }
      }
    }
    // unique indexes (idempotent)
    for (const f of def.fields) {
      if (f.unique) {
        this.db.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS ${ident(`ux_${def.name}_${f.name}`)} ON ${ident(def.name)} (${ident(f.name)})`,
        );
      }
      if (f.type === 'relation') {
        this.db.exec(
          `CREATE INDEX IF NOT EXISTS ${ident(`ix_${def.name}_${f.name}`)} ON ${ident(def.name)} (${ident(f.name)})`,
        );
      }
    }
  }

  private columnDdl(f: FieldDef, forAlter = false): string {
    const t = getFieldType(f.type);
    let ddl = `${ident(f.name)} ${t.sqlType}`;
    // NOT NULL is enforced at the engine layer (required), keeping ALTERs safe.
    if (f.type === 'relation' && f.relation && !forAlter) {
      const action = f.relation.onDelete === 'cascade' ? 'CASCADE'
        : f.relation.onDelete === 'set null' ? 'SET NULL' : 'RESTRICT';
      ddl += ` REFERENCES ${ident(f.relation.collection)}(id) ON DELETE ${action}`;
    }
    return ddl;
  }
}

function validateCollectionDef(def: CollectionDef) {
  if (!NAME_RE.test(def.name)) {
    throw new InvalidPayloadError(`Invalid collection name "${def.name}" (lowercase snake_case required)`);
  }
  if (def.name.startsWith('_')) {
    throw new InvalidPayloadError('Collection names starting with "_" are reserved');
  }
  const seen = new Set<string>();
  for (const f of def.fields) {
    if (!NAME_RE.test(f.name)) throw new InvalidPayloadError(`Invalid field name "${f.name}"`);
    if (RESERVED_FIELDS.has(f.name)) throw new InvalidPayloadError(`Field name "${f.name}" is reserved`);
    if (seen.has(f.name)) throw new InvalidPayloadError(`Duplicate field "${f.name}"`);
    seen.add(f.name);
    getFieldType(f.type); // throws on unknown type
    if (f.type === 'relation' && !f.relation?.collection) {
      throw new InvalidPayloadError(`Relation field "${f.name}" must declare a target collection`);
    }
  }
}

function rowToField(r: Record<string, unknown>): FieldDef {
  return {
    name: r.name as string,
    type: r.type as string,
    required: !!r.required,
    unique: !!r.unique,
    default: r.default != null ? JSON.parse(r.default as string) : undefined,
    relation: r.relation ? JSON.parse(r.relation as string) : undefined,
    options: r.options ? JSON.parse(r.options as string) : undefined,
    localized: !!r.localized,
    hidden: !!r.hidden,
    ui: r.ui ? JSON.parse(r.ui as string) : undefined,
  };
}
