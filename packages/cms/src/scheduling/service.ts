// Scheduled publishing service (Payload + Strapi content scheduling)

import { PrismaClient } from '@prisma/client';
import { eventBus } from '@cmc/core';

const prisma = new PrismaClient();

export function createSchedulingService() {
  async function schedulePublishing(itemId: string, publishAt: Date): Promise<void> {
    await prisma.contentItem.update({
      where: { id: itemId },
      data: { scheduledAt: publishAt },
    });

    // The queue worker (BullMQ) picks this up
    await eventBus.emit('content.scheduled', {
      itemId,
      publishAt: publishAt.toISOString(),
    });
  }

  async function cancelScheduling(itemId: string): Promise<void> {
    await prisma.contentItem.update({
      where: { id: itemId },
      data: { scheduledAt: null },
    });
  }

  // Called by the scheduler worker
  async function processScheduledItems(): Promise<number> {
    const now = new Date();
    const items = await prisma.contentItem.findMany({
      where: {
        scheduledAt: { lte: now, not: null },
        status: { not: 'published' },
      },
    });

    for (const item of items) {
      await prisma.contentItem.update({
        where: { id: item.id },
        data: {
          status: 'published',
          publishedAt: now,
          scheduledAt: null,
        },
      });

      await eventBus.emit('content.published', {
        id: item.id,
        contentTypeId: item.contentTypeId,
      });
    }

    return items.length;
  }

  // Expired content handling
  async function processExpiredItems(): Promise<number> {
    const now = new Date();
    const items = await prisma.contentItem.findMany({
      where: {
        expiresAt: { lte: now, not: null },
        status: 'published',
      },
    });

    for (const item of items) {
      await prisma.contentItem.update({
        where: { id: item.id },
        data: { status: 'archived' },
      });

      await eventBus.emit('content.expired', {
        id: item.id,
        contentTypeId: item.contentTypeId,
      });
    }

    return items.length;
  }

  return { schedulePublishing, cancelScheduling, processScheduledItems, processExpiredItems };
}