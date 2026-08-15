import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { authenticate } from '@cmc/auth';
import { CmcError } from '@cmc/core';
import { rateLimiter } from '../rate-limit/middleware';
import { apiDocsRouter } from '../docs/swagger';
import { createGraphQLHandler } from '../graphql/handler';
import { createContentTypeRouter } from '@cmc/cms';
import { createEcommerceRouter } from '@cmc/ecommerce';
import { createMediaRouter } from '@cmc/media';

export function createApiApp(): Express {
  const app = express();

  // Global middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  app.use(rateLimiter);

  // Auth
  app.use(authenticate);

  // API docs
  app.use('/api/docs', apiDocsRouter);

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
  });

  // REST API routes
  app.use('/api/cms', createContentTypeRouter());
  app.use('/api/ecommerce', createEcommerceRouter());
  app.use('/api/media', createMediaRouter());

  // GraphQL
  app.all('/api/graphql', createGraphQLHandler());

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof CmcError) {
      return res.status(err.status).json({ error: err.toJSON() });
    }

    console.error('Unhandled error:', err);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}