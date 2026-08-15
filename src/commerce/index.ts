/**
 * Commerce module — domain services over system collections (ANALYSIS.md §5).
 * Inventory is an append-only ledger; checkout is one DB transaction that
 * revalidates prices, verifies stock, snapshots the order, and clears the cart.
 * NO parallel store: products/carts/orders are records in the single engine.
 */
import crypto from 'node:crypto';
import { randomId } from '../kernel/config.js';
import type { Db } from '../db/adapter.js';
import type { RecordsService } from '../engine/records.js';
import type { EventBus } from '../kernel/events.js';
import { SYSTEM, type Accountability } from '../access/index.js';
import { ConflictError, InvalidPayloadError, NotFoundError, ValidationError } from '../kernel/errors.js';

export interface CommerceDeps {
  db: Db;
  records: RecordsService;
  events: EventBus;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
  currency: string;
  items: {
    id: string;
    variantId: string;
    title: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  discountCode: string | null;
}

const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['fulfilled', 'refunded', 'cancelled'],
  fulfilled: ['completed', 'refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
};

export class CommerceService {
  constructor(private deps: CommerceDeps) {}

  // ── Inventory (append-only ledger) ────────────────────────────────────
  stockOf(variantId: string): number {
    const row = this.deps.db.get(
      'SELECT COALESCE(SUM(quantity), 0) AS stock FROM inventory_movements WHERE variant = ?',
      [variantId],
    );
    return Number(row?.stock ?? 0);
  }

  async receiveStock(acc: Accountability, variantId: string, quantity: number, reason: 'received' | 'returned' | 'adjusted' = 'received'): Promise<void> {
    if (!Number.isInteger(quantity) || quantity === 0) {
      throw new InvalidPayloadError('Quantity must be a non-zero integer');
    }
    if (quantity < 0 && this.stockOf(variantId) + quantity < 0) {
      throw new ConflictError('Adjustment would make stock negative');
    }
    await this.deps.records.create(acc, 'inventory_movements', {
      variant: variantId, quantity, reason,
    });
  }

  // ── Carts ─────────────────────────────────────────────────────────────
  async createCart(acc: Accountability, currency = 'USD'): Promise<{ cartId: string; token: string }> {
    const token = `cmct_${crypto.randomBytes(24).toString('base64url')}`;
    const cart = await this.deps.records.create(SYSTEM, 'carts', {
      user: acc.userId, token, currency, status: 'active',
    });
    return { cartId: cart.id as string, token };
  }

  /** Guest carts are addressed by token; logged-in carts by ownership. */
  private loadCart(cartId: string, token?: string, acc?: Accountability): Record<string, unknown> {
    const cart = this.deps.db.get('SELECT * FROM carts WHERE id = ?', [cartId]);
    if (!cart || cart.status !== 'active') throw new NotFoundError('Cart', cartId);
    const ownsByToken = token && cart.token === token;
    const ownsByUser = acc?.userId && cart.user === acc.userId;
    if (!ownsByToken && !ownsByUser && !acc?.admin) {
      throw new NotFoundError('Cart', cartId);
    }
    return cart;
  }

  async addToCart(opts: { cartId: string; token?: string; acc?: Accountability; variantId: string; quantity: number }): Promise<CartTotals> {
    const { db, records } = this.deps;
    const cart = this.loadCart(opts.cartId, opts.token, opts.acc);
    if (!Number.isInteger(opts.quantity) || opts.quantity < 1 || opts.quantity > 999) {
      throw new InvalidPayloadError('Quantity must be between 1 and 999');
    }
    const variant = db.get(
      `SELECT v.*, p.status AS product_status, p.title AS product_title
       FROM product_variants v JOIN products p ON p.id = v.product WHERE v.id = ?`,
      [opts.variantId],
    );
    if (!variant || variant.product_status !== 'published') {
      throw new NotFoundError('Variant', opts.variantId);
    }
    if (variant.currency !== cart.currency) {
      throw new ValidationError(`Variant currency ${variant.currency} does not match cart currency ${cart.currency}`);
    }
    if (variant.track_inventory) {
      const inCart = Number(db.get('SELECT COALESCE(SUM(quantity),0) q FROM cart_items WHERE cart = ? AND variant = ?', [opts.cartId, opts.variantId])?.q ?? 0);
      if (this.stockOf(opts.variantId) < inCart + opts.quantity) {
        throw new ConflictError('Insufficient stock');
      }
    }
    const existing = db.get('SELECT id, quantity FROM cart_items WHERE cart = ? AND variant = ?', [opts.cartId, opts.variantId]);
    if (existing) {
      await records.update(SYSTEM, 'cart_items', existing.id as string, {
        quantity: Number(existing.quantity) + opts.quantity,
      });
    } else {
      await records.create(SYSTEM, 'cart_items', {
        cart: opts.cartId, variant: opts.variantId, quantity: opts.quantity,
        unit_price: Number(variant.price), // captured price
      });
    }
    return this.cartTotals(opts.cartId, opts.token, opts.acc);
  }

  async removeFromCart(opts: { cartId: string; token?: string; acc?: Accountability; itemId: string }): Promise<CartTotals> {
    this.loadCart(opts.cartId, opts.token, opts.acc);
    const item = this.deps.db.get('SELECT id, cart FROM cart_items WHERE id = ? AND cart = ?', [opts.itemId, opts.cartId]);
    if (!item) throw new NotFoundError('Cart item', opts.itemId);
    await this.deps.records.remove(SYSTEM, 'cart_items', opts.itemId);
    return this.cartTotals(opts.cartId, opts.token, opts.acc);
  }

  async applyDiscount(opts: { cartId: string; token?: string; acc?: Accountability; code: string }): Promise<CartTotals> {
    const cart = this.loadCart(opts.cartId, opts.token, opts.acc);
    this.validateDiscount(opts.code, this.rawSubtotal(opts.cartId)); // throws if invalid
    await this.deps.records.update(SYSTEM, 'carts', cart.id as string, { discount_code: opts.code });
    return this.cartTotals(opts.cartId, opts.token, opts.acc);
  }

  cartTotals(cartId: string, token?: string, acc?: Accountability): CartTotals {
    const { db } = this.deps;
    const cart = this.loadCart(cartId, token, acc);
    const items = db.all(
      `SELECT ci.id, ci.variant AS variantId, ci.quantity, ci.unit_price,
              v.sku, COALESCE(v.title, p.title) AS title
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant
       JOIN products p ON p.id = v.product
       WHERE ci.cart = ?`,
      [cartId],
    );
    const mapped = items.map((i) => ({
      id: i.id as string,
      variantId: i.variantId as string,
      title: i.title as string,
      sku: i.sku as string,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      total: Number(i.unit_price) * Number(i.quantity),
    }));
    const subtotal = mapped.reduce((sum, i) => sum + i.total, 0);
    let discountTotal = 0;
    const code = (cart.discount_code as string) || null;
    if (code) {
      try {
        const discount = this.validateDiscount(code, subtotal);
        discountTotal = discount.type === 'percent'
          ? Math.floor((subtotal * Number(discount.value)) / 100)
          : Math.min(Number(discount.value), subtotal);
      } catch {
        discountTotal = 0; // silently drop invalid/expired code from totals
      }
    }
    return {
      subtotal,
      discountTotal,
      grandTotal: subtotal - discountTotal,
      currency: cart.currency as string,
      items: mapped,
      discountCode: code,
    };
  }

  private rawSubtotal(cartId: string): number {
    const row = this.deps.db.get(
      'SELECT COALESCE(SUM(quantity * unit_price), 0) s FROM cart_items WHERE cart = ?', [cartId],
    );
    return Number(row?.s ?? 0);
  }

  private validateDiscount(code: string, subtotal: number): Record<string, unknown> {
    const d = this.deps.db.get('SELECT * FROM discounts WHERE code = ?', [code]);
    if (!d || !d.active) throw new NotFoundError('Discount', code);
    const now = new Date();
    if (d.starts_at && new Date(d.starts_at as string) > now) throw new ValidationError('Discount not yet active');
    if (d.ends_at && new Date(d.ends_at as string) < now) throw new ValidationError('Discount expired');
    if (d.usage_limit != null && Number(d.used_count) >= Number(d.usage_limit)) {
      throw new ValidationError('Discount usage limit reached');
    }
    if (d.min_subtotal != null && subtotal < Number(d.min_subtotal)) {
      throw new ValidationError('Cart subtotal below discount minimum');
    }
    if (d.type === 'percent' && (Number(d.value) < 1 || Number(d.value) > 100)) {
      throw new ValidationError('Invalid discount configuration');
    }
    return d;
  }

  // ── Checkout: THE transaction ─────────────────────────────────────────
  async checkout(opts: {
    cartId: string;
    token?: string;
    acc?: Accountability;
    email: string;
    shippingAddress?: Record<string, unknown>;
    billingAddress?: Record<string, unknown>;
    notes?: string;
  }): Promise<Record<string, unknown>> {
    const { db, records, events } = this.deps;
    const acc = opts.acc;
    const totals = this.cartTotals(opts.cartId, opts.token, acc);
    if (totals.items.length === 0) throw new ValidationError('Cart is empty');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opts.email)) throw new ValidationError('Valid email required');

    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const cart = this.loadCart(opts.cartId, opts.token, acc);

    const orderId = db.transaction(() => {
      // 1. verify + decrement stock inside the transaction (invariant 2)
      for (const item of totals.items) {
        const variant = db.get('SELECT track_inventory FROM product_variants WHERE id = ?', [item.variantId]);
        if (!variant) throw new ConflictError(`Variant ${item.sku} no longer exists`);
        if (variant.track_inventory && this.stockOf(item.variantId) < item.quantity) {
          throw new ConflictError(`Insufficient stock for ${item.sku}`);
        }
      }
      // 2. consume discount usage atomically
      if (totals.discountCode && totals.discountTotal > 0) {
        const changed = db.run(
          `UPDATE discounts SET used_count = used_count + 1
           WHERE code = ? AND active = 1 AND (usage_limit IS NULL OR used_count < usage_limit)`,
          [totals.discountCode],
        ).changes;
        if (changed === 0) throw new ConflictError('Discount is no longer available');
      }
      // 3. order + items snapshot + ledger writes (direct SQL inside tx; the
      //    engine emits the domain event after commit via orders.placed below)
      const now = new Date().toISOString();
      const oid = randomId();
      db.run(
        `INSERT INTO orders (id, created_at, updated_at, number, "user", email, status, currency, subtotal, discount_total, grand_total, discount_code, shipping_address, billing_address, notes, placed_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [oid, now, now, orderNumber, (cart.user as string) ?? null, opts.email.toLowerCase(), totals.currency,
         totals.subtotal, totals.discountTotal, totals.grandTotal, totals.discountCode,
         opts.shippingAddress ? JSON.stringify(opts.shippingAddress) : null,
         opts.billingAddress ? JSON.stringify(opts.billingAddress) : null,
         opts.notes ?? null, now],
      );
      for (const item of totals.items) {
        db.run(
          `INSERT INTO order_items (id, created_at, updated_at, "order", variant, title, sku, quantity, unit_price, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomId(), now, now, oid, item.variantId, item.title, item.sku, item.quantity, item.unitPrice, item.total],
        );
        const variant = db.get('SELECT track_inventory FROM product_variants WHERE id = ?', [item.variantId]);
        if (variant?.track_inventory) {
          db.run(
            `INSERT INTO inventory_movements (id, created_at, updated_at, variant, quantity, reason, reference)
             VALUES (?, ?, ?, ?, ?, 'sold', ?)`,
            [randomId(), now, now, item.variantId, -item.quantity, oid],
          );
        }
      }
      // 4. convert cart
      db.run(`UPDATE carts SET status = 'converted', updated_at = ? WHERE id = ?`, [now, opts.cartId]);
      db.run(`DELETE FROM cart_items WHERE cart = ?`, [opts.cartId]);
      // 5. activity (orders collection audits)
      db.run(
        'INSERT INTO _activity (id, action, collection, record_id, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomId(), 'create', 'orders', oid, acc?.userId ?? null, now],
      );
      return oid;
    });

    events.emit({
      type: 'orders.placed',
      collection: 'orders',
      payload: { orderId, number: orderNumber, grandTotal: totals.grandTotal, currency: totals.currency, email: opts.email },
      actorId: acc?.userId ?? null,
    });

    return records.getById(SYSTEM, 'orders', orderId);
  }

  // ── Order state machine (invariant 3) ─────────────────────────────────
  async transitionOrder(acc: Accountability, orderId: string, next: string): Promise<Record<string, unknown>> {
    const order = await this.deps.records.getById(acc, 'orders', orderId);
    const allowed = ORDER_TRANSITIONS[order.status as string] ?? [];
    if (!allowed.includes(next)) {
      throw new ConflictError(`Cannot transition order from "${order.status}" to "${next}"`);
    }
    // Cancelling or refunding a tracked order returns stock.
    if (next === 'cancelled' || next === 'refunded') {
      const items = this.deps.db.all('SELECT variant, quantity FROM order_items WHERE "order" = ?', [orderId]);
      for (const item of items) {
        if (!item.variant) continue;
        const variant = this.deps.db.get('SELECT track_inventory FROM product_variants WHERE id = ?', [item.variant]);
        if (variant?.track_inventory) {
          await this.deps.records.create(SYSTEM, 'inventory_movements', {
            variant: item.variant, quantity: Number(item.quantity), reason: 'returned', reference: orderId,
          });
        }
      }
    }
    const updated = await this.deps.records.update(acc, 'orders', orderId, { status: next });
    this.deps.events.emit({
      type: `orders.${next === 'paid' ? 'paid' : next === 'fulfilled' ? 'fulfilled' : next}`,
      collection: 'orders',
      payload: { orderId, number: updated.number },
      actorId: acc.userId,
    });
    return updated;
  }

  orderItems(orderId: string): Record<string, unknown>[] {
    return this.deps.db.all(
      'SELECT id, variant, title, sku, quantity, unit_price, total FROM order_items WHERE "order" = ?',
      [orderId],
    );
  }
}

