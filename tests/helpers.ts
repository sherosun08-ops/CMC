/** Shared test bootstrapping — in-memory platform instance per test file. */
import { createDb, type Db } from '../src/db/adapter.js';
import { SchemaRegistry } from '../src/schema/registry.js';
import { bootstrapSystemCollections } from '../src/schema/system-collections.js';
import { AccessService, SYSTEM, type Accountability } from '../src/access/index.js';
import { RecordsService } from '../src/engine/records.js';
import { HookRegistry } from '../src/engine/hooks.js';
import { EventBus } from '../src/kernel/events.js';
import { createLogger } from '../src/kernel/logger.js';

export interface TestPlatform {
  db: Db;
  registry: SchemaRegistry;
  access: AccessService;
  records: RecordsService;
  hooks: HookRegistry;
  events: EventBus;
}

export function createTestPlatform(): TestPlatform {
  const db = createDb(':memory:');
  const logger = createLogger('test', 'error');
  const registry = new SchemaRegistry(db);
  bootstrapSystemCollections(registry, (sql) => db.exec(sql));
  const access = new AccessService(db);
  const events = new EventBus(logger);
  const hooks = new HookRegistry();
  const records = new RecordsService({ db, registry, access, events, hooks, logger });
  return { db, registry, access, records, hooks, events };
}

export { SYSTEM };

export async function createRole(p: TestPlatform, name: string, adminAccess = false): Promise<string> {
  const role = await p.records.create(SYSTEM, 'roles', { name, admin_access: adminAccess });
  return role.id as string;
}

export async function createUser(p: TestPlatform, email: string, roleId?: string): Promise<{ userId: string; acc: Accountability }> {
  const user = await p.records.create(SYSTEM, 'users', { email });
  if (roleId) await p.records.create(SYSTEM, 'user_roles', { user: user.id, role: roleId });
  return {
    userId: user.id as string,
    acc: { userId: user.id as string, roleIds: roleId ? [roleId] : [], admin: false },
  };
}

export async function grant(
  p: TestPlatform,
  roleId: string,
  collection: string,
  action: string,
  extras: { row_filter?: unknown; fields?: string[]; presets?: Record<string, unknown> } = {},
): Promise<void> {
  await p.records.create(SYSTEM, 'policies', {
    role: roleId,
    collection,
    action,
    row_filter: extras.row_filter ?? null,
    fields: extras.fields ?? null,
    presets: extras.presets ?? null,
  });
}
