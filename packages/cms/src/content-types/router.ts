import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, authorize } from '@cmc/auth';
import { createContentItemService } from './service';

export function createContentTypeRouter(): Router {
  const router = Router();
  const service = createContentItemService();

  // List all content types
  router.get('/content-types', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const types = await prisma.contentType.findMany({
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
      });
      res.json({ data: types });
    } catch (err) {
      next(err);
    }
  });

  // Get single content type
  router.get('/content-types/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const type = await prisma.contentType.findUnique({
        where: { id: req.params.id },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!type) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Content type not found' } });
      res.json({ data: type });
    } catch (err) {
      next(err);
    }
  });

  // Create content type (Strapi-style visual builder)
  router.post('/content-types', requireAuth, authorize({ action: 'create', resource: 'cms' }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const { name, label, description, fields, ...rest } = req.body;

      // Validate no duplicate
      const existing = await prisma.contentType.findUnique({ where: { name } });
      if (existing) return res.status(409).json({ error: { code: 'CONFLICT', message: 'Content type already exists' } });

      const type = await prisma.contentType.create({
        data: {
          name,
          label: label || name,
          description,
          apiIdentifier: name.toLowerCase().replace(/\s+/g, '_'),
          ...rest,
          fields: {
            create: fields?.map((f: any, i: number) => ({
              name: f.name,
              label: f.label || f.name,
              type: f.type || 'TEXT',
              required: f.required || false,
              unique: f.unique || false,
              options: f.options || {},
              validation: f.validation || null,
              isLocalized: f.isLocalized || false,
              sortOrder: i,
            })) || [],
          },
        },
        include: { fields: true },
      });

      res.status(201).json({ data: type });
    } catch (err) {
      next(err);
    }
  });

  // Update content type
  router.patch('/content-types/:id', requireAuth, authorize({ action: 'update', resource: 'cms' }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const { fields, ...data } = req.body;

      const type = await prisma.contentType.update({
        where: { id: req.params.id },
        data,
      });
      res.json({ data: type });
    } catch (err) {
      next(err);
    }
  });

  // Delete content type
  router.delete('/content-types/:id', requireAuth, authorize({ action: 'delete', resource: 'cms' }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.contentType.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Content items CRUD
  router.get('/content-types/:id/items', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await service.list(req.params.id, {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 25,
        search: req.query.search as string,
        filter: req.query.filter ? JSON.parse(req.query.filter as string) : undefined,
        sortBy: req.query.sortBy as string || 'createdAt',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      });
      res.json({ data: result.items, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/content-types/:id/items/:itemId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await service.getById(req.params.itemId);
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/content-types/:id/items', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await service.create({
        contentTypeId: req.params.id,
        data: req.body.data || req.body,
        status: req.body.status,
        locale: req.body.locale,
        slug: req.body.slug,
        authorId: req.userId,
        scheduledAt: req.body.scheduledAt,
      });
      res.status(201).json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/content-types/:id/items/:itemId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await service.update(req.params.itemId, req.body, req.userId);
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/content-types/:id/items/:itemId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await service.remove(req.params.itemId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Publishing
  router.post('/content-types/:id/items/:itemId/publish', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await service.publish(req.params.itemId, req.userId);
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  router.post('/content-types/:id/items/:itemId/unpublish', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await service.unpublish(req.params.itemId);
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  // Duplicate
  router.post('/content-types/:id/items/:itemId/duplicate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await service.duplicate(req.params.itemId, req.userId);
      res.status(201).json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  // Get content versions
  router.get('/content-types/:id/items/:itemId/versions', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const versions = await prisma.contentVersion.findMany({
        where: { itemId: req.params.itemId },
        orderBy: { version: 'desc' },
        include: { author: { select: { id: true, name: true, email: true } } },
      });
      res.json({ data: versions });
    } catch (err) {
      next(err);
    }
  });

  // Restore version
  router.post('/content-types/:id/items/:itemId/versions/:versionId/restore', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const version = await prisma.contentVersion.findUnique({
        where: { id: req.params.versionId },
      });
      if (!version) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });

      const item = await service.update(req.params.itemId, { data: version.data as Record<string, unknown> }, req.userId);
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  return router;
}