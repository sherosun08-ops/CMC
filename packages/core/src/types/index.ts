// Core shared types for the unified CMC system

export type UUID = string;

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  [field: string]: string | number | boolean | string[] | FilterParams;
}

export interface QueryParams extends PaginationParams, SortParams {
  filter?: FilterParams;
  search?: string;
  locale?: string;
  fields?: string[];
  include?: string[];
}

export interface ApiResponse<T = unknown> {
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
  status: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type Status = 'draft' | 'published' | 'archived' | 'pending' | 'active' | 'inactive';

export interface Localeable {
  locale: string;
}

export interface Timestampable {
  createdAt: Date;
  updatedAt: Date;
}

export interface SoftDeletable {
  deletedAt?: Date;
}

export interface Authorable {
  createdById?: string;
}

export type Permission = {
  action: 'create' | 'read' | 'update' | 'delete' | 'publish' | 'administer';
  resource: string;
  fields?: string[];
  filter?: Record<string, unknown>;
};

export type AuthProvider = 'email' | 'google' | 'github' | 'apple' | 'sso';

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface EventPayload {
  event: string;
  data: Record<string, unknown>;
  userId?: string;
  ipAddress?: string;
  timestamp: Date;
}

export type EventName =
  | 'content.created'
  | 'content.updated'
  | 'content.deleted'
  | 'content.published'
  | 'content.unpublished'
  | 'media.created'
  | 'media.deleted'
  | 'order.created'
  | 'order.updated'
  | 'order.completed'
  | 'order.cancelled'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'user.created'
  | 'user.login'
  | 'user.logout'
  | 'plugin.installed'
  | 'plugin.uninstalled'
  | 'plugin.enabled'
  | 'plugin.disabled';

export type FieldType = 'TEXT' | 'TEXTAREA' | 'RICH_TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME' | 'TIME' | 'ENUM' | 'JSON' | 'RELATION' | 'MEDIA' | 'BLOCKS' | 'SLUG' | 'EMAIL' | 'URL' | 'COLOR' | 'CODE' | 'PASSWORD' | 'RATING';