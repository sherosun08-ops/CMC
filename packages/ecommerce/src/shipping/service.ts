// Shipping service — shipping options, rates, tracking

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createShippingService() {
  async function getAvailableOptions(storeId: string, regionId?: string) {
    const where: Record<string, unknown> = { storeId, isActive: true };
    if (regionId) where.regionId = regionId;

    return prisma.shippingOption.findMany({ where, orderBy: { sortOrder: 'asc' } });
  }

  async function calculateRate(optionId: string, weight: number, subtotal: number): Promise<number> {
    const option = await prisma.shippingOption.findUnique({ where: { id: optionId } });
    if (!option) throw new Error('Shipping option not found');

    // Free shipping check
    if (option.freeAbove && subtotal >= option.freeAbove) return 0;

    switch (option.method) {
      case 'free':
        return 0;
      case 'flat':
        return option.price;
      case 'weight_based':
        if (option.minWeight && weight < option.minWeight) return 999999;
        if (option.maxWeight && weight > option.maxWeight) return 999999;
        return option.price * (weight / 1000);
      case 'price_based':
        if (option.minPrice && subtotal < option.minPrice) return 999999;
        if (option.maxPrice && subtotal > option.maxPrice) return 999999;
        return option.price;
      default:
        return option.price;
    }
  }

  async function createShipment(input: { orderId: string; carrier: string; method: string; trackingNumber?: string; address: any; weight?: number; cost?: number }) {
    return prisma.shipment.create({
      data: {
        orderId: input.orderId,
        storeId: (await prisma.order.findUnique({ where: { id: input.orderId } }))?.storeId || '',
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        address: input.address,
        cost: input.cost || 0,
        weight: input.weight,
        status: 'pending',
      },
    });
  }

  async function updateTracking(shipmentId: string, trackingNumber: string, trackingUrl: string) {
    return prisma.shipment.update({
      where: { id: shipmentId },
      data: { trackingNumber, trackingUrl, status: 'shipped', shippedAt: new Date() },
    });
  }

  async function markDelivered(shipmentId: string) {
    return prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: 'delivered', deliveredAt: new Date() },
    });
  }

  async function getShipmentsForOrder(orderId: string) {
    return prisma.shipment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  return { getAvailableOptions, calculateRate, createShipment, updateTracking, markDelivered, getShipmentsForOrder };
}