// Dynamic router factory — auto-generates REST endpoints from config (Directus-style)
// Used by CMS content types, E-commerce entities, etc.

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, authorize } from '@cmc/auth';
import { QueryParams, PaginatedResult, NotFoundError } from '@cmc/core';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface RouterConfig {
  model: keyof PrismaClient;
  name: string;
  permissions?: {
    create?: string;
    read?: string;
    update?: string;
    delete?: string;
  };
  searchFields?: string[];
  allowedIncludes?: string[];
  hooks?: {
    beforeCreate?: (data: unknown, req: Request) => Promise<unknown>;
    afterCreate?: (result: unknown, req: Request) => Promise<void>;
    beforeUpdate?: (id: string, data: unknown, req: Request) => Promise<unknown>;
    afterUpdate?: (result: unknown, req: Request) => Promise<void>;
    beforeDelete?: (id: string, req: Request) => Promise<void>;
  };
}

export function createRouter(config: RouterConfig): Router {
  const router = Router();
  const model = prisma[config.model] as any;
  const basePath = `/${config.name}`;

  // List (with pagination, filtering, sorting, search)
  router.get(basePath, requireAuth, authorize({ action: 'read', resource: config.name }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = '1', limit = '25', sortBy = 'createdAt', sortOrder = 'desc', search, filter, include } = req.query as Record<string, string>;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where: Record<string, unknown> = {};

      // Search
      if (search && config.searchFields) {
        where.OR = config.searchFields.map((field) => ({
          [field]: { contains: search, mode: 'insensitive' },
        }));
      }

      // Filter
      if (filter) {
        try {
          const parsedFilter = JSON.parse(filter);
          Object.assign(where, parsedFilter);
        } catch { /* ignore invalid filter */ }
      }

      // Include relations
      const includeObj: Record<string, boolean> = {};
      if (include && config.allowedIncludes) {
        const includes = include.split(',');
        includes.forEach((inc) => {
          if (config.allowedIncludes!.includes(inc)) {
            includeObj[inc] = true;
          }
        });
      }

      const [items, total] = await Promise.all([
        model.findMany({
          where,
          skip,
          take,
          orderBy: { [sortBy]: sortOrder },
          include: Object.keys(includeObj).length > 0 ? includeObj : undefined,
        }),
        model.count({ where }),
      ]);

      const result: PaginatedResult<unknown> = {
        items,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      };

      res.json({ data: result.items, meta: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
    } catch (err) {
      next(err);
    }
  });

  // Get by ID
  router.get(`${basePath}/:id`, requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await model.findUnique({
        where: { id: req.params.id },
      });
      if (!item) throw new NotFoundError(config.name, req.params.id);
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  // Create
  router.post(basePath, requireAuth, authorize({ action: 'create', resource: config.name }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      let data = req.body;
      if (config.hooks?.beforeCreate) {
        data = await config.hooks.beforeCreate(data, req);
      }
      const item = await model.create({ data });
      if (config.hooks?.afterCreate) {
        await config.hooks.afterCreate(item, req);
      }
      res.status(201).json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  // Update
  router.patch(`${basePath}/:id`, requireAuth, authorize({ action: 'update', resource: config.name }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      let data = req.body;
      if (config.hooks?.beforeUpdate) {
        data = await config.hooks.beforeUpdate(req.params.id, data, req);
      }
      const item = await model.update({
        where: { id: req.params.id },
        data,
      });
      if (config.hooks?.afterUpdate) {
        await config.hooks.afterUpdate(item, req);
      }
      res.json({ data: item });
    } catch (err) {
      next(err);
    }
  });

  // Delete
  router.delete(`${basePath}/:id`, requireAuth, authorize({ action: 'delete', resource: config.name }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (config.hooks?.beforeDelete) {
        await config.hooks.beforeDelete(req.params.id, req);
      }
      await model.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Batch operations
  router.post(`${basePath}/batch`, requireAuth, authorize({ action: 'update', resource: config.name }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ids, operation, data } = req.body;
      if (operation === 'delete') {
        await model.deleteMany({ where: { id: { in: ids } } });
      } else if (operation === 'update') {
        await model.updateMany({ where: { id: { in: ids } }, data });
      }
      res.json({ success: true, affected: ids.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}