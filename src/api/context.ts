/**
 * API context — dependency container assembled once at boot.
 * Routers receive this; they never construct services themselves.
 */
import type { Config } from '../kernel/config.js';
import type { Logger } from '../kernel/logger.js';
import type { Db } from '../db/adapter.js';
import type { EventBus } from '../kernel/events.js';
import type { SchemaRegistry } from '../schema/registry.js';
import type { AccessService, Accountability } from '../access/index.js';
import type { RecordsService } from '../engine/records.js';
import type { AuthService } from '../auth/index.js';
import type { FileService } from '../files/index.js';
import type { SearchService } from '../search/index.js';
import type { JobQueue } from '../jobs/index.js';
import type { CommerceService } from '../commerce/index.js';
import type { BlockRegistry } from '../content/index.js';
import type { SettingsService } from '../platform/settings.js';
import type { NotificationService } from '../platform/notifications.js';

export interface Platform {
  config: Config;
  logger: Logger;
  db: Db;
  events: EventBus;
  registry: SchemaRegistry;
  access: AccessService;
  records: RecordsService;
  auth: AuthService;
  files: FileService;
  search: SearchService;
  jobs: JobQueue;
  commerce: CommerceService;
  blocks: BlockRegistry;
  settings: SettingsService;
  notifications: NotificationService;
}

/** Hono context variables set by middleware. */
export type ApiEnv = {
  Variables: {
    accountability: Accountability;
    sessionToken: string | null;
  };
};
