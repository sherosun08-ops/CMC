/**
 * Logger — one structured logger for the whole platform.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

export function createLogger(scope: string, minLevel: LogLevel = 'info'): Logger {
  const min = LEVELS[minLevel];
  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[level] < min) return;
    const line = {
      t: new Date().toISOString(),
      level,
      scope,
      msg,
      ...(meta && Object.keys(meta).length ? { meta } : {}),
    };
    const out = JSON.stringify(line);
    if (level === 'error') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  };
  return {
    debug: (m, meta) => write('debug', m, meta),
    info: (m, meta) => write('info', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    error: (m, meta) => write('error', m, meta),
    child: (sub) => createLogger(`${scope}:${sub}`, minLevel),
  };
}
