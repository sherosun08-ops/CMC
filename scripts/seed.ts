/**
 * Seed — realistic demo data through the REAL platform services (no raw SQL
 * shortcuts): proves the whole pipeline and gives the admin something to show.
 * Idempotent: safe to run multiple times.
 */
import { createPlatform } from '../src/bootstrap.js';
import { SYSTEM } from '../src/access/index.js';
import { CommerceService } from '../src/commerce/index.js';

const platform = createPlatform();
const { records, auth, settings } = platform;
const commerce = platform.commerce;

async function findOrCreate(collection: string, filter: Record<string, unknown>, data: Record<string, unknown>) {
  const existing = await records.list(SYSTEM, collection, { filter, limit: 1 });
  if (existing.items.length > 0) return existing.items[0];
  return records.create(SYSTEM, collection, data);
}

async function main() {
  console.log('Seeding…');

  // ── roles ──
  const adminRole = await findOrCreate('roles', { name: { _eq: 'Administrator' } }, {
    name: 'Administrator', description: 'Full access', admin_access: true,
  });
  const editorRole = await findOrCreate('roles', { name: { _eq: 'Editor' } }, {
    name: 'Editor', description: 'Manages content', admin_access: false,
  });
  const customerRole = await findOrCreate('roles', { name: { _eq: 'Customer' } }, {
    name: 'Customer', description: 'Shop customers', admin_access: false,
  });

  // ── users ──
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@cmc.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin12345';
  let admin = (await records.list(SYSTEM, 'users', { filter: { email: { _eq: adminEmail } }, limit: 1 })).items[0];
  if (!admin) {
    admin = await auth.register(adminEmail, adminPassword, { first_name: 'Admin' });
  }
  await findOrCreate('user_roles', { user: { _eq: admin.id }, role: { _eq: adminRole.id } }, { user: admin.id, role: adminRole.id });

  let editor = (await records.list(SYSTEM, 'users', { filter: { email: { _eq: 'editor@cmc.local' } }, limit: 1 })).items[0];
  if (!editor) editor = await auth.register('editor@cmc.local', 'editor12345', { first_name: 'Erin', last_name: 'Editor' });
  await findOrCreate('user_roles', { user: { _eq: editor.id }, role: { _eq: editorRole.id } }, { user: editor.id, role: editorRole.id });

  // ── policies ──
  const grant = async (roleId: unknown, collection: string, action: string, extras: Record<string, unknown> = {}) => {
    const existing = await records.list(SYSTEM, 'policies', {
      filter: { role: { _eq: roleId }, collection: { _eq: collection }, action: { _eq: action } }, limit: 1,
    });
    if (existing.items.length === 0) {
      await records.create(SYSTEM, 'policies', { role: roleId, collection, action, row_filter: null, fields: null, presets: null, ...extras });
    }
  };
  // Editor: full content, read-only commerce
  for (const action of ['create', 'read', 'update', 'delete']) {
    await grant(editorRole.id, 'pages', action);
    await grant(editorRole.id, 'files', action);
  }
  await grant(editorRole.id, 'products', 'read');
  await grant(editorRole.id, 'orders', 'read');
  // Public: read published pages & products
  await grant('$public', 'pages', 'read', { row_filter: { status: { _eq: 'published' } } });
  await grant('$public', 'products', 'read', { row_filter: { status: { _eq: 'published' } } });
  await grant('$public', 'product_variants', 'read');
  // Customers: see their own orders
  await grant(customerRole.id, 'orders', 'read', { row_filter: { user: { _eq: '$CURRENT_USER' } } });

  // ── settings ──
  await settings.set(SYSTEM, 'site.name', 'CMC Demo');
  await settings.set(SYSTEM, 'shop.default_currency', 'USD');
  await settings.set(SYSTEM, 'auth.default_role', customerRole.id);

  // ── content ──
  await findOrCreate('pages', { slug: { _eq: 'home' } }, {
    title: 'Welcome to CMC', slug: 'home', status: 'published', author: admin.id,
    seo_title: 'CMC — content & commerce, unified',
    seo_description: 'One platform for data, content and commerce.',
    blocks: [
      { type: 'section', props: { background: '#f7f8fb' }, children: [
        { type: 'heading', props: { text: 'One platform. Everything connected.', level: 1 } },
        { type: 'paragraph', props: { text: 'CMC unifies dynamic data, content management and commerce behind a single engine, one permission system and one admin.' } },
        { type: 'button', props: { label: 'Browse products', href: '/shop' } },
      ] },
      { type: 'columns', props: { count: 3 }, children: [
        { type: 'paragraph', props: { text: 'Schema-driven: define collections at runtime.' } },
        { type: 'paragraph', props: { text: 'Policy-based access down to rows and fields.' } },
        { type: 'paragraph', props: { text: 'Orders, inventory and content share one audit trail.' } },
      ] },
      { type: 'product_grid', props: { limit: 8 } },
    ],
  });
  await findOrCreate('pages', { slug: { _eq: 'about' } }, {
    title: 'About us', slug: 'about', status: 'draft', author: editor.id,
    blocks: [
      { type: 'heading', props: { text: 'Our story', level: 1 } },
      { type: 'paragraph', props: { text: 'This page is a draft — publish it from the admin.' } },
    ],
  });

  // ── commerce ──
  const catalog = [
    { title: 'Aurora Desk Lamp', slug: 'aurora-desk-lamp', desc: 'Warm, dimmable, sculptural.', variants: [
      { sku: 'LAMP-BLK', title: 'Black', price: 8900, stock: 24 },
      { sku: 'LAMP-BRS', title: 'Brass', price: 9900, stock: 11 },
    ] },
    { title: 'Field Notebook (3-pack)', slug: 'field-notebook', desc: 'Dot grid, 90gsm, stitched.', variants: [
      { sku: 'NB-3PK', title: 'Standard', price: 1800, stock: 140 },
    ] },
    { title: 'Circuit Enamel Mug', slug: 'circuit-mug', desc: '350ml double-walled steel.', variants: [
      { sku: 'MUG-WHT', title: 'White', price: 2400, stock: 55 },
      { sku: 'MUG-NVY', title: 'Navy', price: 2400, stock: 38 },
    ] },
    { title: 'Wander Tote', slug: 'wander-tote', desc: '16L waxed canvas, brass rivets.', variants: [
      { sku: 'TOTE-TAN', title: 'Tan', price: 6400, stock: 17 },
    ] },
  ];

  for (const p of catalog) {
    const product = await findOrCreate('products', { slug: { _eq: p.slug } }, {
      title: p.title, slug: p.slug, description: p.desc, status: 'published',
      blocks: [
        { type: 'heading', props: { text: p.title, level: 2 } },
        { type: 'paragraph', props: { text: p.desc } },
      ],
    });
    for (const v of p.variants) {
      const variant = await findOrCreate('product_variants', { sku: { _eq: v.sku } }, {
        product: product.id, sku: v.sku, title: v.title, price: v.price, currency: 'USD',
      });
      if ((commerce as CommerceService).stockOf(variant.id as string) === 0) {
        await commerce.receiveStock(SYSTEM, variant.id as string, v.stock);
      }
    }
  }

  await findOrCreate('discounts', { code: { _eq: 'WELCOME10' } }, {
    code: 'WELCOME10', type: 'percent', value: 10, active: true,
  });
  await findOrCreate('discounts', { code: { _eq: 'SHIPFREE' } }, {
    code: 'SHIPFREE', type: 'fixed', value: 500, min_subtotal: 5000, active: true,
  });

  // A demo order through the real checkout flow (only once)
  const existingOrders = await records.list(SYSTEM, 'orders', { limit: 1 });
  if (existingOrders.total === 0) {
    const variant = (await records.list(SYSTEM, 'product_variants', { filter: { sku: { _eq: 'MUG-WHT' } }, limit: 1 })).items[0];
    const { cartId, token } = await commerce.createCart(SYSTEM, 'USD');
    await commerce.addToCart({ cartId, token, variantId: variant.id as string, quantity: 2 });
    await commerce.applyDiscount({ cartId, token, code: 'WELCOME10' });
    const order = await commerce.checkout({
      cartId, token, email: 'jane@example.com',
      shippingAddress: { name: 'Jane Doe', line1: '42 Harbor Way', city: 'Lisbon', country: 'PT' },
    });
    await commerce.transitionOrder(SYSTEM, order.id as string, 'paid');
    console.log('demo order:', order.number);
  }

  // ── a demo custom collection (proves runtime schema) ──
  if (!platform.registry.has('faqs')) {
    platform.registry.define({
      name: 'faqs', kind: 'user', label: 'FAQs', titleField: 'question',
      fields: [
        { name: 'question', type: 'string', required: true, options: { maxLength: 200 } },
        { name: 'answer', type: 'text', required: true },
        { name: 'sort_order', type: 'integer', default: 0 },
      ],
    });
  }
  await findOrCreate('faqs', { question: { _eq: 'Is CMC open source?' } }, {
    question: 'Is CMC open source?', answer: 'This demo instance is a from-scratch platform inspired by the best open-source systems.', sort_order: 1,
  });
  await findOrCreate('faqs', { question: { _eq: 'Can I add my own data types?' } }, {
    question: 'Can I add my own data types?', answer: 'Yes — use Data model in the admin to define collections at runtime.', sort_order: 2,
  });

  console.log('Seed complete.');
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  console.log('Editor login: editor@cmc.local / editor12345');
  platform.db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
