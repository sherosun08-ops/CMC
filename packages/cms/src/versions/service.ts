// Version management service (Payload drafts + Directus revisions)

import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@cmc/core';

const prisma = new PrismaClient();

export function createVersionService() {
  async function listVersions(itemId: string) {
    return prisma.contentVersion.findMany({
      where: { itemId },
      orderBy: { version: 'desc' },
    });
  }

  async function getVersion(id: string) {
    const version = await prisma.contentVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundError('Version', id);
    return version;
  }

  async function createVersion(itemId: string, data: Record<string, unknown>, authorId?: string, isPublished = false) {
    const latest = await prisma.contentVersion.findFirst({
      where: { itemId },
      orderBy: { version: 'desc' },
    });

    return prisma.contentVersion.create({
      data: {
        itemId,
        version: (latest?.version || 0) + 1,
        data: data as any,
        authorId,
        isPublished,
      },
    });
  }

  async function restoreVersion(itemId: string, versionId: string): Promise<unknown> {
    const version = await getVersion(versionId);

    const updated = await prisma.contentItem.update({
      where: { id: itemId },
      data: { data: version.data as any },
    });

    // Create a new version marking this restore
    await createVersion(itemId, version.data as Record<string, unknown>, 'restored', false);

    return updated;
  }

  async function diffVersions(versionId1: string, versionId2: string) {
    const [v1, v2] = await Promise.all([getVersion(versionId1), getVersion(versionId2)]);

    const diff: Record<string, { before: unknown; after: unknown }> = {};
    const data1 = v1.data as Record<string, unknown>;
    const data2 = v2.data as Record<string, unknown>;

    const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);
    for (const key of allKeys) {
      if (JSON.stringify(data1[key]) !== JSON.stringify(data2[key])) {
        diff[key] = { before: data1[key], after: data2[key] };
      }
    }

    return { version1: v1.version, version2: v2.version, diff };
  }

  return { listVersions, getVersion, createVersion, restoreVersion, diffVersions };
}