/**
 * Hook registry — synchronous interceptors around engine operations.
 * filter hooks mutate the payload before write; action hooks observe after.
 * Used by core modules (content scheduling, search) and plugins alike — the
 * SAME extension surface for both (ADR-001).
 */
import type { Accountability } from '../access/index.js';

export type MutationAction = 'create' | 'update' | 'delete';

export interface HookContext {
  collection: string;
  action: MutationAction;
  accountability: Accountability;
  /** present for update/delete */
  recordId?: string;
  /** the existing record for update/delete */
  existing?: Record<string, unknown>;
}

export type FilterHook = (
  payload: Record<string, unknown>,
  ctx: HookContext,
) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;

export type ActionHook = (
  record: Record<string, unknown>,
  ctx: HookContext,
) => void | Promise<void>;

interface Entry<T> {
  collection: string | '*';
  action: MutationAction | '*';
  fn: T;
}

export class HookRegistry {
  private filters: Entry<FilterHook>[] = [];
  private actions: Entry<ActionHook>[] = [];

  /** Runs BEFORE the write, inside the operation. May mutate/replace payload or throw. */
  onFilter(collection: string | '*', action: MutationAction | '*', fn: FilterHook): () => void {
    const entry = { collection, action, fn };
    this.filters.push(entry);
    return () => {
      this.filters = this.filters.filter((e) => e !== entry);
    };
  }

  /** Runs AFTER the write committed. Errors are the engine's job to isolate. */
  onAction(collection: string | '*', action: MutationAction | '*', fn: ActionHook): () => void {
    const entry = { collection, action, fn };
    this.actions.push(entry);
    return () => {
      this.actions = this.actions.filter((e) => e !== entry);
    };
  }

  async runFilters(payload: Record<string, unknown>, ctx: HookContext): Promise<Record<string, unknown>> {
    let current = payload;
    for (const e of this.filters) {
      if ((e.collection === '*' || e.collection === ctx.collection) && (e.action === '*' || e.action === ctx.action)) {
        const result = await e.fn(current, ctx);
        if (result) current = result;
      }
    }
    return current;
  }

  async runActions(record: Record<string, unknown>, ctx: HookContext, onError: (err: unknown) => void): Promise<void> {
    for (const e of this.actions) {
      if ((e.collection === '*' || e.collection === ctx.collection) && (e.action === '*' || e.action === ctx.action)) {
        try {
          await e.fn(record, ctx);
        } catch (err) {
          onError(err);
        }
      }
    }
  }
}
