/**
 * API middleware — auth resolution, rate limiting, error mapping.
 * The single places these concerns exist.
 */
import type { Context, Next, MiddlewareHandler } from 'hono';
import { AppError, RateLimitError, UnauthorizedError } from '../kernel/errors.js';
import { PUBLIC } from '../access/index.js';
import type { Platform, ApiEnv } from './context.js';
import { ZodError } from 'zod';

export function authMiddleware(platform: Platform): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization');
    const cookieToken = getCookie(c, 'cmc_session');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : cookieToken;
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    if (token) {
      // invalid/expired tokens resolve to PUBLIC rather than failing the request;
      // protected handlers enforce authentication explicitly.
      try {
        c.set('accountability', platform.auth.resolveToken(token, ip));
        c.set('sessionToken', token);
      } catch {
        c.set('accountability', { ...PUBLIC, ip });
        c.set('sessionToken', null);
      }
    } else {
      c.set('accountability', { ...PUBLIC, ip });
      c.set('sessionToken', null);
    }
    await next();
  };
}

export function requireAuth(c: Context<ApiEnv>): void {
  if (!c.get('accountability').userId) throw new UnauthorizedError();
}

/** Fixed-window in-memory rate limiter (single-process; driver-swappable later). */
export function rateLimiter(opts: { windowMs: number; max: number; keyPrefix?: string }): MiddlewareHandler<ApiEnv> {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const prefix = opts.keyPrefix ?? 'g';
  return async (c, next) => {
    const acc = c.get('accountability');
    const key = `${prefix}:${acc?.userId ?? c.req.header('x-forwarded-for') ?? 'anon'}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
    }
    c.header('x-ratelimit-limit', String(opts.max));
    c.header('x-ratelimit-remaining', String(Math.max(opts.max - entry.count, 0)));
    if (entry.count > opts.max) throw new RateLimitError();
    await next();
  };
}

export function errorHandler() {
  return (err: Error, c: Context) => {
    if (err instanceof AppError) {
      return c.json(err.toJSON(), err.status as 400);
    }
    if (err instanceof ZodError) {
      return c.json(
        { error: { code: 'INVALID_PAYLOAD', message: 'Request validation failed', details: err.issues } },
        400,
      );
    }
    console.error('[unhandled]', err);
    return c.json({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500);
  };
}

function getCookie(c: Context, name: string): string | undefined {
  const cookie = c.req.header('cookie');
  if (!cookie) return undefined;
  const match = cookie.split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
