import 'dotenv/config';
import http from 'http';
import { createApiApp } from '@cmc/api';
import { createWebSocketServer } from '@cmc/api';
import { webhookManager } from '@cmc/api';
import { createLogger } from '@cmc/core';

const logger = createLogger('cmc-api');
const PORT = process.env.PORT || 4000;

async function main() {
  const app = createApiApp();
  const httpServer = http.createServer(app);

  // WebSocket
  const io = createWebSocketServer(httpServer);
  logger.info('WebSocket server initialized');

  // Webhooks
  await webhookManager.init();
  logger.info('Webhook manager initialized');

  httpServer.listen(PORT, () => {
    logger.info(`⚡ Unified CMC API running on http://0.0.0.0:${PORT}`);
    logger.info(`📚 API Documentation: http://0.0.0.0:${PORT}/api/docs`);
    logger.info(`📡 GraphQL: http://0.0.0.0:${PORT}/api/graphql`);
    logger.info(`❤️  Health: http://0.0.0.0:${PORT}/api/health`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});