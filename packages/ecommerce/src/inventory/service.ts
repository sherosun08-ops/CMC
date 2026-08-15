// Inventory service — stock tracking, movements, warehouse management

import { PrismaClient } from '@prisma/client';
import { eventBus, NotFoundError } from '@cmc/core';

const prisma = new PrismaClient();

export function createInventoryService() {
  async function getInventory(productId: string) {
    const inventory = await prisma.inventoryItem.findUnique({
      where: { productId },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 20 },
        stockLevels: { include: { location: true, variant: true } },
      },
    });
    if (!inventory) throw new NotFoundError('Inventory', productId);
    return inventory;
  }

  async function adjustStock(productId: string, quantity: number, type: string, reason?: string, variantId?: string) {
    const inventory = await prisma.inventoryItem.findUnique({ where: { productId } });
    if (!inventory) throw new NotFoundError('Inventory', productId);

    const newQuantity = inventory.stockQuantity + quantity;
    const newAvailable = inventory.availableQuantity + quantity;

    await prisma.inventoryItem.update({
      where: { productId },
      data: {
        stockQuantity: newQuantity,
        availableQuantity: Math.max(0, newAvailable),
        status: newAvailable <= 0 ? 'OUTOFSTOCK' : newAvailable <= inventory.lowStockThreshold ? 'LOWSTOCK' : 'INSTOCK',
      },
    });

    // Record movement
    await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: inventory.id,
        variantId,
        quantity,
        type,
        reason,
      },
    });

    // Update stock levels if variant
    if (variantId) {
      const level = await prisma.inventoryStockLevel.findFirst({
        where: { inventoryItemId: inventory.id, variantId },
      });
      if (level) {
        await prisma.inventoryStockLevel.update({
          where: { id: level.id },
          data: { quantity: level.quantity + quantity },
        });
      }
    }

    await eventBus.emit('inventory.updated', { productId, quantity, type });
    return getInventory(productId);
  }

  async function reserveStock(productId: string, quantity: number, variantId?: string) {
    const inventory = await prisma.inventoryItem.findUnique({ where: { productId } });
    if (!inventory) throw new NotFoundError('Inventory', productId);

    if (inventory.availableQuantity < quantity) {
      throw new Error(`Insufficient stock for product ${productId}. Available: ${inventory.availableQuantity}, requested: ${quantity}`);
    }

    await prisma.inventoryItem.update({
      where: { productId },
      data: {
        reservedQuantity: { increment: quantity },
        availableQuantity: { decrement: quantity },
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: inventory.id,
        variantId,
        quantity: -quantity,
        type: 'RESERVATION',
      },
    });

    return getInventory(productId);
  }

  async function releaseStock(productId: string, quantity: number, variantId?: string) {
    const inventory = await prisma.inventoryItem.findUnique({ where: { productId } });
    if (!inventory) throw new NotFoundError('Inventory', productId);

    await prisma.inventoryItem.update({
      where: { productId },
      data: {
        reservedQuantity: { decrement: quantity },
        availableQuantity: { increment: quantity },
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: inventory.id,
        variantId,
        quantity,
        type: 'ADJUSTMENT',
        reason: 'Release reservation',
      },
    });

    return getInventory(productId);
  }

  async function checkAvailability(productId: string, quantity: number, variantId?: string): Promise<boolean> {
    const inventory = await prisma.inventoryItem.findUnique({ where: { productId } });
    if (!inventory) return false;
    if (!inventory.trackInventory) return true;
    if (inventory.allowBackorder) return true;
    return inventory.availableQuantity >= quantity;
  }

  async function getLowStock(threshold?: number) {
    return prisma.inventoryItem.findMany({
      where: {
        trackInventory: true,
        availableQuantity: { lte: threshold || 5 },
      },
      include: {
        product: { select: { id: true, title: true, sku: true, storeId: true } },
      },
    });
  }

  async function getMovements(productId: string, limit = 50) {
    const inventory = await prisma.inventoryItem.findUnique({ where: { productId } });
    if (!inventory) throw new NotFoundError('Inventory', productId);

    return prisma.inventoryMovement.findMany({
      where: { inventoryItemId: inventory.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async function transferStock(productId: string, fromLocationId: string, toLocationId: string, quantity: number) {
    // Decrement from source
    await prisma.inventoryStockLevel.updateMany({
      where: { inventoryItemId: (await prisma.inventoryItem.findUnique({ where: { productId } }))!.id, locationId: fromLocationId },
      data: { quantity: { decrement: quantity } },
    });

    // Increment at destination
    await prisma.inventoryStockLevel.upsert({
      where: { id: `transfer-${productId}-${toLocationId}` },
      create: {
        inventoryItemId: (await prisma.inventoryItem.findUnique({ where: { productId } }))!.id,
        locationId: toLocationId,
        quantity,
      },
      update: { quantity: { increment: quantity } },
    });

    await eventBus.emit('inventory.transferred', { productId, fromLocationId, toLocationId, quantity });
  }

  return { getInventory, adjustStock, reserveStock, releaseStock, checkAvailability, getLowStock, getMovements, transferStock };
}