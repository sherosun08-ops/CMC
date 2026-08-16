/**
 * Error system — one error hierarchy for the whole platform.
 * Every error carries an HTTP status and a stable machine code.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details ?? undefined } };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_FAILED', message, 422, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} "${id}" not found` : `${resource} not found`, 404);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super('FORBIDDEN', message, 403);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details);
  }
}

export class InvalidPayloadError extends AppError {
  constructor(message: string, details?: unknown) {
    super('INVALID_PAYLOAD', message, 400, details);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMITED', 'Too many requests, slow down', 429);
  }
}
