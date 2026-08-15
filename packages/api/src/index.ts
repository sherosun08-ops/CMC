// Unified API package — REST + GraphQL + WebSocket

export { createApiApp } from './rest/app';
export { createGraphQLHandler } from './graphql/handler';
export { createWebSocketServer } from './websocket/server';
export { webhookManager } from './webhooks/manager';
export { apiKeyGuard } from './middleware/api-key';
export { rateLimiter } from './rate-limit/middleware';
export { apiDocsRouter } from './docs/swagger';
export { createRouter } from './rest/router-factory';