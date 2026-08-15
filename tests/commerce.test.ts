import { describe, it, expect, beforeEach } from 'vitest';
import { createTestPlatform, SYSTEM, type TestPlatform } from './helpers.js';
import { CommerceService } from '../src/commerce/index.js';

let p: TestPlatform;
let commerce: CommerceService;
let variantId: string;

beforeEach(async () => {
  p = createTestPlatform();
  commerce = new CommerceService({ db: p.db, records: p.records, events: p.events });
  const product = await p.records.create(SYSTEM, 'products', {
    title: 'T-Shirt', slug: 't-shirt', status: 'published',
  });
  const variant = await p.records.create(SYSTEM, 'product_variants', {
    product: product.id, sku: 'TS-M', title: 'Medium', price: 2500, currency: 'USD',
  });
  variantId = variant.id as string;
  await commerce.receiveStock(SYSTEM, variantId, 10);
});

describe('inventory ledger', () => {
  it('computes stock as the sum of movements', async () => {
    expect(commerce.stockOf(variantId)).toBe(10);
    await commerce.receiveStock(SYSTEM, variantId, 5);
    expect(commerce.stockOf(variantId)).toBe(15);
    await commerce.receiveStock(SYSTEM, variantId, -3, 'adjusted');
    expect(commerce.stockOf(variantId)).toBe(12);
  });

  it('blocks adjustments below zero', async () => {
    await expect(commerce.receiveStock(SYSTEM, variantId, -999, 'adjusted')).rejects.toThrow(/negative/);
  });
});

describe('carts', () => {
  it('adds items with captured price and enforces stock', async () => {
    const { cartId, token } = await commerce.createCart(SYSTEM);
    const totals = await commerce.addToCart({ cartId, token, variantId, quantity: 2 });
    expect(totals.subtotal).toBe(5000);
    expect(totals.items[0].unitPrice).toBe(2500);
    await expect(
      commerce.addToCart({ cartId, token, variantId, quantity: 999 }),
    ).rejects.toThrow(/stock/i);
  });

  it('refuses unpublished products', async () => {
    const draft = await p.records.create(SYSTEM, 'products', { title: 'D', slug: 'd', status: 'draft' });
    const v = await p.records.create(SYSTEM, 'product_variants', { product: draft.id, sku: 'D-1', price: 100, currency: 'USD' });
    const { cartId, token } = await commerce.createCart(SYSTEM);
    await expect(commerce.addToCart({ cartId, token, variantId: v.id as string, quantity: 1 })).rejects.toThrow(/not found/i);
  });

  it('guards cart access by token', async () => {
    const { cartId } = await commerce.createCart({ userId: null, roleIds: [], admin: false });
    await expect(
      commerce.addToCart({ cartId, token: 'wrong-token', variantId, quantity: 1 }),
    ).rejects.toThrow(/not found/i);
  });
});

describe('discounts', () => {
  it('applies percent discounts with constraints', async () => {
    await p.records.create(SYSTEM, 'discounts', { code: 'SAVE20', type: 'percent', value: 20, min_subtotal: 4000 });
    const { cartId, token } = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId, token, variantId, quantity: 2 });
    const totals = await commerce.applyDiscount({ cartId, token, code: 'SAVE20' });
    expect(totals.discountTotal).toBe(1000);
    expect(totals.grandTotal).toBe(4000);
  });

  it('rejects below-minimum and expired codes', async () => {
    await p.records.create(SYSTEM, 'discounts', { code: 'BIG', type: 'fixed', value: 500, min_subtotal: 99999 });
    await p.records.create(SYSTEM, 'discounts', { code: 'OLD', type: 'percent', value: 10, ends_at: '2020-01-01T00:00:00Z' });
    const { cartId, token } = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId, token, variantId, quantity: 1 });
    await expect(commerce.applyDiscount({ cartId, token, code: 'BIG' })).rejects.toThrow(/minimum/);
    await expect(commerce.applyDiscount({ cartId, token, code: 'OLD' })).rejects.toThrow(/expired/);
  });
});

describe('checkout', () => {
  it('creates an immutable order snapshot, decrements stock, clears cart', async () => {
    const { cartId, token } = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId, token, variantId, quantity: 3 });

    const placed = new Promise<Record<string, unknown>>((resolve) => {
      p.events.on('orders.placed', (e) => resolve(e.payload as Record<string, unknown>));
    });

    const order = await commerce.checkout({ cartId, token, email: 'buyer@x.co' });
    expect(order.status).toBe('pending');
    expect(order.grand_total).toBe(7500);
    expect(commerce.stockOf(variantId)).toBe(7);

    const items = commerce.orderItems(order.id as string);
    expect(items.length).toBe(1);
    expect(items[0].sku).toBe('TS-M');

    const event = await placed;
    expect(event.number).toBe(order.number);

    // cart is converted and emptied
    const cartRow = p.db.get('SELECT status FROM carts WHERE id = ?', [cartId]);
    expect(cartRow?.status).toBe('converted');
    expect(p.db.all('SELECT * FROM cart_items WHERE cart = ?', [cartId]).length).toBe(0);
  });

  it('fails atomically on insufficient stock (no partial writes)', async () => {
    const { cartId, token } = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId, token, variantId, quantity: 8 });
    // stock drops after items were added
    await commerce.receiveStock(SYSTEM, variantId, -5, 'adjusted');
    await expect(commerce.checkout({ cartId, token, email: 'b@x.co' })).rejects.toThrow(/stock/i);
    expect(p.db.all('SELECT * FROM orders').length).toBe(0);
    expect(commerce.stockOf(variantId)).toBe(5);
    // cart untouched
    expect(p.db.all('SELECT * FROM cart_items WHERE cart = ?', [cartId]).length).toBe(1);
  });

  it('consumes discount usage atomically and enforces limits', async () => {
    await p.records.create(SYSTEM, 'discounts', { code: 'ONCE', type: 'fixed', value: 100, usage_limit: 1 });
    const first = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId: first.cartId, token: first.token, variantId, quantity: 1 });
    await commerce.applyDiscount({ cartId: first.cartId, token: first.token, code: 'ONCE' });
    await commerce.checkout({ cartId: first.cartId, token: first.token, email: 'a@x.co' });

    const second = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId: second.cartId, token: second.token, variantId, quantity: 1 });
    await expect(
      commerce.applyDiscount({ cartId: second.cartId, token: second.token, code: 'ONCE' }),
    ).rejects.toThrow(/limit/);
  });
});

describe('order state machine', () => {
  it('enforces legal transitions and restocks on cancel', async () => {
    const { cartId, token } = await commerce.createCart(SYSTEM);
    await commerce.addToCart({ cartId, token, variantId, quantity: 2 });
    const order = await commerce.checkout({ cartId, token, email: 'sm@x.co' });
    expect(commerce.stockOf(variantId)).toBe(8);

    await expect(commerce.transitionOrder(SYSTEM, order.id as string, 'completed')).rejects.toThrow(/Cannot transition/);
    await commerce.transitionOrder(SYSTEM, order.id as string, 'paid');
    await commerce.transitionOrder(SYSTEM, order.id as string, 'refunded');
    expect(commerce.stockOf(variantId)).toBe(10); // stock returned

    const final = await p.records.getById(SYSTEM, 'orders', order.id as string);
    expect(final.status).toBe('refunded');
    await expect(commerce.transitionOrder(SYSTEM, order.id as string, 'paid')).rejects.toThrow(/Cannot transition/);
  });
});
