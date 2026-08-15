import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../strategies/jwt';
import { UnauthorizedError, ForbiddenError } from '@cmc/core';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      userId?: string;
      isAuthenticated?: boolean;
      apiKey?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    // Allow public routes through — individual handlers can require auth
    req.isAuthenticated = false;
    return next();
  }

  try {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      req.user = payload;
      req.userId = payload.sub;
      req.isAuthenticated = true;
    } else if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.substring(7);
      req.apiKey = apiKey;
      req.isAuthenticated = true;
      // API key user resolution happens in API key middleware
    }
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.isAuthenticated) {
    return next(new UnauthorizedError('Authentication required'));
  }
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  // Already set by authenticate middleware, just pass through
  next();
}