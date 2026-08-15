// Cart service — shopping cart with items, discounts, totals calculation

import { PrismaClient } from '@prisma/client';
import { eventBus, NotFoundError } from '@cmc/core';
import crypto from 'crypto';

const prisma = new PrismaClient();

export function createCartService() {
  async function getOrCreateCart(userId?: string, token?: string) {
    let cart;

    if (userId) {
      cart = await prisma.cart.findFirst({
        where: { userId },
        include: { items: { include: { product: true, variant: true } }, discount: true },
      });
    } else if (token) {
      cart = await prisma.cart.findUnique({
        where: { token },
        include: { items: { include: { product: true, variant: true } }, discount: true },
      });
    }

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          userId,
          token: token || crypto.randomUUID(),
          currencyCode: 'USD',
          items: {},
          subtotal: 0,
          grandTotal: 0,
        },
        include: { items: { include: { product: true, variant: true } } },
      });
    }

    return cart;
  }

  async function addItem(cartId: string, input: { productId: string; variantId?: string; quantity: number }) {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    if (!product) throw new NotFoundError('Product', input.productId);

    // Get price
    let unitPrice = 0;
    const price = await prisma.productPrice.findFirst({
      where: {
        OR: [
          { productId: input.productId, isActive: true },
          ...(input.variantId ? [{ variantId: input.variantId, isActive: true }] : []),
        ],
      },
      orderBy: { amount: 'asc' },
    });
    if (price) unitPrice = price.amount;

    // Check if item already in cart
    const existing = await prisma.cartItem.findFirst({
      where: { cartId, productId: input.productId, variantId: input.variantId || null },
    });

    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + input.quantity, totalPrice: (existing.quantity + input.quantity) * unitPrice },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId,
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
          unitPrice,
          totalPrice: input.quantity * unitPrice,
        },
      });
    }

    await recalculateTotals(cartId);
    return getCart(cartId);
  }

  async function updateItemQuantity(cartItemId: string, quantity: number) {
    const item = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
    if (!item) throw new NotFoundError('CartItem', cartItemId);

    if (quantity <= 0) {
      await prisma.cartItem.delete({ where: { id: cartItemId } });
    } else {
      await prisma.cartItem.update({
        where: { id: cartItemId },
        data: { quantity, totalPrice: quantity * item.unitPrice },
      });
    }

    const cart = await prisma.cartItem.findUnique({ where: { id: cartItemId } }).cart();
    if (cart) await recalculateTotals(cart.id);

    return getCart(cart?.id || '');
  }

  async function removeItem(cartItemId: string) {
    const item = await prisma.cartItem.findUnique({ where: { id: cartItemId } });
    if (!item) throw new NotFoundError('CartItem', cartItemId);

    await prisma.cartItem.delete({ where: { id: cartItemId } });
    await recalculateTotals(item.cartId);
    return getCart(item.cartId);
  }

  async function applyDiscount(cartId: string, code: string) {
    const discount = await prisma.discount.findUnique({
      where: { code },
    });

    if (!discount || !discount.isActive) throw new Error('Invalid or expired discount code');
    if (discount.expiresAt && discount.expiresAt < new Date()) throw new Error('Discount code has expired');
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) throw new Error('Discount code usage limit reached');

    await prisma.cart.update({ where: { id: cartId }, data: { discountId: discount.id } });
    await recalculateTotals(cartId);
    return getCart(cartId);
  }

  async function removeDiscount(cartId: string) {
    await prisma.cart.update({ where: { id: cartId }, data: { discountId: null, discountTotal: 0 } });
    await recalculateTotals(cartId);
    return getCart(cartId);
  }

  async function recalculateTotals(cartId: string) {
    const items = await prisma.cartItem.findMany({ where: { cartId } });
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: { discount: true } });
    let discountTotal = 0;

    if (cart?.discountId && cart.discount) {
      const discount = cart.discount;
      if (discount.type === 'PERCENTAGE') {
        discountTotal = subtotal * (discount.value / 100);
        if (discount.maxDiscountAmount) discountTotal = Math.min(discountTotal, discount.maxDiscountAmount);
      } else if (discount.type === 'FIXED') {
        discountTotal = discount.value;
      }
    }

    await prisma.cart.update({
      where: { id: cartId },
      data: {
        subtotal,
        discountTotal,
        taxTotal: subtotal * 0.1, // simplified
        shippingTotal: subtotal > 100 ? 0 : 9.99,
        grandTotal: subtotal - discountTotal + (subtotal * 0.1) + (subtotal > 100 ? 0 : 9.99),
      },
    });
  }

  async function getCart(cartId: string) {
    return prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: { include: { product: true, variant: { include: { prices: true } } } },
        discount: true,
      },
    });
  }

  async function clearCart(cartId: string) {
    await prisma.cartItem.deleteMany({ where: { cartId } });
    await prisma.cart.update({
      where: { id: cartId },
      data: { subtotal: 0, taxTotal: 0, shippingTotal: 0, discountTotal: 0, grandTotal: 0, discountId: null },
    });
  }

  return { getOrCreateCart, addItem, updateItemQuantity, removeItem, applyDiscount, removeDiscount, getCart, clearCart };
}