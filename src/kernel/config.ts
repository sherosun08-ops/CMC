/**
 * Configuration — the ONLY place environment variables are read.
 * Everything else receives typed config. No hardcoded configuration elsewhere.
 */
import path from 'node:path';
import crypto from 'node:crypto';

export interface Config {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  /** Absolute path to the SQLite database file, or ':memory:' for tests. */
  databaseUrl: string;
  /** Directory for uploaded files (local storage driver). */
  storageRoot: string;
  /** Secret used for HMAC signing (webhooks, asset URLs). */
  secret: string;
  /** Session lifetime in seconds (sliding). */
  sessionTtl: number;
  /** Rate limit: max requests per window per key. */
  rateLimit: { windowMs: number; max: number; authMax: number };
  /** Public URL of this instance (used in webhook payloads, absolute links). */
  publicUrl: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const env = (process.env.NODE_ENV as Config['env']) || 'development';
  const root = process.cwd();
  const port = Number(process.env.PORT || 4000);
  const secret = process.env.CMC_SECRET || (env === 'production' ? '' : 'dev-secret-do-not-use-in-prod');
  if (env === 'production' && !secret) {
    throw new Error('CMC_SECRET is required in production');
  }
  return {
    env,
    host: process.env.HOST || '0.0.0.0',
    port,
    databaseUrl: process.env.DATABASE_URL || path.join(root, 'data', 'cmc.db'),
    storageRoot: process.env.STORAGE_ROOT || path.join(root, 'data', 'uploads'),
    secret,
    sessionTtl: Number(process.env.SESSION_TTL || 60 * 60 * 24 * 7),
    rateLimit: {
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
      max: Number(process.env.RATE_LIMIT_MAX || 300),
      authMax: Number(process.env.RATE_LIMIT_AUTH_MAX || 10),
    },
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,
    logLevel: (process.env.LOG_LEVEL as Config['logLevel']) || (env === 'test' ? 'error' : 'info'),
    ...overrides,
  };
}

export function randomId(): string {
  // UUIDv7-style: time-ordered for index locality, random for uniqueness.
  const ts = Date.now().toString(16).padStart(12, '0');
  const rand = crypto.randomBytes(10).toString('hex');
  return `${ts.slice(0, 8)}-${ts.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 19)}`;
}
