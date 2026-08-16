/** Admin API client — the ONE data access layer of the SPA (relative URLs). */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export class RequestError extends Error {
  constructor(public status: number, public apiError: ApiError) {
    super(apiError.message);
  }
}

async function call<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body && typeof opts.body === 'string') headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { ...opts, headers, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new RequestError(res.status, body.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` });
  }
  return body as T;
}

export interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  relation?: { collection: string };
  options?: { choices?: string[]; min?: number; max?: number; maxLength?: number; [k: string]: unknown };
  localized?: boolean;
  hidden?: boolean;
  ui?: Record<string, unknown>;
}

export interface CollectionDef {
  name: string;
  kind: 'system' | 'user';
  label?: string;
  icon?: string;
  versioned?: boolean;
  titleField?: string;
  fields: FieldDef[];
  internal?: boolean;
}

export interface ListResponse<T = Record<string, unknown>> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export const api = {
  login: (email: string, password: string) =>
    call<{ data: { token: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => call('/auth/logout', { method: 'POST' }),
  me: () => call<{ data: { user: Record<string, unknown>; admin: boolean; permissions: Record<string, string[]> } }>('/auth/me'),

  collections: () => call<{ data: CollectionDef[] }>('/schema/collections'),
  fieldTypes: () => call<{ data: { name: string }[] }>('/schema/field-types'),
  blockTypes: () => call<{ data: { type: string; label: string; props: { name: string; type: string; required?: boolean; relationCollection?: string }[]; container?: boolean }[] }>('/schema/blocks'),
  createCollection: (def: unknown) => call('/schema/collections', { method: 'POST', body: JSON.stringify(def) }),
  updateCollection: (name: string, def: unknown) => call(`/schema/collections/${name}`, { method: 'PATCH', body: JSON.stringify(def) }),
  dropCollection: (name: string) => call(`/schema/collections/${name}`, { method: 'DELETE' }),

  list: (collection: string, params: Record<string, string | number | undefined>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return call<ListResponse>(`/records/${collection}${qs ? `?${qs}` : ''}`);
  },
  getRecord: (collection: string, id: string) => call<{ data: Record<string, unknown> }>(`/records/${collection}/${id}`),
  createRecord: (collection: string, data: unknown) => call<{ data: Record<string, unknown> }>(`/records/${collection}`, { method: 'POST', body: JSON.stringify(data) }),
  updateRecord: (collection: string, id: string, data: unknown) => call<{ data: Record<string, unknown> }>(`/records/${collection}/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRecord: (collection: string, id: string) => call(`/records/${collection}/${id}`, { method: 'DELETE' }),
  bulk: (collection: string, action: string, items: unknown[]) =>
    call(`/records/${collection}/bulk`, { method: 'POST', body: JSON.stringify({ action, items }) }),
  revisions: (collection: string, id: string) => call<{ data: Record<string, unknown>[] }>(`/records/${collection}/${id}/revisions`),
  revert: (collection: string, id: string, revisionId: string) =>
    call(`/records/${collection}/${id}/revert/${revisionId}`, { method: 'POST' }),

  upload: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/files', { method: 'POST', body: form, credentials: 'same-origin' });
    const body = await res.json();
    if (!res.ok) throw new RequestError(res.status, body.error);
    return body as { data: Record<string, unknown> };
  },
  deleteFile: (id: string) => call(`/files/${id}`, { method: 'DELETE' }),

  search: (q: string) => call<{ data: { collection: string; recordId: string; title: string; snippet: string }[] }>(`/search?q=${encodeURIComponent(q)}`),
  activity: (page = 1) => call<ListResponse>(`/activity?page=${page}&limit=50`),
  stats: () => call<{ data: Record<string, any> }>('/system/stats'),
  notifications: () => call<ListResponse>('/notifications'),
  markRead: (id: string) => call(`/notifications/${id}/read`, { method: 'POST' }),

  renderBlocks: (blocks: unknown[]) => call<{ data: { html: string } }>('/content/render', { method: 'POST', body: JSON.stringify({ blocks }) }),

  orderItems: (orderId: string) => call<{ data: Record<string, unknown>[] }>(`/shop/orders/${orderId}/items`),
  transitionOrder: (orderId: string, status: string) =>
    call<{ data: Record<string, unknown> }>(`/shop/orders/${orderId}/transition`, { method: 'POST', body: JSON.stringify({ status }) }),
  stock: (variantId: string) => call<{ data: { stock: number } }>(`/shop/variants/${variantId}/stock`),
  receiveStock: (variantId: string, quantity: number, reason = 'received') =>
    call(`/shop/variants/${variantId}/stock`, { method: 'POST', body: JSON.stringify({ quantity, reason }) }),

  getSetting: (key: string) => call<{ data: { value: unknown } }>(`/settings/${encodeURIComponent(key)}`),
  putSetting: (key: string, value: unknown) => call(`/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ value }) }),
};
