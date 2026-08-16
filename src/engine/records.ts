/**
 * Records service — THE single write path (ARCHITECTURE.md).
 * Pipeline: access policy → presets → validation/cast → before-hooks → SQL
 *          → revision → activity → after-hooks → events.
 * Every module and plugin reads/writes records through this service. There is
 * deliberately no other way to touch collection tables.
 */
import { randomId } from '../kernel/config.js';
import { ConflictError, InvalidPayloadError, NotFoundError, ValidationError } from '../kernel/errors.js';
import type { Db } from '../db/adapter.js';
import { ident } from '../db/adapter.js';
import { compileFilter, type Filter } from '../db/filter.js';
import type { SchemaRegistry } from '../schema/registry.js';
import { getFieldType, type FieldDef } from '../schema/field-types.js';
import { AccessService, resolvePresets, type Accountability, type Action } from '../access/index.js';
import type { EventBus } from '../kernel/events.js';
import type { Logger } from '../kernel/logger.js';
import { HookRegistry, type MutationAction } from './hooks.js';

export interface Query {
  filter?: Filter;
  search?: string;
  sort?: string[];           // ["-created_at", "title"]
  page?: number;
  limit?: number;
  fields?: string[];         // projection
  locale?: string;           // apply translations
}

export interface ListResult {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

export interface RecordsDeps {
  db: Db;
  registry: SchemaRegistry;
  access: AccessService;
  events: EventBus;
  hooks: HookRegistry;
  logger: Logger;
}

const MAX_LIMIT = 200;

export class RecordsService {
  constructor(private deps: RecordsDeps) {}

  get hooks(): HookRegistry {
    return this.deps.hooks;
  }

  // ── READ ───────────────────────────────────────────────────────────────
  async list(acc: Accountability, collection: string, query: Query = {}): Promise<ListResult> {
    const { db, registry, access } = this.deps;
    const def = registry.get(collection);
    const perm = access.resolve(acc, collection, 'read');
    const columns = registry.columns(collection);

    const filter = access.applyRowFilter(perm, query.filter ?? null);
    const whereParts: string[] = [];
    const params: unknown[] = [];
    if (filter) {
      const compiled = compileFilter(filter, { columns, userId: acc.userId });
      whereParts.push(compiled.sql);
      params.push(...compiled.params);
    }
    if (query.search && query.search.trim()) {
      const searchable = def.fields.filter((f) => getFieldType(f.type).searchable && !f.hidden);
      if (searchable.length > 0) {
        const like = `%${query.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        whereParts.push(`(${searchable.map((f) => `${ident(f.name)} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
        searchable.forEach(() => params.push(like));
      } else {
        whereParts.push('0=1');
      }
    }
    const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const orderBy = this.buildOrderBy(query.sort, columns, def);
    const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_LIMIT);
    const page = Math.max(query.page ?? 1, 1);
    const offset = (page - 1) * limit;

    const rows = db.all(
      `SELECT * FROM ${ident(collection)} ${where} ${orderBy} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const totalRow = db.get(`SELECT COUNT(*) AS c FROM ${ident(collection)} ${where}`, params);

    let items = rows.map((r) => this.serialize(def, r, perm.fields, acc.admin, query.fields));
    if (query.locale) items = items.map((r) => this.applyTranslations(collection, r, query.locale!));
    return { items, total: Number(totalRow?.c ?? 0), page, limit };
  }

  async getById(acc: Accountability, collection: string, id: string, opts: { locale?: string } = {}): Promise<Record<string, unknown>> {
    const result = await this.list(acc, collection, { filter: { id: { _eq: id } }, limit: 1, locale: opts.locale });
    const item = result.items[0];
    if (!item) throw new NotFoundError(collection, id);
    return item;
  }

  // ── WRITE ──────────────────────────────────────────────────────────────
  async create(acc: Accountability, collection: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { db, registry, access, hooks } = this.deps;
    const def = registry.get(collection);
    const perm = access.resolve(acc, collection, 'create');

    let data = { ...payload, ...resolvePresets(perm.presets, acc) };
    this.assertFieldsAllowed(def, data, perm.fields);
    data = await hooks.runFilters(data, { collection, action: 'create', accountability: acc });

    const { columns, values, translations } = this.castPayload(def, data, 'create');
    const id = (data.id as string) || randomId();
    const now = new Date().toISOString();

    const record = db.transaction(() => {
      const colNames = ['id', 'created_at', 'updated_at', ...columns];
      const colValues = [id, now, now, ...values];
      try {
        db.run(
          `INSERT INTO ${ident(collection)} (${colNames.map(ident).join(', ')}) VALUES (${colNames.map(() => '?').join(', ')})`,
          colValues,
        );
      } catch (err) {
        throw translateSqlError(err, def);
      }
      this.writeTranslations(collection, id, translations);
      const row = db.get(`SELECT * FROM ${ident(collection)} WHERE id = ?`, [id])!;
      this.writeRevision(def, id, 'create', row, acc);
      this.writeActivity(def, id, 'create', acc);
      return row;
    });

    await this.afterMutation(def, record, { collection, action: 'create', accountability: acc });
    return this.serialize(def, record, null, true);
  }

  async update(acc: Accountability, collection: string, id: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { db, registry, access, hooks } = this.deps;
    const def = registry.get(collection);
    const perm = access.resolve(acc, collection, 'update');

    const existing = this.findWithRowFilter(acc, collection, id, perm.rowFilter);
    let data = { ...payload, ...resolvePresets(perm.presets, acc) };
    delete data.id;
    delete (data as Record<string, unknown>).created_at;
    delete (data as Record<string, unknown>).updated_at;
    this.assertFieldsAllowed(def, data, perm.fields);
    data = await hooks.runFilters(data, { collection, action: 'update', accountability: acc, recordId: id, existing });

    const { columns, values, translations } = this.castPayload(def, data, 'update');
    const now = new Date().toISOString();

    const record = db.transaction(() => {
      if (columns.length > 0) {
        try {
          db.run(
            `UPDATE ${ident(collection)} SET ${columns.map((c) => `${ident(c)} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
            [...values, now, id],
          );
        } catch (err) {
          throw translateSqlError(err, def);
        }
      }
      this.writeTranslations(collection, id, translations);
      const row = db.get(`SELECT * FROM ${ident(collection)} WHERE id = ?`, [id])!;
      this.writeRevision(def, id, 'update', row, acc, data);
      this.writeActivity(def, id, 'update', acc);
      return row;
    });

    await this.afterMutation(def, record, { collection, action: 'update', accountability: acc, recordId: id, existing });
    return this.serialize(def, record, null, true);
  }

  async remove(acc: Accountability, collection: string, id: string): Promise<void> {
    const { db, registry, access, hooks } = this.deps;
    const def = registry.get(collection);
    const perm = access.resolve(acc, collection, 'delete');
    const existing = this.findWithRowFilter(acc, collection, id, perm.rowFilter);

    await hooks.runFilters({}, { collection, action: 'delete', accountability: acc, recordId: id, existing });

    db.transaction(() => {
      try {
        db.run(`DELETE FROM ${ident(collection)} WHERE id = ?`, [id]);
      } catch (err) {
        throw translateSqlError(err, def);
      }
      db.run('DELETE FROM _translations WHERE collection = ? AND record_id = ?', [collection, id]);
      this.writeRevision(def, id, 'delete', existing, acc);
      this.writeActivity(def, id, 'delete', acc);
    });

    await this.afterMutation(def, existing, { collection, action: 'delete', accountability: acc, recordId: id, existing });
  }

  /** Revisions of a record (versioned collections). Admin/read-permitted only. */
  async revisions(acc: Accountability, collection: string, id: string): Promise<Record<string, unknown>[]> {
    this.deps.access.resolve(acc, collection, 'read');
    return this.deps.db.all(
      `SELECT id, action, data, delta, actor_id, created_at FROM _revisions
       WHERE collection = ? AND record_id = ? ORDER BY created_at DESC LIMIT 100`,
      [collection, id],
    ).map((r) => ({ ...r, data: r.data ? JSON.parse(r.data as string) : null, delta: r.delta ? JSON.parse(r.delta as string) : null }));
  }

  /** Restore a record to a given revision (goes through the normal update path). */
  async revert(acc: Accountability, collection: string, id: string, revisionId: string): Promise<Record<string, unknown>> {
    const rev = this.deps.db.get('SELECT * FROM _revisions WHERE id = ? AND collection = ? AND record_id = ?', [revisionId, collection, id]);
    if (!rev || !rev.data) throw new NotFoundError('Revision', revisionId);
    const def = this.deps.registry.get(collection);
    const snapshot = JSON.parse(rev.data as string) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const f of def.fields) {
      if (f.name in snapshot && f.type !== 'hash') payload[f.name] = this.fromDbValue(f, snapshot[f.name]);
    }
    return this.update(acc, collection, id, payload);
  }

  // ── internals ──────────────────────────────────────────────────────────
  private findWithRowFilter(acc: Accountability, collection: string, id: string, rowFilter: Filter | null): Record<string, unknown> {
    const { db, registry } = this.deps;
    const columns = registry.columns(collection);
    let sql = `SELECT * FROM ${ident(collection)} WHERE id = ?`;
    const params: unknown[] = [id];
    if (rowFilter) {
      const compiled = compileFilter(rowFilter, { columns, userId: acc.userId });
      sql += ` AND ${compiled.sql}`;
      params.push(...compiled.params);
    }
    const row = db.get(sql, params);
    if (!row) throw new NotFoundError(collection, id);
    return row;
  }

  private assertFieldsAllowed(def: { fields: FieldDef[] }, data: Record<string, unknown>, allowed: string[] | null) {
    const known = new Set(def.fields.map((f) => f.name));
    for (const key of Object.keys(data)) {
      if (key === 'id') continue;
      if (!known.has(key)) throw new InvalidPayloadError(`Unknown field "${key}"`);
      if (allowed && !allowed.includes(key)) {
        throw new InvalidPayloadError(`Field "${key}" is not permitted`);
      }
    }
  }

  private castPayload(def: { name: string; fields: FieldDef[] }, data: Record<string, unknown>, mode: 'create' | 'update') {
    const columns: string[] = [];
    const values: unknown[] = [];
    const translations: { field: string; locale: string; value: string }[] = [];

    for (const f of def.fields) {
      let value = data[f.name];

      // per-locale payload convention: { field: { $locales: { fr: "..." } } }
      if (value && typeof value === 'object' && !Array.isArray(value) && '$locales' in (value as object)) {
        const locales = (value as { $locales: Record<string, unknown>; default?: unknown }).$locales;
        for (const [locale, lv] of Object.entries(locales)) {
          if (!f.localized) throw new ValidationError(`Field "${f.name}" is not localized`);
          const t = getFieldType(f.type);
          translations.push({ field: f.name, locale, value: String(t.cast(lv, f)) });
        }
        value = (value as { default?: unknown }).default;
        if (value === undefined) continue;
      }

      if (value === undefined) {
        if (mode === 'create') {
          if (f.default !== undefined) {
            const t = getFieldType(f.type);
            columns.push(f.name);
            values.push(f.default === null ? null : t.cast(f.default, f));
          } else if (f.required) {
            throw new ValidationError(`Field "${f.name}" is required`);
          }
        }
        continue;
      }
      if (value === null) {
        if (f.required) throw new ValidationError(`Field "${f.name}" is required`);
        columns.push(f.name);
        values.push(null);
        continue;
      }
      const t = getFieldType(f.type);
      columns.push(f.name);
      values.push(t.cast(value, f));
    }
    return { columns, values, translations };
  }

  private writeTranslations(collection: string, recordId: string, translations: { field: string; locale: string; value: string }[]) {
    for (const t of translations) {
      this.deps.db.run(
        `INSERT INTO _translations (collection, record_id, locale, field, value) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, record_id, locale, field) DO UPDATE SET value = excluded.value`,
        [collection, recordId, t.locale, t.field, t.value],
      );
    }
  }

  private applyTranslations(collection: string, record: Record<string, unknown>, locale: string): Record<string, unknown> {
    const rows = this.deps.db.all(
      'SELECT field, value FROM _translations WHERE collection = ? AND record_id = ? AND locale = ?',
      [collection, record.id as string, locale],
    );
    if (rows.length === 0) return record;
    const out = { ...record };
    for (const r of rows) out[r.field as string] = r.value;
    return out;
  }

  private writeRevision(def: { name: string; versioned?: boolean }, id: string, action: MutationAction, snapshot: Record<string, unknown> | undefined, acc: Accountability, delta?: Record<string, unknown>) {
    if (!def.versioned && action !== 'delete') return;
    this.deps.db.run(
      'INSERT INTO _revisions (id, collection, record_id, action, data, delta, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [randomId(), def.name, id, action, snapshot ? JSON.stringify(snapshot) : null,
       delta ? JSON.stringify(delta) : null, acc.userId, new Date().toISOString()],
    );
  }

  private writeActivity(def: { name: string; audit?: boolean }, id: string, action: MutationAction, acc: Accountability) {
    if (def.audit === false) return;
    this.deps.db.run(
      'INSERT INTO _activity (id, action, collection, record_id, actor_id, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomId(), action, def.name, id, acc.userId, acc.ip ?? null, new Date().toISOString()],
    );
  }

  private async afterMutation(def: { name: string }, record: Record<string, unknown>, ctx: { collection: string; action: MutationAction; accountability: Accountability; recordId?: string; existing?: Record<string, unknown> }) {
    const { hooks, events, logger } = this.deps;
    await hooks.runActions(record, ctx, (err) => logger.error('after-hook failed', { collection: def.name, err: String(err) }));
    events.emit({
      type: `records.${ctx.action}`,
      collection: def.name,
      payload: { id: record.id, record },
      actorId: ctx.accountability.userId,
    });
  }

  private buildOrderBy(sort: string[] | undefined, columns: Set<string>, def: { fields: FieldDef[] }): string {
    const parts: string[] = [];
    for (const s of sort ?? []) {
      const desc = s.startsWith('-');
      const name = desc ? s.slice(1) : s;
      if (!columns.has(name)) throw new InvalidPayloadError(`Cannot sort by unknown field "${name}"`);
      const fieldDef = def.fields.find((f) => f.name === name);
      if (fieldDef && getFieldType(fieldDef.type).sortable === false) {
        throw new InvalidPayloadError(`Field "${name}" is not sortable`);
      }
      parts.push(`${ident(name)} ${desc ? 'DESC' : 'ASC'}`);
    }
    if (parts.length === 0) parts.push('created_at DESC');
    return `ORDER BY ${parts.join(', ')}`;
  }

  private fromDbValue(f: FieldDef, v: unknown): unknown {
    const t = getFieldType(f.type);
    return t.fromDb ? t.fromDb(v, f) : v;
  }

  private serialize(def: { fields: FieldDef[] }, row: Record<string, unknown>, allowedFields: string[] | null, admin: boolean, projection?: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const base = ['id', 'created_at', 'updated_at'];
    for (const key of base) {
      if (!projection || projection.includes(key) || key === 'id') out[key] = row[key];
    }
    for (const f of def.fields) {
      if (f.hidden && !admin) continue;
      if (f.type === 'hash') continue; // never serialize secrets, even for admins
      if (allowedFields && !allowedFields.includes(f.name)) continue;
      if (projection && !projection.includes(f.name)) continue;
      out[f.name] = this.fromDbValue(f, row[f.name]);
    }
    return out;
  }
}

function translateSqlError(err: unknown, def: { name: string; fields: FieldDef[] }): Error {
  const msg = String((err as Error)?.message ?? err);
  if (msg.includes('UNIQUE constraint failed')) {
    const m = msg.match(/UNIQUE constraint failed: [^.]+\.(\w+)/);
    return new ConflictError(m ? `A record with this ${m[1]} already exists` : 'Duplicate value');
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return new ConflictError('Operation violates a relation constraint (referenced record missing or still referenced)');
  }
  return err as Error;
}
