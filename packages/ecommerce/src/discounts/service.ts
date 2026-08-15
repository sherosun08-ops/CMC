// Discount/coupon service — percentage, fixed, free shipping, buy X get Y

import { PrismaClient } from '@prisma/client';
import { eventBus } from '@cmc/core';

const prisma = new PrismaClient();

export function createDiscountService() {
  async function list(storeId: string) {
    return prisma.discount.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function getById(id: string) {
    const discount = await prisma.discount.findUnique({ where: { id } });
    if (!discount) throw new Error('Discount not found');
    return discount;
  }

  async function getByCode(code: string, storeId: string) {
    const discount = await prisma.discount.findUnique({
      where: { code },
    });
    if (!discount || discount.storeId !== storeId) throw new Error('Invalid discount code');
    return discount;
  }

  async function create(input: any) {
    const discount = await prisma.discount.create({ data: input });
    await eventBus.emit('discount.created', { id: discount.id, code: discount.code });
    return discount;
  }

  async function update(id: string, input: any) {
    const discount = await prisma.discount.update({ where: { id }, data: input });
    await eventBus.emit('discount.updated', { id: discount.id });
    return discount;
  }

  async function remove(id: string) {
    await prisma.discount.delete({ where: { id } });
    await eventBus.emit('discount.deleted', { id });
  }

  async function validateCode(code: string, storeId: string, orderAmount: number) {
    const discount = await prisma.discount.findUnique({ where: { code } });
    if (!discount) return { valid: false, reason: 'Discount code not found' };
    if (discount.storeId !== storeId) return { valid: false, reason: 'Invalid for this store' };
    if (!discount.isActive) return { valid: false, reason: 'Discount code is inactive' };
    if (discount.expiresAt && discount.expiresAt < new Date()) return { valid: false, reason: 'Discount code has expired' };
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) return { valid: false, reason: 'Discount code usage limit reached' };
    if (discount.minOrderAmount && orderAmount < discount.minOrderAmount) return { valid: false, reason: `Minimum order amount of ${discount.minOrderAmount} not met` };

    return { valid: true, discount };
  }

  async function calculateDiscount(discountId: string, subtotal: number): Promise<number> {
    const discount = await prisma.discount.findUnique({ where: { id: discountId } });
    if (!discount) return 0;

    let amount = 0;
    switch (discount.type) {
      case 'PERCENTAGE':
        amount = subtotal * (discount.value / 100);
        if (discount.maxDiscountAmount) amount = Math.min(amount, discount.maxDiscountAmount);
        break;
      case 'FIXED':
        amount = discount.value;
        break;
      case 'FREE_SHIPPING':
        amount = 0; // handled separately
        break;
      default:
        amount = 0;
    }

    return amount;
  }

  return { list, getById, getByCode, create, update, remove, validateCode, calculateDiscount };
}