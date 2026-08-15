/**
 * Entrypoint — boot the platform, load plugins, start HTTP + job worker.
 */
import { serve } from '@hono/node-server';
import { createPlatform } from './bootstrap.js';
import { createServer } from './server.js';
import { loadInstalledPlugins } from './plugins/loader.js';

async function main() {
  const platform = createPlatform();
  const { app, plugins } = createServer(platform);

  await loadInstalledPlugins(plugins, platform.logger);

  platform.jobs.start(1000);

  serve({ fetch: app.fetch, hostname: platform.config.host, port: platform.config.port }, (info) => {
    platform.logger.info('CMC is running', {
      url: `http://${info.address}:${info.port}`,
      admin: '/',
      api: '/api',
      openapi: '/api/openapi.json',
    });
  });

  const shutdown = () => {
    platform.logger.info('shutting down');
    platform.jobs.stop();
    platform.db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
