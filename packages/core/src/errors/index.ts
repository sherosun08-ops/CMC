// Unified error handling system

export class CmcError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'CmcError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      status: this.status,
    };
  }
}

export class NotFoundError extends CmcError {
  constructor(resource: string, id?: string) {
    super(404, 'NOT_FOUND', id ? `${resource} with id ${id} not found` : `${resource} not found`);
  }
}

export class ValidationError extends CmcError {
  constructor(details: Record<string, string[]>) {
    super(422, 'VALIDATION_ERROR', 'Validation failed', details);
  }
}

export class UnauthorizedError extends CmcError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends CmcError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends CmcError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class RateLimitError extends CmcError {
  constructor(retryAfter: number) {
    super(429, 'RATE_LIMIT', `Too many requests. Retry after ${retryAfter} seconds`);
  }
}

export class BadRequestError extends CmcError {
  constructor(message: string) {
    super(400, 'BAD_REQUEST', message);
  }
}

export class InternalError extends CmcError {
  constructor(message = 'Internal server error') {
    super(500, 'INTERNAL_ERROR', message);
  }
}

export class DatabaseError extends CmcError {
  constructor(message: string, code = 'DATABASE_ERROR') {
    super(500, code, message);
  }
}