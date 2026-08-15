// Pages router — for Page Builder integrated pages

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, authorize } from '@cmc/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function createPagesRouter(): Router {
  const router = Router();

  // List pages
  router.get('/pages', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = '1', limit = '25', status } = req.query;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;

      const pages = await prisma.page.findMany({
        where,
        skip: (parseInt(page as string) - 1) * parseInt(limit as string),
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: { template: true, theme: true, layout: true },
      });
      const total = await prisma.page.count({ where });

      res.json({
        data: pages,
        meta: { page: parseInt(page as string), limit: parseInt(limit as string), total, totalPages: Math.ceil(total / parseInt(limit as string)) },
      });
    } catch (err) {
      next(err);
    }
  });

  // Get page by slug (public)
  router.get('/pages/slug/:slug', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = await prisma.page.findUnique({
        where: { slug: req.params.slug },
        include: { template: true, sections: true },
      });
      if (!page || page.status !== 'published') {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Page not found' } });
      }
      res.json({ data: page });
    } catch (err) {
      next(err);
    }
  });

  // Get single page
  router.get('/pages/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = await prisma.page.findUnique({
        where: { id: req.params.id },
        include: { template: true, theme: true, layout: true, sections: true, pageVersions: { orderBy: { version: 'desc' }, take: 5 } },
      });
      if (!page) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Page not found' } });
      res.json({ data: page });
    } catch (err) {
      next(err);
    }
  });

  // Create page
  router.post('/pages', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = await prisma.page.create({
        data: {
          title: req.body.title,
          slug: req.body.slug,
          html: req.body.html || null,
          css: req.body.css,
          js: req.body.js,
          status: req.body.status || 'draft',
          templateId: req.body.templateId,
          themeId: req.body.themeId,
          createdById: req.userId,
          seo: req.body.seo || null,
        },
      });
      res.status(201).json({ data: page });
    } catch (err) {
      next(err);
    }
  });

  // Update page (GrapesJS saves here)
  router.patch('/pages/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Create version before updating
      const existing = await prisma.page.findUnique({ where: { id: req.params.id } });
      if (existing) {
        const latestVersion = await prisma.pageVersion.findFirst({
          where: { pageId: req.params.id },
          orderBy: { version: 'desc' },
        });
        await prisma.pageVersion.create({
          data: {
            pageId: req.params.id,
            version: (latestVersion?.version || 0) + 1,
            html: existing.html as any,
            css: existing.css,
            js: existing.js,
            createdById: req.userId,
          },
        });
      }

      const page = await prisma.page.update({
        where: { id: req.params.id },
        data: {
          title: req.body.title,
          slug: req.body.slug,
          html: req.body.html,
          css: req.body.css,
          js: req.body.js,
          status: req.body.status,
          seo: req.body.seo,
          templateId: req.body.templateId,
          themeId: req.body.themeId,
        },
      });
      res.json({ data: page });
    } catch (err) {
      next(err);
    }
  });

  // Delete page
  router.delete('/pages/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.page.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // Page templates
  router.get('/templates', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const templates = await prisma.pageTemplate.findMany();
      res.json({ data: templates });
    } catch (err) {
      next(err);
    }
  });

  router.post('/templates', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const template = await prisma.pageTemplate.create({ data: req.body });
      res.status(201).json({ data: template });
    } catch (err) {
      next(err);
    }
  });

  // Themes
  router.get('/themes', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const themes = await prisma.theme.findMany();
      res.json({ data: themes });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/themes/:id/activate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      await prisma.theme.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const theme = await prisma.theme.update({ where: { id: req.params.id }, data: { isActive: true } });
      res.json({ data: theme });
    } catch (err) {
      next(err);
    }
  });

  return router;
}