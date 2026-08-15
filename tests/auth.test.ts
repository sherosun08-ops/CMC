import { describe, it, expect, beforeEach } from 'vitest';
import { createTestPlatform, createRole, SYSTEM, type TestPlatform } from './helpers.js';
import { AuthService, hashPassword, verifyPassword } from '../src/auth/index.js';

let p: TestPlatform;
let auth: AuthService;

beforeEach(() => {
  p = createTestPlatform();
  auth = new AuthService({ db: p.db, records: p.records, events: p.events, sessionTtl: 3600 });
});

describe('passwords', () => {
  it('hashes and verifies with scrypt', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/8 characters/);
  });
});

describe('login & sessions', () => {
  it('registers, logs in, resolves accountability, logs out', async () => {
    const roleId = await createRole(p, 'admin', true);
    const user = await auth.register('admin@x.co', 'password123');
    await p.records.create(SYSTEM, 'user_roles', { user: user.id, role: roleId });

    const session = await auth.login('admin@x.co', 'password123');
    expect(session.token.startsWith('cmcs_')).toBe(true);

    const acc = auth.resolveToken(session.token);
    expect(acc.userId).toBe(user.id);
    expect(acc.admin).toBe(true);

    auth.logout(session.token);
    expect(() => auth.resolveToken(session.token)).toThrow(/Invalid/);
  });

  it('rejects wrong password and unknown user identically', async () => {
    await auth.register('u@x.co', 'password123');
    await expect(auth.login('u@x.co', 'nope-nope-nope')).rejects.toThrow(/Invalid credentials/);
    await expect(auth.login('ghost@x.co', 'password123')).rejects.toThrow(/Invalid credentials/);
  });

  it('rejects suspended users', async () => {
    const u = await auth.register('s@x.co', 'password123');
    await p.records.update(SYSTEM, 'users', u.id as string, { status: 'suspended' });
    await expect(auth.login('s@x.co', 'password123')).rejects.toThrow(/Invalid credentials/);
  });

  it('stores only hashed tokens', async () => {
    await auth.register('t@x.co', 'password123');
    const session = await auth.login('t@x.co', 'password123');
    const rows = p.db.all('SELECT token_hash FROM _sessions');
    expect(rows.length).toBe(1);
    expect(rows[0].token_hash).not.toContain(session.token);
  });

  it('prunes expired sessions', async () => {
    const u = await auth.register('e@x.co', 'password123');
    const shortAuth = new AuthService({ db: p.db, records: p.records, events: p.events, sessionTtl: -1 });
    shortAuth.createSession(u.id as string);
    expect(auth.pruneSessions()).toBe(1);
  });
});

describe('api keys', () => {
  it('creates, resolves and revokes keys', async () => {
    const u = await auth.register('k@x.co', 'password123');
    const { id, key } = auth.createApiKey(u.id as string, 'ci');
    expect(key.startsWith('cmck_')).toBe(true);

    const acc = auth.resolveToken(key);
    expect(acc.userId).toBe(u.id);

    const list = auth.listApiKeys(u.id as string);
    expect(list.length).toBe(1);
    expect(list[0]).not.toHaveProperty('key_hash');

    auth.revokeApiKey(u.id as string, id);
    expect(() => auth.resolveToken(key)).toThrow(/Invalid API key/);
  });
});
