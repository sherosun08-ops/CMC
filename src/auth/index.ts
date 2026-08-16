/**
 * Auth module — THE single identity & credential system.
 * Opaque session tokens (SHA-256 at rest, sliding expiry) + API keys (ADR-002).
 * Passwords: scrypt (node:crypto), timing-safe compare.
 * Users/roles live in collections; this module owns only credentials & tokens.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Db } from '../db/adapter.js';
import type { RecordsService } from '../engine/records.js';
import { SYSTEM, type Accountability, PUBLIC } from '../access/index.js';
import { UnauthorizedError, ValidationError } from '../kernel/errors.js';
import type { EventBus } from '../kernel/events.js';
import { randomId } from '../kernel/config.js';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const SCRYPT_OPTS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1 };

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');
  if (password.length > 256) throw new ValidationError('Password too long');
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, SCRYPT_OPTS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = await scrypt(password, Buffer.from(saltHex, 'hex'), 64, SCRYPT_OPTS);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export interface AuthDeps {
  db: Db;
  records: RecordsService;
  events: EventBus;
  sessionTtl: number;
}

export class AuthService {
  constructor(private deps: AuthDeps) {}

  // ── credentials ────────────────────────────────────────────────────────
  async register(email: string, password: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const hash = await hashPassword(password);
    return this.deps.records.create(SYSTEM, 'users', { ...extra, email, password: hash });
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const hash = await hashPassword(password);
    await this.deps.records.update(SYSTEM, 'users', userId, { password: hash });
  }

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<{ token: string; userId: string; expiresAt: string }> {
    const { db, records, events } = this.deps;
    const row = db.get('SELECT id, password, status FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    // Constant-shape flow: verify against a dummy hash when the user is missing
    // so response timing does not reveal account existence.
    const stored = (row?.password as string) || 'scrypt$00$00';
    const ok = await verifyPassword(password, stored);
    if (!row || !ok || row.status !== 'active') {
      events.emit({ type: 'auth.failed', payload: { email }, actorId: null });
      throw new UnauthorizedError('Invalid credentials');
    }
    const session = this.createSession(row.id as string, meta);
    await records.update(SYSTEM, 'users', row.id as string, { last_login_at: new Date().toISOString() });
    events.emit({ type: 'auth.login', payload: { userId: row.id }, actorId: row.id as string });
    return session;
  }

  logout(token: string): void {
    this.deps.db.run('DELETE FROM _sessions WHERE token_hash = ?', [sha256(token)]);
  }

  // ── sessions ───────────────────────────────────────────────────────────
  createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}): { token: string; userId: string; expiresAt: string } {
    const token = `cmcs_${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + this.deps.sessionTtl * 1000).toISOString();
    this.deps.db.run(
      'INSERT INTO _sessions (id, user_id, token_hash, expires_at, created_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomId(), userId, sha256(token), expiresAt, new Date().toISOString(), meta.ip ?? null, meta.userAgent ?? null],
    );
    return { token, userId, expiresAt };
  }

  /** Resolve a bearer token (session or API key) into Accountability. */
  resolveToken(token: string, ip?: string): Accountability {
    const { db, sessionTtl } = this.deps;
    if (token.startsWith('cmck_')) {
      const key = db.get('SELECT id, user_id FROM _api_keys WHERE key_hash = ?', [sha256(token)]);
      if (!key) throw new UnauthorizedError('Invalid API key');
      db.run('UPDATE _api_keys SET last_used_at = ? WHERE id = ?', [new Date().toISOString(), key.id]);
      return this.accountabilityFor(key.user_id as string, ip);
    }
    const session = db.get('SELECT user_id, expires_at, token_hash FROM _sessions WHERE token_hash = ?', [sha256(token)]);
    if (!session) throw new UnauthorizedError('Invalid or expired session');
    if (new Date(session.expires_at as string) < new Date()) {
      db.run('DELETE FROM _sessions WHERE token_hash = ?', [session.token_hash]);
      throw new UnauthorizedError('Session expired');
    }
    // sliding expiry
    db.run('UPDATE _sessions SET expires_at = ? WHERE token_hash = ?', [
      new Date(Date.now() + sessionTtl * 1000).toISOString(), session.token_hash,
    ]);
    return this.accountabilityFor(session.user_id as string, ip);
  }

  accountabilityFor(userId: string, ip?: string): Accountability {
    const { db } = this.deps;
    const user = db.get('SELECT id, status FROM users WHERE id = ?', [userId]);
    if (!user || user.status !== 'active') throw new UnauthorizedError('Account is not active');
    const roles = db.all(
      `SELECT r.id, r.admin_access FROM roles r JOIN user_roles ur ON ur.role = r.id WHERE ur.user = ?`,
      [userId],
    );
    return {
      userId,
      roleIds: roles.map((r) => r.id as string),
      admin: roles.some((r) => !!r.admin_access),
      ip,
    };
  }

  // ── api keys ───────────────────────────────────────────────────────────
  createApiKey(userId: string, name: string): { id: string; key: string } {
    const raw = `cmck_${crypto.randomBytes(32).toString('base64url')}`;
    const id = randomId();
    this.deps.db.run(
      'INSERT INTO _api_keys (id, user_id, name, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, name, sha256(raw), raw.slice(0, 12), new Date().toISOString()],
    );
    return { id, key: raw }; // raw key shown exactly once
  }

  listApiKeys(userId: string): Record<string, unknown>[] {
    return this.deps.db.all(
      'SELECT id, name, prefix, created_at, last_used_at FROM _api_keys WHERE user_id = ?', [userId],
    );
  }

  revokeApiKey(userId: string, keyId: string): void {
    this.deps.db.run('DELETE FROM _api_keys WHERE id = ? AND user_id = ?', [keyId, userId]);
  }

  /** Delete expired sessions — called by the scheduler (single queue, ADR-002). */
  pruneSessions(): number {
    return this.deps.db.run('DELETE FROM _sessions WHERE expires_at < ?', [new Date().toISOString()]).changes;
  }
}

export { PUBLIC };
