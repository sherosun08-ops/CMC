/**
 * Event bus — the ONE pipeline for domain events.
 * Consumed three ways (see ARCHITECTURE.md): in-process subscribers (search,
 * notifications), webhooks (via jobs), and plugin subscribers.
 * Subscribers run async and MUST NOT affect the emitting operation.
 */
import type { Logger } from './logger.js';

export interface DomainEvent<T = unknown> {
  /** e.g. "records.create", "orders.placed", "auth.login" */
  type: string;
  /** collection name for record events */
  collection?: string;
  payload: T;
  /** acting user id, if any */
  actorId?: string | null;
  at: string;
}

type Handler = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();
  constructor(private logger: Logger) {}

  /** Subscribe to an exact type, a prefix wildcard ("records.*") or all ("*"). */
  on(type: string, handler: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  emit(event: Omit<DomainEvent, 'at'>): void {
    const full: DomainEvent = { ...event, at: new Date().toISOString() };
    const targets = new Set<Handler>();
    this.handlers.get(full.type)?.forEach((h) => targets.add(h));
    const prefix = full.type.split('.')[0] + '.*';
    this.handlers.get(prefix)?.forEach((h) => targets.add(h));
    this.handlers.get('*')?.forEach((h) => targets.add(h));
    for (const handler of targets) {
      // Fire and isolate: a failing subscriber never breaks the source operation.
      Promise.resolve()
        .then(() => handler(full))
        .catch((err) => this.logger.error('event subscriber failed', { type: full.type, err: String(err) }));
    }
  }
}
