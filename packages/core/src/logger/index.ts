// Unified logger — structured, leveled, context-aware

import pino from 'pino';

let _logger: pino.Logger | null = null;

export function createLogger(service: string, level = 'info'): pino.Logger {
  _logger = pino({
    name: service,
    level: process.env.LOG_LEVEL || level,
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: true } }
        : undefined,
    redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'secret'],
  });
  return _logger;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    _logger = createLogger('cmc');
  }
  return _logger;
}

export const logger = getLogger;