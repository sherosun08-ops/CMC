import { describe, it, expect, beforeEach } from 'vitest';
import { createTestPlatform, createRole, createUser, grant, SYSTEM, type TestPlatform } from './helpers.js';

let p: TestPlatform;
beforeEach(() => {
  p = createTestPlatform();
});

describe('schema registry', () => {
  it('bootstraps system collections', () => {
    expect(p.registry.has('users')).toBe(true);
    expect(p.registry.has('orders')).toBe(true);
    expect(p.registry.get('users').kind).toBe('system');
  });

  it('defines a user collection with DDL sync', async () => {
    p.registry.define({
      name: 'articles', kind: 'user', versioned: true,
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'views', type: 'integer', default: 0 },
      ],
    });
    const rec = await p.records.create(SYSTEM, 'articles', { title: 'Hello' });
    expect(rec.title).toBe('Hello');
    expect(rec.views).toBe(0);
  });

  it('additively adds fields without breaking data', async () => {
    p.registry.define({ name: 'notes', kind: 'user', fields: [{ name: 'body', type: 'text' }] });
    await p.records.create(SYSTEM, 'notes', { body: 'a' });
    p.registry.addField('notes', { name: 'pinned', type: 'boolean', default: false });
    const list = await p.records.list(SYSTEM, 'notes');
    expect(list.total).toBe(1);
    const rec = await p.records.create(SYSTEM, 'notes', { body: 'b', pinned: true });
    expect(rec.pinned).toBe(true);
  });

  it('rejects reserved and invalid names', () => {
    expect(() => p.registry.define({ name: '_bad', kind: 'user', fields: [] })).toThrow();
    expect(() => p.registry.define({ name: 'Bad-Name', kind: 'user', fields: [] })).toThrow();
    expect(() =>
      p.registry.define({ name: 'x', kind: 'user', fields: [{ name: 'id', type: 'string' }] }),
    ).toThrow(/reserved/);
  });

  it('blocks dropping collections that are relation targets', () => {
    p.registry.define({ name: 'authors', kind: 'user', fields: [{ name: 'name', type: 'string' }] });
    p.registry.define({
      name: 'books', kind: 'user',
      fields: [{ name: 'author', type: 'relation', relation: { collection: 'authors' } }],
    });
    expect(() => p.registry.drop('authors')).toThrow(/relation/);
    p.registry.drop('books');
    p.registry.drop('authors');
  });
});

describe('records engine — validation', () => {
  it('enforces required, choices, email, slug, money', async () => {
    await expect(p.records.create(SYSTEM, 'users', {})).rejects.toThrow(/email.*required/i);
    await expect(p.records.create(SYSTEM, 'users', { email: 'nope' })).rejects.toThrow(/valid email/);
    await expect(
      p.records.create(SYSTEM, 'users', { email: 'a@b.co', status: 'wat' }),
    ).rejects.toThrow(/one of/);
    await expect(
      p.records.create(SYSTEM, 'pages', { title: 't', slug: 'Bad Slug' }),
    ).rejects.toThrow(/slug/);
    const prod = await p.records.create(SYSTEM, 'products', { title: 'P', slug: 'p' });
    await expect(
      p.records.create(SYSTEM, 'product_variants', { product: prod.id, sku: 'S1', price: -5 }),
    ).rejects.toThrow(/negative/);
  });

  it('rejects unknown fields', async () => {
    await expect(p.records.create(SYSTEM, 'users', { email: 'a@b.co', hax: 1 })).rejects.toThrow(/Unknown field/);
  });

  it('translates unique violations to conflicts', async () => {
    await p.records.create(SYSTEM, 'users', { email: 'dup@x.co' });
    await expect(p.records.create(SYSTEM, 'users', { email: 'dup@x.co' })).rejects.toThrow(/already exists/);
  });

  it('enforces FK integrity via relations', async () => {
    await expect(
      p.records.create(SYSTEM, 'user_roles', { user: 'missing', role: 'missing' }),
    ).rejects.toThrow(/relation constraint/);
  });
});

describe('records engine — queries', () => {
  beforeEach(async () => {
    for (let i = 1; i <= 5; i++) {
      await p.records.create(SYSTEM, 'pages', {
        title: `Page ${i}`, slug: `page-${i}`, status: i <= 2 ? 'published' : 'draft',
      });
    }
  });

  it('filters with the AST', async () => {
    const r = await p.records.list(SYSTEM, 'pages', { filter: { status: { _eq: 'published' } } });
    expect(r.total).toBe(2);
    const r2 = await p.records.list(SYSTEM, 'pages', {
      filter: { _or: [{ slug: { _eq: 'page-1' } }, { slug: { _eq: 'page-5' } }] },
    });
    expect(r2.total).toBe(2);
  });

  it('searches, sorts and paginates', async () => {
    const r = await p.records.list(SYSTEM, 'pages', { search: 'Page 3' });
    expect(r.total).toBe(1);
    const sorted = await p.records.list(SYSTEM, 'pages', { sort: ['-slug'], limit: 2, page: 1 });
    expect(sorted.items[0].slug).toBe('page-5');
    expect(sorted.items.length).toBe(2);
  });

  it('rejects filter/sort on unknown fields (injection guard)', async () => {
    await expect(p.records.list(SYSTEM, 'pages', { filter: { 'x"; DROP TABLE pages;--': 1 } })).rejects.toThrow();
    await expect(p.records.list(SYSTEM, 'pages', { sort: ['hax'] })).rejects.toThrow();
  });
});

describe('access policies', () => {
  it('denies without policy, allows with policy', async () => {
    const roleId = await createRole(p, 'editor');
    const { acc } = await createUser(p, 'e@x.co', roleId);
    await expect(p.records.list(acc, 'pages')).rejects.toThrow(/permission/i);
    await grant(p, roleId, 'pages', 'read');
    const r = await p.records.list(acc, 'pages');
    expect(r.total).toBe(0);
  });

  it('applies row filters from policy', async () => {
    await p.records.create(SYSTEM, 'pages', { title: 'Pub', slug: 'pub', status: 'published' });
    await p.records.create(SYSTEM, 'pages', { title: 'Dr', slug: 'dr', status: 'draft' });
    const roleId = await createRole(p, 'viewer');
    const { acc } = await createUser(p, 'v@x.co', roleId);
    await grant(p, roleId, 'pages', 'read', { row_filter: { status: { _eq: 'published' } } });
    const r = await p.records.list(acc, 'pages');
    expect(r.total).toBe(1);
    expect(r.items[0].slug).toBe('pub');
    // getById honors the same row filter
    const draft = (await p.records.list(SYSTEM, 'pages', { filter: { slug: { _eq: 'dr' } } })).items[0];
    await expect(p.records.getById(acc, 'pages', draft.id as string)).rejects.toThrow(/not found/i);
  });

  it('enforces field allowlists on write', async () => {
    const roleId = await createRole(p, 'limited');
    const { acc } = await createUser(p, 'l@x.co', roleId);
    await grant(p, roleId, 'pages', 'create', { fields: ['title', 'slug'] });
    await expect(
      p.records.create(acc, 'pages', { title: 't', slug: 't', status: 'published' }),
    ).rejects.toThrow(/not permitted/);
    const rec = await p.records.create(acc, 'pages', { title: 't', slug: 't' });
    expect(rec.status).toBe('draft');
  });

  it('applies presets ($CURRENT_USER) server-side', async () => {
    const roleId = await createRole(p, 'author');
    const { acc, userId } = await createUser(p, 'a@x.co', roleId);
    await grant(p, roleId, 'pages', 'create', { presets: { author: '$CURRENT_USER' }, fields: ['title', 'slug', 'author'] });
    await grant(p, roleId, 'pages', 'read', { row_filter: { author: { _eq: '$CURRENT_USER' } } });
    const rec = await p.records.create(acc, 'pages', { title: 'Mine', slug: 'mine' });
    expect(rec.author).toBe(userId);
    const r = await p.records.list(acc, 'pages');
    expect(r.total).toBe(1);
  });

  it('never serializes hash fields', async () => {
    await p.records.create(SYSTEM, 'users', { email: 'h@x.co', password: 'hashed-thing' });
    const r = await p.records.list(SYSTEM, 'users', { filter: { email: { _eq: 'h@x.co' } } });
    expect(r.items[0]).not.toHaveProperty('password');
  });
});

describe('versioning & audit', () => {
  it('writes revisions for versioned collections and reverts', async () => {
    const rec = await p.records.create(SYSTEM, 'pages', { title: 'V1', slug: 'v' });
    await p.records.update(SYSTEM, 'pages', rec.id as string, { title: 'V2' });
    const revs = await p.records.revisions(SYSTEM, 'pages', rec.id as string);
    expect(revs.length).toBe(2);
    const first = revs[revs.length - 1];
    const reverted = await p.records.revert(SYSTEM, 'pages', rec.id as string, first.id as string);
    expect(reverted.title).toBe('V1');
  });

  it('writes activity entries', async () => {
    await p.records.create(SYSTEM, 'pages', { title: 'A', slug: 'a' });
    const activity = p.db.all(`SELECT * FROM _activity WHERE collection = 'pages'`);
    expect(activity.length).toBe(1);
    expect(activity[0].action).toBe('create');
  });
});

describe('hooks & events', () => {
  it('filter hooks can mutate payloads; action hooks observe; events emit', async () => {
    const seen: string[] = [];
    p.hooks.onFilter('pages', 'create', (payload) => ({ ...payload, title: `[x] ${payload.title}` }));
    p.hooks.onAction('pages', 'create', (record) => {
      seen.push(`hook:${record.title}`);
    });
    const done = new Promise<void>((resolve) => {
      p.events.on('records.create', (e) => {
        if (e.collection === 'pages') {
          seen.push(`event:${e.type}`);
          resolve();
        }
      });
    });
    const rec = await p.records.create(SYSTEM, 'pages', { title: 'T', slug: 't' });
    await done;
    expect(rec.title).toBe('[x] T');
    expect(seen).toContain('hook:[x] T');
    expect(seen).toContain('event:records.create');
  });
});

describe('localization', () => {
  it('stores and applies per-locale values', async () => {
    const rec = await p.records.create(SYSTEM, 'pages', {
      title: { $locales: { ar: 'مرحبا', fr: 'Bonjour' }, default: 'Hello' },
      slug: 'hello',
    });
    expect(rec.title).toBe('Hello');
    const ar = await p.records.getById(SYSTEM, 'pages', rec.id as string, { locale: 'ar' });
    expect(ar.title).toBe('مرحبا');
  });
});
