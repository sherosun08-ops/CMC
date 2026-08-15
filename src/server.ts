/**
 * HTTP server — API + admin SPA in one origin.
 */
import { Hono } from 'hono';
import fs from 'node:fs';
import path from 'node:path';
import type { Platform, ApiEnv } from './api/context.js';
import { createApi } from './api/routes.js';
import { authMiddleware, errorHandler, rateLimiter } from './api/middleware.js';
import { PluginManager } from './plugins/index.js';

export interface Server {
  app: Hono<ApiEnv>;
  plugins: PluginManager;
}

export function createServer(platform: Platform): Server {
  const app = new Hono<ApiEnv>();
  app.onError(errorHandler());

  // security headers for everything
  app.use('*', async (c, next) => {
    await next();
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'SAMEORIGIN');
    c.header('referrer-policy', 'same-origin');
  });

  const api = createApi(platform);
  const apiRoot = new Hono<ApiEnv>().basePath('/api');
  apiRoot.onError(errorHandler());
  apiRoot.use('*', authMiddleware(platform));
  apiRoot.use('*', rateLimiter({ windowMs: platform.config.rateLimit.windowMs, max: platform.config.rateLimit.max }));
  apiRoot.route('/', api);
  // Dynamic dispatch (not a route-copy) so plugin routes registered AFTER boot
  // are still reachable.
  app.all('/api/*', (c) => apiRoot.fetch(c.req.raw));

  const plugins = new PluginManager(platform, apiRoot);

  // Admin SPA static hosting (single origin, no CORS needed)
  const publicDir = path.join(process.cwd(), 'public');
  app.get('/assets/*', async (c) => {
    const rel = c.req.path.replace(/^\/+/, '').replace(/\.\./g, '');
    const file = path.join(publicDir, rel);
    if (!file.startsWith(publicDir) || !fs.existsSync(file)) return c.notFound();
    const ext = path.extname(file);
    const mime = ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    c.header('content-type', mime);
    c.header('cache-control', 'public, max-age=300');
    return c.body(new Uint8Array(fs.readFileSync(file)));
  });

  // SPA fallback: everything that is not /api or /assets serves the admin shell
  app.get('*', (c) => {
    const indexFile = path.join(publicDir, 'index.html');
    if (!fs.existsSync(indexFile)) {
      return c.text('Admin UI not built. Run: npm run build:admin', 503);
    }
    c.header('content-type', 'text/html; charset=utf-8');
    return c.body(fs.readFileSync(indexFile, 'utf8'));
  });

  return { app, plugins };
}
