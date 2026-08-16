/**
 * Bootstrap — assemble the ONE platform instance. Composition happens here and
 * only here: every module receives its dependencies, no globals, no singletons.
 */
import { loadConfig, type Config } from './kernel/config.js';
import { createLogger } from './kernel/logger.js';
import { EventBus } from './kernel/events.js';
import { createDb } from './db/adapter.js';
import { SchemaRegistry } from './schema/registry.js';
import { bootstrapSystemCollections } from './schema/system-collections.js';
import { AccessService } from './access/index.js';
import { RecordsService } from './engine/records.js';
import { HookRegistry } from './engine/hooks.js';
import { AuthService } from './auth/index.js';
import { JobQueue } from './jobs/index.js';
import { FileService, createLocalStorageDriver } from './files/index.js';
import { SearchService, createFts5Driver } from './search/index.js';
import { CommerceService } from './commerce/index.js';
import { BlockRegistry, registerCoreBlocks, setupContentScheduling } from './content/index.js';
import { SettingsService } from './platform/settings.js';
import { NotificationService } from './platform/notifications.js';
import { setupWebhooks } from './platform/webhooks.js';
import { ValidationError } from './kernel/errors.js';
import type { Platform } from './api/context.js';

export function createPlatform(overrides: Partial<Config> = {}): Platform {
  const config = loadConfig(overrides);
  const logger = createLogger('cmc', config.logLevel);
  const db = createDb(config.databaseUrl);
  const events = new EventBus(logger.child('events'));
  const registry = new SchemaRegistry(db);
  bootstrapSystemCollections(registry, (sql) => db.exec(sql));

  const access = new AccessService(db);
  const hooks = new HookRegistry();
  const records = new RecordsService({ db, registry, access, events, hooks, logger: logger.child('engine') });
  const auth = new AuthService({ db, records, events, sessionTtl: config.sessionTtl });
  const jobs = new JobQueue(db, logger.child('jobs'), events);
  const files = new FileService(records, createLocalStorageDriver(config.storageRoot));
  const search = new SearchService(createFts5Driver(db), registry);
  const commerce = new CommerceService({ db, records, events });
  const blocks = new BlockRegistry();
  const settings = new SettingsService(records);
  const notifications = new NotificationService(records, db);

  // Wire the single event pipeline.
  search.connect(events);
  notifications.connect(events);
  setupWebhooks({ db, events, jobs, logger: logger.child('webhooks'), secret: config.secret });
  setupContentScheduling({ records, jobs, registry });
  registerCoreBlocks(blocks);

  // blocks-field validation is an engine filter hook — every collection with a
  // blocks field gets validated against the block registry automatically.
  hooks.onFilter('*', 'create', validateBlocks);
  hooks.onFilter('*', 'update', validateBlocks);
  function validateBlocks(payload: Record<string, unknown>, ctx: { collection: string }) {
    if (!registry.has(ctx.collection)) return;
    const def = registry.get(ctx.collection);
    for (const f of def.fields) {
      if (f.type === 'blocks' && payload[f.name] !== undefined && payload[f.name] !== null) {
        if (!Array.isArray(payload[f.name])) throw new ValidationError(`Field "${f.name}" must be an array of blocks`);
        blocks.validateTree(payload[f.name] as unknown[]);
      }
    }
  }

  // Recurring maintenance on the single queue.
  jobs.every('sessions.prune', 60 * 60 * 1000, () => void auth.pruneSessions());
  jobs.every('carts.abandon', 6 * 60 * 60 * 1000, () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    db.run(`UPDATE carts SET status = 'abandoned' WHERE status = 'active' AND updated_at < ?`, [cutoff]);
  });

  // settings cache invalidation through the same engine events
  events.on('records.update', (e) => {
    if (e.collection === 'settings') settings.invalidate();
  });
  events.on('records.create', (e) => {
    if (e.collection === 'settings') settings.invalidate();
  });

  return {
    config, logger, db, events, registry, access, records, auth,
    files, search, jobs, commerce, blocks, settings, notifications,
  };
}
