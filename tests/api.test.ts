/**
 * API integration tests — full HTTP round trips through the real server
 * (in-memory DB, no sockets).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPlatform } from '../src/bootstrap.js';
import { createServer } from '../src/server.js';
import type { Platform } from '../src/api/context.js';
import type { Hono } from 'hono';
import { SYSTEM } from '../src/access/index.js';
import productReviews from '../plugins/product-reviews/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let platform: Platform;
let app: Hono;
let adminToken: string;
let tmpStorage: string;

async function json(res: Response) {
  return res.json() as Promise<{ data?: any; meta?: any; error?: any }>;
}

async function req(pathname: string, opts: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body && !headers['content-type']) headers['content-type'] = 'application/json';
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  return app.request(pathname, { ...opts, headers });
}

beforeEach(async () => {
  tmpStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'cmc-api-'));
  platform = createPlatform({
    databaseUrl: ':memory:', env: 'test', logLevel: 'error',
    storageRoot: tmpStorage,
    rateLimit: { windowMs: 60_000, max: 10_000, authMax: 10_000 },
  });
  const server = createServer(platform);
  app = server.app as unknown as Hono;
  await server.plugins.load(productReviews);

  // seed an admin
  const role = await platform.records.create(SYSTEM, 'roles', { name: 'admin', admin_access: true });
  const admin = await platform.auth.register('admin@cmc.dev', 'admin-pass-123');
  await platform.records.create(SYSTEM, 'user_roles', { user: admin.id, role: role.id });
  const session = await platform.auth.login('admin@cmc.dev', 'admin-pass-123');
  adminToken = session.token;
});

describe('auth over HTTP', () => {
  it('logs in, reads /auth/me with permission map, logs out', async () => {
    const login = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@cmc.dev', password: 'admin-pass-123' }) });
    expect(login.status).toBe(200);
    const { data } = await json(login);
    expect(data.token).toMatch(/^cmcs_/);

    const me = await req('/api/auth/me', { token: data.token });
    const meBody = await json(me);
    expect(meBody.data.user.email).toBe('admin@cmc.dev');
    expect(meBody.data.admin).toBe(true);

    const out = await req('/api/auth/logout', { method: 'POST', token: data.token });
    expect(out.status).toBe(200);
    const meAfter = await req('/api/auth/me', { token: data.token });
    expect(meAfter.status).toBe(401);
  });

  it('rejects bad credentials with 401 and identical message', async () => {
    const bad = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@cmc.dev', password: 'wrong-pass-123' }) });
    expect(bad.status).toBe(401);
    const ghost = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'ghost@cmc.dev', password: 'wrong-pass-123' }) });
    expect((await json(bad)).error.message).toBe((await json(ghost)).error.message);
  });

  it('blocks public registration unless enabled', async () => {
    const closed = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'u@x.co', password: 'password123' }) });
    expect(closed.status).toBe(403);
    await platform.settings.set(SYSTEM, 'auth.public_registration', true);
    const open = await req('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: 'u@x.co', password: 'password123' }) });
    expect(open.status).toBe(201);
  });
});

describe('records API', () => {
  it('performs CRUD with policy enforcement end to end', async () => {
    // anonymous cannot read users
    const anon = await req('/api/records/users');
    expect(anon.status).toBe(403);

    // admin creates a page
    const create = await req('/api/records/pages', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ title: 'Home', slug: 'home', status: 'published' }),
    });
    expect(create.status).toBe(201);
    const page = (await json(create)).data;

    // public policy allows reading published pages
    const role = await platform.records.create(SYSTEM, 'policies', {
      role: '$public', collection: 'pages', action: 'read',
      row_filter: { status: { _eq: 'published' } }, fields: null, presets: null,
    });
    expect(role).toBeTruthy();

    const publicList = await req('/api/records/pages');
    expect(publicList.status).toBe(200);
    expect((await json(publicList)).data.length).toBe(1);

    // draft invisible to public
    await req('/api/records/pages', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ title: 'Draft', slug: 'draft' }),
    });
    expect((await json(await req('/api/records/pages'))).data.length).toBe(1);

    // update + revisions + revert
    await req(`/api/records/pages/${page.id}`, {
      method: 'PATCH', token: adminToken, body: JSON.stringify({ title: 'Home v2' }),
    });
    const revs = (await json(await req(`/api/records/pages/${page.id}/revisions`, { token: adminToken }))).data;
    expect(revs.length).toBe(2);
    const reverted = await req(`/api/records/pages/${page.id}/revert/${revs[revs.length - 1].id}`, { method: 'POST', token: adminToken });
    expect((await json(reverted)).data.title).toBe('Home');
  });

  it('supports bulk operations atomically', async () => {
    const ok = await req('/api/records/pages/bulk', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ action: 'create', items: [
        { title: 'A', slug: 'a' }, { title: 'B', slug: 'b' },
      ] }),
    });
    expect(ok.status).toBe(200);
    // second batch: one invalid → whole batch rolls back
    const fail = await req('/api/records/pages/bulk', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ action: 'create', items: [
        { title: 'C', slug: 'c' }, { title: 'D', slug: 'a' }, // duplicate slug
      ] }),
    });
    expect(fail.status).toBe(409);
    const all = await platform.records.list(SYSTEM, 'pages', {});
    expect(all.total).toBe(2); // C was rolled back
  });

  it('hides internal collections from the generic surface', async () => {
    const res = await req('/api/records/cart_items', { token: adminToken });
    expect(res.status).toBe(404);
  });
});

describe('schema API', () => {
  it('creates a user collection at runtime and uses it immediately', async () => {
    const create = await req('/api/schema/collections', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({
        name: 'testimonials',
        label: 'Testimonials',
        fields: [
          { name: 'quote', type: 'text', required: true },
          { name: 'author_name', type: 'string' },
          { name: 'stars', type: 'integer', options: { min: 1, max: 5 } },
        ],
      }),
    });
    expect(create.status).toBe(201);

    const rec = await req('/api/records/testimonials', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ quote: 'Great platform', author_name: 'Ada', stars: 5 }),
    });
    expect(rec.status).toBe(201);

    const bad = await req('/api/records/testimonials', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ quote: 'x', stars: 9 }),
    });
    expect(bad.status).toBe(422);

    // appears in OpenAPI automatically
    const openapi = await json(await req('/api/openapi.json'));
    expect((openapi as any).components.schemas.testimonials).toBeTruthy();

    // non-admin cannot manage schema
    const anon = await req('/api/schema/collections', { method: 'POST', body: JSON.stringify({ name: 'hax', fields: [] }) });
    expect(anon.status).toBe(401);
  });
});

describe('commerce over HTTP (full flow)', () => {
  let variantId: string;

  beforeEach(async () => {
    const product = await platform.records.create(SYSTEM, 'products', { title: 'Mug', slug: 'mug', status: 'published' });
    const variant = await platform.records.create(SYSTEM, 'product_variants', {
      product: product.id, sku: 'MUG-1', price: 1500, currency: 'USD',
    });
    variantId = variant.id as string;
    await platform.commerce.receiveStock(SYSTEM, variantId, 20);
    await platform.records.create(SYSTEM, 'discounts', { code: 'TEN', type: 'percent', value: 10 });
  });

  it('guest cart → items → discount → checkout → admin transitions', async () => {
    const cartRes = await json(await req('/api/shop/carts', { method: 'POST', body: JSON.stringify({}) }));
    const { cartId, token: cartToken } = cartRes.data;

    const add = await req(`/api/shop/carts/${cartId}/items`, {
      method: 'POST', headers: { 'x-cart-token': cartToken },
      body: JSON.stringify({ variant_id: variantId, quantity: 2 }),
    });
    expect(add.status).toBe(200);
    expect((await json(add)).data.subtotal).toBe(3000);

    await req(`/api/shop/carts/${cartId}/discount`, {
      method: 'POST', headers: { 'x-cart-token': cartToken },
      body: JSON.stringify({ code: 'TEN' }),
    });

    const checkout = await req(`/api/shop/carts/${cartId}/checkout`, {
      method: 'POST', headers: { 'x-cart-token': cartToken },
      body: JSON.stringify({ email: 'guest@x.co', shipping_address: { line1: '1 Way', city: 'Rome' } }),
    });
    expect(checkout.status).toBe(201);
    const order = (await json(checkout)).data;
    expect(order.grand_total).toBe(2700);

    // stock decremented
    const stock = await json(await req(`/api/shop/variants/${variantId}/stock`));
    expect(stock.data.stock).toBe(18);

    // wrong cart token cannot read someone's cart
    const stranger = await req(`/api/shop/carts/${cartId}`, { headers: { 'x-cart-token': 'cmct_fake' } });
    expect(stranger.status).toBe(404);

    // admin transitions the order
    const paid = await req(`/api/shop/orders/${order.id}/transition`, {
      method: 'POST', token: adminToken, body: JSON.stringify({ status: 'paid' }),
    });
    expect((await json(paid)).data.status).toBe('paid');
    const illegal = await req(`/api/shop/orders/${order.id}/transition`, {
      method: 'POST', token: adminToken, body: JSON.stringify({ status: 'pending' }),
    });
    expect(illegal.status).toBe(409);

    // anonymous cannot transition orders
    const anonT = await req(`/api/shop/orders/${order.id}/transition`, {
      method: 'POST', body: JSON.stringify({ status: 'fulfilled' }),
    });
    expect([401, 403]).toContain(anonT.status);
  });
});

describe('files over HTTP', () => {
  it('uploads multipart and serves data back', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const form = new FormData();
    form.append('file', new File([png], 'dot.png', { type: 'image/png' }));
    const up = await app.request('/api/files', {
      method: 'POST', body: form, headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(up.status).toBe(201);
    const file = (await json(up)).data;
    expect(file.width).toBe(1);

    const dl = await req(`/api/files/${file.id}/data`, { token: adminToken });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toBe('image/png');
  });
});

describe('content & blocks over HTTP', () => {
  it('renders published pages publicly with escaped blocks', async () => {
    await platform.records.create(SYSTEM, 'policies', {
      role: '$public', collection: 'pages', action: 'read',
      row_filter: { status: { _eq: 'published' } }, fields: null, presets: null,
    });
    await req('/api/records/pages', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({
        title: 'Landing', slug: 'landing', status: 'published',
        blocks: [
          { type: 'section', props: {}, children: [
            { type: 'heading', props: { text: 'Welcome <b>x</b>', level: 1 } },
            { type: 'paragraph', props: { text: 'Body' } },
          ] },
        ],
      }),
    });
    const page = await json(await req('/api/content/pages/landing'));
    expect(page.data.rendered_html).toContain('<h1>Welcome &lt;b&gt;x&lt;/b&gt;</h1>');

    const missing = await req('/api/content/pages/nope');
    expect(missing.status).toBe(404);

    const badBlocks = await req('/api/records/pages', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ title: 'X', slug: 'x', blocks: [{ type: 'ghost' }] }),
    });
    expect(badBlocks.status).toBe(422);
  });
});

describe('search + activity + stats + notifications', () => {
  it('global search respects permissions', async () => {
    await req('/api/records/pages', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ title: 'Zanzibar travel tips', slug: 'zanzibar', status: 'published' }),
    });
    await vi.waitFor(async () => {
      const adminHits = await json(await req('/api/search?q=zanzibar', { token: adminToken }));
      expect(adminHits.data.length).toBe(1);
    });
    const anonHits = await json(await req('/api/search?q=zanzibar'));
    expect(anonHits.data.length).toBe(0); // no public read policy
  });

  it('exposes activity and stats to admins only', async () => {
    expect((await req('/api/activity')).status).toBe(401);
    expect((await req('/api/activity', { token: adminToken })).status).toBe(200);
    const stats = await json(await req('/api/system/stats', { token: adminToken }));
    expect(stats.data).toHaveProperty('users');
    expect(stats.data).toHaveProperty('jobs');
  });
});

describe('plugin (product-reviews)', () => {
  it('adds a working collection, hook, and custom route', async () => {
    const product = await platform.records.create(SYSTEM, 'products', { title: 'Cap', slug: 'cap', status: 'published' });
    const r1 = await req('/api/records/product_reviews', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ product: product.id, author: (await platform.records.list(SYSTEM, 'users', {})).items[0].id, rating: 5, title: 'Great', status: 'approved' }),
    });
    expect(r1.status).toBe(201);

    // duplicate review blocked by plugin hook
    const r2 = await req('/api/records/product_reviews', {
      method: 'POST', token: adminToken,
      body: JSON.stringify({ product: product.id, author: (await platform.records.list(SYSTEM, 'users', {})).items[0].id, rating: 1, title: 'Again' }),
    });
    expect(r2.status).toBe(422);

    // custom route
    const summary = await json(await req(`/api/x/product-reviews/summary/${product.id}`));
    expect(summary.data.count).toBe(1);
    expect(summary.data.average).toBe(5);
  });
});

describe('rate limiting', () => {
  it('throttles after the window limit', async () => {
    const tight = createPlatform({
      databaseUrl: ':memory:', env: 'test', logLevel: 'error',
      storageRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'cmc-rl-')),
      rateLimit: { windowMs: 60_000, max: 3, authMax: 2 },
    });
    const tightApp = createServer(tight).app;
    let last = 200;
    for (let i = 0; i < 5; i++) {
      const res = await tightApp.request('/api/health');
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
