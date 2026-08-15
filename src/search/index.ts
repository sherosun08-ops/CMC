/**
 * Search module — THE single search system. Driver interface; default driver
 * is SQLite FTS5, kept in sync by data-engine events (ANALYSIS.md §10).
 */
import type { Db } from '../db/adapter.js';
import type { EventBus } from '../kernel/events.js';
import type { SchemaRegistry } from '../schema/registry.js';
import { getFieldType } from '../schema/field-types.js';

export interface SearchHit {
  collection: string;
  recordId: string;
  title: string;
  snippet: string;
  rank: number;
}

export interface SearchDriver {
  index(collection: string, recordId: string, title: string, body: string): void;
  remove(collection: string, recordId: string): void;
  query(text: string, opts?: { collections?: string[]; limit?: number }): SearchHit[];
}

export function createFts5Driver(db: Db): SearchDriver {
  return {
    index(collection, recordId, title, body) {
      db.run('DELETE FROM _search WHERE collection = ? AND record_id = ?', [collection, recordId]);
      db.run('INSERT INTO _search (collection, record_id, title, body) VALUES (?, ?, ?, ?)', [collection, recordId, title, body]);
    },
    remove(collection, recordId) {
      db.run('DELETE FROM _search WHERE collection = ? AND record_id = ?', [collection, recordId]);
    },
    query(text, opts = {}) {
      const term = text.trim();
      if (!term) return [];
      // FTS5 query-escape: quote each token
      const q = term.split(/\s+/).map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
      const limit = Math.min(opts.limit ?? 20, 100);
      let sql = `SELECT collection, record_id, title, snippet(_search, 3, '<b>', '</b>', '…', 12) AS snip, rank
                 FROM _search WHERE _search MATCH ?`;
      const params: unknown[] = [q];
      if (opts.collections && opts.collections.length > 0) {
        sql += ` AND collection IN (${opts.collections.map(() => '?').join(',')})`;
        params.push(...opts.collections);
      }
      sql += ` ORDER BY rank LIMIT ?`;
      params.push(limit);
      return db.all(sql, params).map((r) => ({
        collection: r.collection as string,
        recordId: r.record_id as string,
        title: r.title as string,
        snippet: r.snip as string,
        rank: Number(r.rank),
      }));
    },
  };
}

export class SearchService {
  constructor(
    private driver: SearchDriver,
    private registry: SchemaRegistry,
  ) {}

  /** Wire into the single event pipeline. */
  connect(events: EventBus): void {
    events.on('records.create', (e) => this.reindex(e.collection!, (e.payload as { record: Record<string, unknown> }).record));
    events.on('records.update', (e) => this.reindex(e.collection!, (e.payload as { record: Record<string, unknown> }).record));
    events.on('records.delete', (e) => this.driver.remove(e.collection!, String((e.payload as { id: unknown }).id)));
  }

  reindex(collection: string, record: Record<string, unknown>): void {
    if (!this.registry.has(collection)) return;
    const def = this.registry.get(collection);
    if (def.internal) return;
    const searchable = def.fields.filter((f) => getFieldType(f.type).searchable && !f.hidden);
    if (searchable.length === 0) return;
    const title = def.titleField && record[def.titleField] != null ? String(record[def.titleField]) : String(record.id);
    const body = searchable.map((f) => (record[f.name] != null ? String(record[f.name]) : '')).join(' ').slice(0, 20000);
    this.driver.index(collection, String(record.id), title, body);
  }

  query(text: string, opts?: { collections?: string[]; limit?: number }): SearchHit[] {
    return this.driver.query(text, opts);
  }
}
