/**
 * API routers — thin: parse → delegate → serialize. Zero business logic here.
 * ONE generic records surface serves every collection (system + user + plugin).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Platform, ApiEnv } from './context.js';
import { requireAuth, rateLimiter } from './middleware.js';
import { InvalidPayloadError, NotFoundError, UnauthorizedError, ForbiddenError } from '../kernel/errors.js';
import type { Query } from '../engine/records.js';
import { listFieldTypes } from '../schema/field-types.js';
import { SYSTEM, PUBLIC } from '../access/index.js';
import { buildOpenApiDocument } from './openapi.js';

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(256) });
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  first_name: z.string().max(120).optional(),
  last_name: z.string().max(120).optional(),
});

function parseQuery(c: { req: { query: (k: string) => string | undefined } }): Query {
  const q: Query = {};
  const filter = c.req.query('filter');
  if (filter) {
    try {
      q.filter = JSON.parse(filter);
    } catch {
      throw new InvalidPayloadError('filter must be valid JSON');
    }
  }
  const search = c.req.query('search');
  if (search) q.search = search;
  const sort = c.req.query('sort');
  if (sort) q.sort = sort.split(',').map((s) => s.trim()).filter(Boolean);
  const page = c.req.query('page');
  if (page) q.page = Number(page);
  const limit = c.req.query('limit');
  if (limit) q.limit = Number(limit);
  const fields = c.req.query('fields');
  if (fields) q.fields = fields.split(',').map((s) => s.trim()).filter(Boolean);
  const locale = c.req.query('locale');
  if (locale) q.locale = locale;
  return q;
}

export function createApi(platform: Platform): Hono<ApiEnv> {
  const { config, records, registry, auth, files, search, commerce, blocks, settings, access } = platform;
  const api = new Hono<ApiEnv>();

  // ── health & meta ──────────────────────────────────────────────────────
  api.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));
  api.get('/openapi.json', (c) => c.json(buildOpenApiDocument(registry, config.publicUrl)));

  // ── auth ───────────────────────────────────────────────────────────────
  const authLimiter = rateLimiter({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.authMax, keyPrefix: 'auth' });

  api.post('/auth/login', authLimiter, async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    const session = await platform.auth.login(body.email, body.password, { ip, userAgent: c.req.header('user-agent') });
    c.header('set-cookie', sessionCookie(session.token, config));
    return c.json({ data: { token: session.token, expires_at: session.expiresAt } });
  });

  api.post('/auth/register', authLimiter, async (c) => {
    const enabled = await settings.get('auth.public_registration', false);
    if (!enabled) throw new ForbiddenError('Public registration is disabled');
    const body = registerSchema.parse(await c.req.json());
    const user = await auth.register(body.email, body.password, {
      first_name: body.first_name, last_name: body.last_name,
    });
    const defaultRole = await settings.get<string | null>('auth.default_role', null);
    if (defaultRole) await records.create(SYSTEM, 'user_roles', { user: user.id, role: defaultRole });
    return c.json({ data: { id: user.id, email: user.email } }, 201);
  });

  api.post('/auth/logout', (c) => {
    const token = c.get('sessionToken');
    if (token) auth.logout(token);
    c.header('set-cookie', sessionCookie('', config, true));
    return c.json({ data: { ok: true } });
  });

  api.get('/auth/me', async (c) => {
    const acc = c.get('accountability');
    if (!acc.userId) throw new UnauthorizedError();
    const user = await records.getById(SYSTEM, 'users', acc.userId);
    const permissions: Record<string, string[]> = {};
    for (const col of registry.list()) {
      const actions = (['create', 'read', 'update', 'delete'] as const).filter((a) => access.can(acc, col.name, a));
      if (actions.length) permissions[col.name] = actions;
    }
    return c.json({ data: { user, admin: acc.admin, roles: acc.roleIds, permissions } });
  });

  api.post('/auth/password', async (c) => {
    requireAuth(c);
    const body = z.object({ current: z.string(), password: z.string().min(8).max(256) }).parse(await c.req.json());
    const acc = c.get('accountability');
    const row = platform.db.get('SELECT email FROM users WHERE id = ?', [acc.userId]);
    await auth.login(row!.email as string, body.current); // throws on wrong current password
    await auth.setPassword(acc.userId!, body.password);
    return c.json({ data: { ok: true } });
  });

  // ── api keys ───────────────────────────────────────────────────────────
  api.get('/auth/api-keys', (c) => {
    requireAuth(c);
    return c.json({ data: auth.listApiKeys(c.get('accountability').userId!) });
  });
  api.post('/auth/api-keys', async (c) => {
    requireAuth(c);
    const body = z.object({ name: z.string().min(1).max(100) }).parse(await c.req.json());
    return c.json({ data: auth.createApiKey(c.get('accountability').userId!, body.name) }, 201);
  });
  api.delete('/auth/api-keys/:id', (c) => {
    requireAuth(c);
    auth.revokeApiKey(c.get('accountability').userId!, c.req.param('id'));
    return c.json({ data: { ok: true } });
  });

  // ── schema management (admin only) ─────────────────────────────────────
  const requireAdmin = (c: { get: (k: 'accountability') => { admin: boolean; userId: string | null } }) => {
    const acc = c.get('accountability');
    if (!acc.userId) throw new UnauthorizedError();
    if (!acc.admin) throw new ForbiddenError('Administrator access required');
  };

  api.get('/schema/collections', (c) => {
    const acc = c.get('accountability');
    const cols = registry.list().filter((col) => acc.admin || access.can(acc, col.name, 'read'));
    return c.json({ data: cols });
  });
  api.get('/schema/field-types', (c) => c.json({
    data: listFieldTypes().map((t) => ({ name: t.name, searchable: !!t.searchable, sortable: t.sortable !== false })),
  }));
  api.get('/schema/blocks', (c) => c.json({
    data: blocks.list().map((b) => ({ type: b.type, label: b.label, props: b.props, container: !!b.container })),
  }));

  const collectionSchema = z.object({
    name: z.string().min(1).max(60),
    label: z.string().max(120).optional(),
    icon: z.string().max(60).optional(),
    versioned: z.boolean().optional(),
    titleField: z.string().optional(),
    fields: z.array(z.object({
      name: z.string().min(1).max(60),
      type: z.string(),
      required: z.boolean().optional(),
      unique: z.boolean().optional(),
      default: z.unknown().optional(),
      relation: z.object({ collection: z.string(), onDelete: z.enum(['cascade', 'set null', 'restrict']).optional() }).optional(),
      options: z.record(z.unknown()).optional(),
      localized: z.boolean().optional(),
      hidden: z.boolean().optional(),
      ui: z.record(z.unknown()).optional(),
    })),
  });

  api.post('/schema/collections', async (c) => {
    requireAdmin(c);
    const body = collectionSchema.parse(await c.req.json());
    const def = registry.define({ ...body, kind: 'user' });
    platform.events.emit({ type: 'schema.update', collection: def.name, payload: { name: def.name }, actorId: c.get('accountability').userId });
    return c.json({ data: def }, 201);
  });
  api.patch('/schema/collections/:name', async (c) => {
    requireAdmin(c);
    const existing = registry.get(c.req.param('name'));
    const body = collectionSchema.partial().parse(await c.req.json());
    const def = registry.define({
      ...existing,
      ...body,
      name: existing.name,
      kind: existing.kind,
      fields: body.fields ?? existing.fields,
    });
    return c.json({ data: def });
  });
  api.delete('/schema/collections/:name', (c) => {
    requireAdmin(c);
    registry.drop(c.req.param('name'));
    return c.json({ data: { ok: true } });
  });

  // ── generic records surface (ONE implementation for all collections) ───
  const guardCollection = (name: string) => {
    const def = registry.has(name) ? registry.get(name) : null;
    if (!def || def.internal) throw new NotFoundError('Collection', name);
    return def;
  };

  api.get('/records/:collection', async (c) => {
    guardCollection(c.req.param('collection'));
    const result = await records.list(c.get('accountability'), c.req.param('collection'), parseQuery(c));
    return c.json({ data: result.items, meta: { total: result.total, page: result.page, limit: result.limit } });
  });
  api.get('/records/:collection/:id', async (c) => {
    guardCollection(c.req.param('collection'));
    const locale = c.req.query('locale');
    const item = await records.getById(c.get('accountability'), c.req.param('collection'), c.req.param('id'), { locale });
    return c.json({ data: item });
  });
  api.post('/records/:collection', async (c) => {
    guardCollection(c.req.param('collection'));
    const body = z.record(z.unknown()).parse(await c.req.json());
    const item = await records.create(c.get('accountability'), c.req.param('collection'), body);
    return c.json({ data: item }, 201);
  });
  api.patch('/records/:collection/:id', async (c) => {
    guardCollection(c.req.param('collection'));
    const body = z.record(z.unknown()).parse(await c.req.json());
    const item = await records.update(c.get('accountability'), c.req.param('collection'), c.req.param('id'), body);
    return c.json({ data: item });
  });
  api.delete('/records/:collection/:id', async (c) => {
    guardCollection(c.req.param('collection'));
    await records.remove(c.get('accountability'), c.req.param('collection'), c.req.param('id'));
    return c.json({ data: { ok: true } });
  });

  // bulk operations — same pipeline, per-item, atomic
  api.post('/records/:collection/bulk', async (c) => {
    guardCollection(c.req.param('collection'));
    const body = z.object({
      action: z.enum(['create', 'update', 'delete']),
      items: z.array(z.record(z.unknown())).min(1).max(100),
    }).parse(await c.req.json());
    const acc = c.get('accountability');
    const collection = c.req.param('collection');
    const results = await platform.db.transactionAsync(async () => {
      const out: unknown[] = [];
      for (const item of body.items) {
        if (body.action === 'create') out.push(await records.create(acc, collection, item));
        else if (body.action === 'update') {
          const { id, ...rest } = item as { id: string };
          if (!id) throw new InvalidPayloadError('Each update item needs an id');
          out.push(await records.update(acc, collection, id, rest));
        } else {
          const { id } = item as { id: string };
          if (!id) throw new InvalidPayloadError('Each delete item needs an id');
          await records.remove(acc, collection, id);
          out.push({ id, deleted: true });
        }
      }
      return out;
    });
    return c.json({ data: results });
  });

  // revisions
  api.get('/records/:collection/:id/revisions', async (c) => {
    guardCollection(c.req.param('collection'));
    const revs = await records.revisions(c.get('accountability'), c.req.param('collection'), c.req.param('id'));
    return c.json({ data: revs });
  });
  api.post('/records/:collection/:id/revert/:revisionId', async (c) => {
    guardCollection(c.req.param('collection'));
    const item = await records.revert(c.get('accountability'), c.req.param('collection'), c.req.param('id'), c.req.param('revisionId'));
    return c.json({ data: item });
  });

  // ── files ──────────────────────────────────────────────────────────────
  api.post('/files', async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new InvalidPayloadError('multipart field "file" is required');
    const data = Buffer.from(await file.arrayBuffer());
    const record = await files.upload(c.get('accountability'), {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data,
      title: (form.get('title') as string) || undefined,
      folder: (form.get('folder') as string) || undefined,
    });
    return c.json({ data: record }, 201);
  });
  api.get('/files/:id/data', async (c) => {
    const { data, mimeType, filename } = await files.download(c.get('accountability'), c.req.param('id'));
    c.header('content-type', mimeType);
    c.header('content-disposition', `inline; filename="${filename}"`);
    c.header('cache-control', 'private, max-age=3600');
    return c.body(new Uint8Array(data));
  });
  api.delete('/files/:id', async (c) => {
    await files.remove(c.get('accountability'), c.req.param('id'));
    return c.json({ data: { ok: true } });
  });

  // ── global search ──────────────────────────────────────────────────────
  api.get('/search', (c) => {
    const acc = c.get('accountability');
    const q = c.req.query('q') ?? '';
    const collections = registry.list().filter((col) => access.can(acc, col.name, 'read')).map((col) => col.name);
    if (collections.length === 0) return c.json({ data: [] });
    const hits = search.query(q, { collections, limit: Number(c.req.query('limit') || 20) });
    return c.json({ data: hits });
  });

  // ── activity ───────────────────────────────────────────────────────────
  api.get('/activity', (c) => {
    requireAdmin(c);
    const limit = Math.min(Number(c.req.query('limit') || 50), 200);
    const page = Math.max(Number(c.req.query('page') || 1), 1);
    const rows = platform.db.all(
      `SELECT a.*, u.email AS actor_email FROM _activity a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [limit, (page - 1) * limit],
    );
    const total = Number(platform.db.get('SELECT COUNT(*) c FROM _activity')?.c ?? 0);
    return c.json({ data: rows, meta: { total, page, limit } });
  });

  // ── notifications (own inbox) ──────────────────────────────────────────
  api.get('/notifications', async (c) => {
    requireAuth(c);
    const acc = c.get('accountability');
    const result = await records.list(SYSTEM, 'notifications', {
      filter: { recipient: { _eq: acc.userId } }, sort: ['-created_at'], limit: 50,
    });
    return c.json({ data: result.items, meta: { total: result.total } });
  });
  api.post('/notifications/:id/read', async (c) => {
    requireAuth(c);
    const acc = c.get('accountability');
    const n = await records.getById(SYSTEM, 'notifications', c.req.param('id'));
    if (n.recipient !== acc.userId) throw new NotFoundError('notifications', c.req.param('id'));
    await records.update(SYSTEM, 'notifications', c.req.param('id'), { read: true });
    return c.json({ data: { ok: true } });
  });

  // ── commerce ───────────────────────────────────────────────────────────
  const cartAccess = (c: { req: { header: (h: string) => string | undefined } }) =>
    c.req.header('x-cart-token') || undefined;

  api.post('/shop/carts', async (c) => {
    const body = z.object({ currency: z.string().regex(/^[A-Z]{3}$/).optional() }).parse(await c.req.json().catch(() => ({})));
    const result = await commerce.createCart(c.get('accountability'), body.currency ?? 'USD');
    return c.json({ data: result }, 201);
  });
  api.get('/shop/carts/:id', (c) => {
    const totals = commerce.cartTotals(c.req.param('id'), cartAccess(c), c.get('accountability'));
    return c.json({ data: totals });
  });
  api.post('/shop/carts/:id/items', async (c) => {
    const body = z.object({ variant_id: z.string(), quantity: z.number().int().min(1).max(999) }).parse(await c.req.json());
    const totals = await commerce.addToCart({
      cartId: c.req.param('id'), token: cartAccess(c), acc: c.get('accountability'),
      variantId: body.variant_id, quantity: body.quantity,
    });
    return c.json({ data: totals });
  });
  api.delete('/shop/carts/:id/items/:itemId', async (c) => {
    const totals = await commerce.removeFromCart({
      cartId: c.req.param('id'), token: cartAccess(c), acc: c.get('accountability'), itemId: c.req.param('itemId'),
    });
    return c.json({ data: totals });
  });
  api.post('/shop/carts/:id/discount', async (c) => {
    const body = z.object({ code: z.string().min(1).max(40) }).parse(await c.req.json());
    const totals = await commerce.applyDiscount({
      cartId: c.req.param('id'), token: cartAccess(c), acc: c.get('accountability'), code: body.code,
    });
    return c.json({ data: totals });
  });
  api.post('/shop/carts/:id/checkout', async (c) => {
    const body = z.object({
      email: z.string().email(),
      shipping_address: z.record(z.unknown()).optional(),
      billing_address: z.record(z.unknown()).optional(),
      notes: z.string().max(2000).optional(),
    }).parse(await c.req.json());
    const order = await commerce.checkout({
      cartId: c.req.param('id'), token: cartAccess(c), acc: c.get('accountability'),
      email: body.email, shippingAddress: body.shipping_address, billingAddress: body.billing_address, notes: body.notes,
    });
    return c.json({ data: order }, 201);
  });
  api.get('/shop/orders/:id/items', async (c) => {
    await records.getById(c.get('accountability'), 'orders', c.req.param('id')); // permission gate
    return c.json({ data: commerce.orderItems(c.req.param('id')) });
  });
  api.post('/shop/orders/:id/transition', async (c) => {
    const body = z.object({ status: z.string() }).parse(await c.req.json());
    const order = await commerce.transitionOrder(c.get('accountability'), c.req.param('id'), body.status);
    return c.json({ data: order });
  });
  api.post('/shop/variants/:id/stock', async (c) => {
    const body = z.object({ quantity: z.number().int(), reason: z.enum(['received', 'returned', 'adjusted']).optional() }).parse(await c.req.json());
    await commerce.receiveStock(c.get('accountability'), c.req.param('id'), body.quantity, body.reason ?? 'received');
    return c.json({ data: { stock: commerce.stockOf(c.req.param('id')) } });
  });
  api.get('/shop/variants/:id/stock', (c) => c.json({ data: { stock: commerce.stockOf(c.req.param('id')) } }));

  // ── content rendering (blocks preview + public page render) ────────────
  api.post('/content/render', async (c) => {
    const body = z.object({ blocks: z.array(z.unknown()) }).parse(await c.req.json());
    blocks.validateTree(body.blocks);
    return c.json({ data: { html: blocks.renderTree(body.blocks) } });
  });
  api.get('/content/pages/:slug', async (c) => {
    // Public endpoint: published pages only, rendered server-side.
    const result = await records.list({ ...PUBLIC }, 'pages', {
      filter: { slug: { _eq: c.req.param('slug') }, status: { _eq: 'published' } }, limit: 1,
      locale: c.req.query('locale'),
    }).catch(() => null);
    const page = result?.items[0];
    if (!page) throw new NotFoundError('Page', c.req.param('slug'));
    const html = blocks.renderTree((page.blocks as unknown[]) ?? []);
    return c.json({ data: { ...page, rendered_html: html } });
  });

  // ── settings ───────────────────────────────────────────────────────────
  api.get('/settings/:key', async (c) => {
    requireAdmin(c);
    return c.json({ data: { key: c.req.param('key'), value: await settings.get(c.req.param('key'), null) } });
  });
  api.put('/settings/:key', async (c) => {
    requireAdmin(c);
    const body = z.object({ value: z.unknown() }).parse(await c.req.json());
    await settings.set(c.get('accountability'), c.req.param('key'), body.value);
    return c.json({ data: { ok: true } });
  });

  // ── system stats (dashboard) ───────────────────────────────────────────
  api.get('/system/stats', (c) => {
    requireAdmin(c);
    const db = platform.db;
    const count = (sql: string, params: unknown[] = []) => Number(db.get(sql, params)?.c ?? 0);
    const revenueRow = db.get(`SELECT COALESCE(SUM(grand_total),0) s, COUNT(*) c FROM orders WHERE status NOT IN ('cancelled','refunded')`);
    return c.json({
      data: {
        users: count('SELECT COUNT(*) c FROM users'),
        orders: Number(revenueRow?.c ?? 0),
        revenue: Number(revenueRow?.s ?? 0),
        products: count(`SELECT COUNT(*) c FROM products WHERE status = 'published'`),
        pages: count('SELECT COUNT(*) c FROM pages'),
        files: count('SELECT COUNT(*) c FROM files'),
        pending_orders: count(`SELECT COUNT(*) c FROM orders WHERE status = 'pending'`),
        jobs: platform.jobs.stats(),
        recent_orders: db.all(`SELECT id, number, email, status, grand_total, currency, created_at FROM orders ORDER BY created_at DESC LIMIT 8`),
        recent_activity: db.all(`SELECT a.action, a.collection, a.record_id, a.created_at, u.email AS actor FROM _activity a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 10`),
        orders_by_day: db.all(`SELECT substr(created_at, 1, 10) day, COUNT(*) c, COALESCE(SUM(grand_total),0) total FROM orders WHERE created_at > datetime('now', '-14 days') GROUP BY day ORDER BY day`),
      },
    });
  });

  return api;
}

function sessionCookie(token: string, config: { env: string; sessionTtl: number }, clear = false): string {
  const parts = [
    `cmc_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${config.sessionTtl}`,
  ];
  if (config.env === 'production') parts.push('Secure');
  return parts.join('; ');
}
