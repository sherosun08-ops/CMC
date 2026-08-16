/**
 * Settings — THE single typed settings store (records in `settings`).
 * Env vars stay for infrastructure secrets only (kernel/config.ts).
 */
import type { RecordsService } from '../engine/records.js';
import { SYSTEM, type Accountability } from '../access/index.js';

export class SettingsService {
  private cache = new Map<string, unknown>();

  constructor(private records: RecordsService) {}

  async get<T = unknown>(key: string, fallback?: T): Promise<T> {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const result = await this.records.list(SYSTEM, 'settings', { filter: { key: { _eq: key } }, limit: 1 });
    const value = result.items.length > 0 ? (result.items[0].value as T) : (fallback as T);
    this.cache.set(key, value);
    return value;
  }

  async set(acc: Accountability, key: string, value: unknown): Promise<void> {
    const existing = await this.records.list(SYSTEM, 'settings', { filter: { key: { _eq: key } }, limit: 1 });
    if (existing.items.length > 0) {
      await this.records.update(acc, 'settings', existing.items[0].id as string, { value });
    } else {
      await this.records.create(acc, 'settings', { key, value });
    }
    this.cache.set(key, value);
  }

  invalidate(): void {
    this.cache.clear();
  }
}
