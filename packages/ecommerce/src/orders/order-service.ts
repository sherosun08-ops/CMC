// Order service — complete order lifecycle management

import { PrismaClient } from '@prisma/client';
import { eventBus, NotFoundError } from '@cmc/core';

const prisma = new PrismaClient();

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

export function createOrderService() {
  async function createFromCart(cartId: string, input: { shippingAddress: any; billingAddress: any; email?: string; notes?: string }) {
    const cart = await prisma.cart.findUnique({
      where: { id: cartId },
      include: { items: true, discount: true },
    });
    if (!cart || cart.items.length === 0) throw new Error('Cart is empty');

    const orderNumber = generateOrderNumber();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        storeId: (await prisma.cart.findUnique({ where: { id: cartId } }))?.userId ? (await prisma.user.findUnique({ where: { id: cart.userId || '' }, include: { roles: true } }))?.id : '',
        userId: cart.userId,
        email: input.email,
        status: 'DRAFT',
        currencyCode: cart.currencyCode,
        subtotal: cart.subtotal,
        shippingTotal: cart.shippingTotal,
        taxTotal: cart.taxTotal,
        discountTotal: cart.discountTotal,
        grandTotal: cart.grandTotal,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        notes: input.notes,
        discountId: cart.discountId,
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            title: item.product?.title || '',
            sku: item.product?.sku || item.variant?.sku || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: { items: true },
    });

    // Clear cart
    await prisma.cartItem.deleteMany({ where: { cartId } });

    // Decrement inventory
    for (const item of cart.items) {
      await prisma.inventoryItem.updateMany({
        where: { productId: item.productId || '' },
        data: { reservedQuantity: { increment: item.quantity } },
      });
    }

    // Increment discount usage
    if (cart.discountId) {
      await prisma.discount.update({
        where: { id: cart.discountId },
        data: { usageCount: { increment: 1 } },
      });
    }

    await eventBus.emit('order.created', { id: order.id, orderNumber });
    return order;
  }

  async function createDirect(input: any) {
    const orderNumber = generateOrderNumber();
    const order = await prisma.order.create({
      data: {
        orderNumber,
        storeId: input.storeId,
        customerId: input.customerId,
        userId: input.userId,
        email: input.email,
        status: input.status || 'DRAFT',
        currencyCode: input.currencyCode || 'USD',
        subtotal: input.subtotal || 0,
        shippingTotal: input.shippingTotal || 0,
        taxTotal: input.taxTotal || 0,
        discountTotal: input.discountTotal || 0,
        grandTotal: input.grandTotal || 0,
        shippingAddress: input.shippingAddress,
        billingAddress: input.billingAddress,
        notes: input.notes,
        items: {
          create: (input.items || []).map((item: any) => ({
            productId: item.productId,
            variantId: item.variantId,
            title: item.title,
            sku: item.sku,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: { items: true },
    });

    await eventBus.emit('order.created', { id: order.id, orderNumber });
    return order;
  }

  async function getById(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        shipments: true,
        transactions: { orderBy: { createdAt: 'desc' } },
        discount: true,
        customer: true,
      },
    });
    if (!order) throw new NotFoundError('Order', id);
    return order;
  }

  async function getByNumber(orderNumber: string) {
    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: { items: true, payments: true, shipments: true, transactions: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw new NotFoundError('Order', orderNumber);
    return order;
  }

  async function updateStatus(id: string, status: string) {
    const order = await prisma.order.update({
      where: { id },
      data: { status: status as any },
    });
    await eventBus.emit('order.updated', { id, status });
    return order;
  }

  async function list(params: { page?: number; limit?: number; storeId?: string; status?: string; customerId?: string; search?: string }) {
    const { page = 1, limit = 25, storeId, status, customerId, search } = params;
    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (search) where.orderNumber = { contains: search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { items: true, payments: true, customer: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
      prisma.order.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async function addTransaction(orderId: string, input: { type: string; amount: number; gateway?: string; gatewayTransactionId?: string; metadata?: any }) {
    return prisma.orderTransaction.create({
      data: {
        orderId,
        type: input.type,
        amount: input.amount,
        currencyCode: (await prisma.order.findUnique({ where: { id: orderId } }))?.currencyCode || 'USD',
        gateway: input.gateway || 'manual',
        gatewayTransactionId: input.gatewayTransactionId,
        metadata: input.metadata,
        status: 'completed',
      },
    });
  }

  async function cancel(id: string, reason?: string) {
    const order = await prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED', notes: reason },
    });

    // Release inventory reservations
    const items = await prisma.orderItem.findMany({ where: { orderId: id } });
    for (const item of items) {
      await prisma.inventoryItem.updateMany({
        where: { productId: item.productId || '' },
        data: { reservedQuantity: { decrement: item.quantity } },
      });
    }

    await eventBus.emit('order.cancelled', { id, orderNumber: order.orderNumber });
    return order;
  }

  return { createFromCart, createDirect, getById, getByNumber, updateStatus, list, addTransaction, cancel };
}