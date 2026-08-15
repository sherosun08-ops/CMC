// Content item service — CRUD + versioning + publishing + translations

import { PrismaClient } from '@prisma/client';
import { eventBus, NotFoundError, ValidationError, PaginatedResult, QueryParams } from '@cmc/core';
import slugify from 'slugify';

const prisma = new PrismaClient();

export interface CreateContentItemInput {
  contentTypeId: string;
  data: Record<string, unknown>;
  status?: string;
  locale?: string;
  slug?: string;
  authorId?: string;
  scheduledAt?: string;
}

export interface UpdateContentItemInput {
  data?: Record<string, unknown>;
  status?: string;
  locale?: string;
  slug?: string;
  scheduledAt?: string;
}

export function createContentItemService() {
  async function list(contentTypeId: string, params: QueryParams): Promise<PaginatedResult<unknown>> {
    const { page = 1, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', search, filter } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { contentTypeId };

    if (search) {
      where.OR = [
        { data: { path: ['title'], string_contains: search } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (filter) {
      Object.assign(where, filter);
    }

    const [items, total] = await Promise.all([
      prisma.contentItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.contentItem.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async function getById(id: string): Promise<unknown> {
    const item = await prisma.contentItem.findUnique({
      where: { id },
      include: { seo: true, versions: { orderBy: { createdAt: 'desc' }, take: 5 } },
    });
    if (!item) throw new NotFoundError('ContentItem', id);
    return item;
  }

  async function create(input: CreateContentItemInput): Promise<unknown> {
    const contentType = await prisma.contentType.findUnique({ where: { id: input.contentTypeId } });
    if (!contentType) throw new NotFoundError('ContentType', input.contentTypeId);

    const slug = input.slug || slugify((input.data?.title as string) || 'untitled', { lower: true, strict: true });

    // Ensure unique slug per content type
    const existing = await prisma.contentItem.findFirst({
      where: { slug, contentTypeId: input.contentTypeId },
    });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    const item = await prisma.contentItem.create({
      data: {
        contentTypeId: input.contentTypeId,
        data: input.data as any,
        status: input.status || 'draft',
        locale: input.locale || 'en',
        slug: finalSlug,
        authorId: input.authorId,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
    });

    // Create initial version
    await prisma.contentVersion.create({
      data: {
        itemId: item.id,
        version: 1,
        data: input.data as any,
        authorId: input.authorId,
        isPublished: input.status === 'published',
      },
    });

    await eventBus.emit('content.created', { id: item.id, contentTypeId: input.contentTypeId }, input.authorId);

    if (input.status === 'published') {
      await eventBus.emit('content.published', { id: item.id, contentTypeId: input.contentTypeId }, input.authorId);
    }

    return item;
  }

  async function update(id: string, input: UpdateContentItemInput, userId?: string): Promise<unknown> {
    const existing = await prisma.contentItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('ContentItem', id);

    const data: Record<string, unknown> = {};

    if (input.data) data.data = input.data;
    if (input.status) data.status = input.status;
    if (input.locale) data.locale = input.locale;
    if (input.slug) data.slug = input.slug;
    if (input.scheduledAt) data.scheduledAt = new Date(input.scheduledAt);

    const updated = await prisma.contentItem.update({ where: { id }, data });

    // Save version snapshot
    const latestVersion = await prisma.contentVersion.findFirst({
      where: { itemId: id },
      orderBy: { version: 'desc' },
    });

    await prisma.contentVersion.create({
      data: {
        itemId: id,
        version: (latestVersion?.version || 0) + 1,
        data: input.data || (existing.data as any),
        authorId: userId,
        isPublished: input.status === 'published',
      },
    });

    await eventBus.emit('content.updated', { id, contentTypeId: existing.contentTypeId }, userId);

    if (input.status === 'published') {
      await eventBus.emit('content.published', { id, contentTypeId: existing.contentTypeId }, userId);
    }

    return updated;
  }

  async function remove(id: string): Promise<void> {
    const existing = await prisma.contentItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('ContentItem', id);

    if (existing.status === 'published') {
      // For published items, archive instead of hard delete
      await prisma.contentItem.update({
        where: { id },
        data: { status: 'archived' },
      });
    } else {
      await prisma.contentItem.delete({ where: { id } });
    }

    await eventBus.emit('content.deleted', { id, contentTypeId: existing.contentTypeId });
  }

  async function publish(id: string, userId?: string): Promise<unknown> {
    return update(id, { status: 'published' }, userId);
  }

  async function unpublish(id: string): Promise<unknown> {
    return update(id, { status: 'draft' });
  }

  async function duplicate(id: string, userId?: string): Promise<unknown> {
    const existing = await prisma.contentItem.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('ContentItem', id);

    return create({
      contentTypeId: existing.contentTypeId,
      data: existing.data as Record<string, unknown>,
      locale: existing.locale,
      authorId: userId,
    });
  }

  return { list, getById, create, update, remove, publish, unpublish, duplicate };
}