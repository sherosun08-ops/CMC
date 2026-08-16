/**
 * Plugin system — a formal contract over the SAME extension points the core
 * uses (ADR-001, ANALYSIS.md §8). Plugins never reach into module internals.
 */
import { Hono } from 'hono';
import type { Platform, ApiEnv } from '../api/context.js';
import type { CollectionDef } from '../schema/registry.js';
import type { FilterHook, ActionHook, MutationAction } from '../engine/hooks.js';
import type { JobHandler } from '../jobs/index.js';
import type { BlockTypeDef } from '../content/index.js';
import type { DomainEvent } from '../kernel/events.js';
import type { Logger } from '../kernel/logger.js';
import { SYSTEM } from '../access/index.js';

export interface PluginContext {
  logger: Logger;
  /** Register a collection (DDL synced immediately; appears in API + admin). */
  defineCollection(def: Omit<CollectionDef, 'kind'>): void;
  /** Engine hooks — same registry the core uses. */
  onFilter(collection: string | '*', action: MutationAction | '*', fn: FilterHook): void;
  onAction(collection: string | '*', action: MutationAction | '*', fn: ActionHook): void;
  /** Event subscribers. */
  onEvent(type: string, handler: (event: DomainEvent) => void | Promise<void>): void;
  /** Background job handlers + recurring tasks. */
  registerJob(type: string, handler: JobHandler): void;
  every(name: string, intervalMs: number, fn: () => void | Promise<void>): void;
  /** Custom routes, namespaced under /api/x/<plugin-name>. */
  route(fn: (router: Hono<ApiEnv>) => void): void;
  /** Block types for the visual builder. */
  registerBlock(def: BlockTypeDef): void;
  /** Data access — the same single write path as everything else. */
  records: Platform['records'];
  settings: Platform['settings'];
  /** Grant a permission policy programmatically (e.g. defaults on install). */
  grantPolicy(roleName: string, collection: string, action: 'create' | 'read' | 'update' | 'delete', extras?: { row_filter?: unknown; fields?: string[] | null }): Promise<void>;
}

export interface Plugin {
  name: string;
  version: string;
  register(ctx: PluginContext): void | Promise<void>;
}

export class PluginManager {
  private loaded = new Map<string, Plugin>();

  constructor(private platform: Platform, private apiRouter: Hono<ApiEnv>) {}

  async load(plugin: Plugin): Promise<void> {
    if (!/^[a-z][a-z0-9-]*$/.test(plugin.name)) {
      throw new Error(`Invalid plugin name "${plugin.name}"`);
    }
    if (this.loaded.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" already loaded (duplication guard)`);
    }
    const p = this.platform;
    const scoped = p.logger.child(`plugin:${plugin.name}`);
    const ns = `/x/${plugin.name}`;

    const ctx: PluginContext = {
      logger: scoped,
      defineCollection: (def) => void p.registry.define({ ...def, kind: 'user' }),
      onFilter: (c, a, fn) => void p.records.hooks.onFilter(c, a, fn),
      onAction: (c, a, fn) => void p.records.hooks.onAction(c, a, fn),
      onEvent: (type, handler) => void p.events.on(type, handler),
      registerJob: (type, handler) => p.jobs.register(`${plugin.name}.${type}`, handler),
      every: (name, ms, fn) => p.jobs.every(`${plugin.name}.${name}`, ms, fn),
      route: (fn) => {
        const sub = new Hono<ApiEnv>();
        fn(sub);
        this.apiRouter.route(ns, sub);
      },
      registerBlock: (def) => p.blocks.register(def),
      records: p.records,
      settings: p.settings,
      grantPolicy: async (roleName, collection, action, extras = {}) => {
        const roles = await p.records.list(SYSTEM, 'roles', { filter: { name: { _eq: roleName } }, limit: 1 });
        if (roles.items.length === 0) return;
        const roleId = roles.items[0].id as string;
        const existing = await p.records.list(SYSTEM, 'policies', {
          filter: { role: { _eq: roleId }, collection: { _eq: collection }, action: { _eq: action } }, limit: 1,
        });
        if (existing.items.length > 0) return; // idempotent
        await p.records.create(SYSTEM, 'policies', {
          role: roleId, collection, action,
          row_filter: extras.row_filter ?? null, fields: extras.fields ?? null,
        });
      },
    };

    await plugin.register(ctx);
    this.loaded.set(plugin.name, plugin);
    p.logger.info('plugin loaded', { name: plugin.name, version: plugin.version });
  }

  list(): { name: string; version: string }[] {
    return [...this.loaded.values()].map((pl) => ({ name: pl.name, version: pl.version }));
  }
}
