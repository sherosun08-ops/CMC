/**
 * Filter AST → SQL compiler.
 * ONE filter language used everywhere: API query filters, policy row filters,
 * hook conditions. This is what makes "permissions are data" possible — a policy
 * row filter is just another AST node AND-ed onto the query.
 *
 * Shape (JSON):
 *   { "status": { "_eq": "published" } }
 *   { "_and": [ {...}, {...} ] }
 *   { "price": { "_between": [100, 200] } }
 * Dynamic values: "$CURRENT_USER" resolves to the acting user id.
 */
import { InvalidPayloadError } from '../kernel/errors.js';
import { ident } from './adapter.js';

export type Filter = Record<string, unknown>;

export interface FilterContext {
  /** column names allowed in filters (validated against the registry) */
  columns: Set<string>;
  /** value for $CURRENT_USER */
  userId?: string | null;
  /** table alias prefix, e.g. "t" -> t."status" */
  alias?: string;
}

const OPS: Record<string, (col: string, val: unknown, push: (v: unknown) => string) => string> = {
  _eq: (c, v, p) => (v === null ? `${c} IS NULL` : `${c} = ${p(v)}`),
  _neq: (c, v, p) => (v === null ? `${c} IS NOT NULL` : `${c} != ${p(v)}`),
  _gt: (c, v, p) => `${c} > ${p(v)}`,
  _gte: (c, v, p) => `${c} >= ${p(v)}`,
  _lt: (c, v, p) => `${c} < ${p(v)}`,
  _lte: (c, v, p) => `${c} <= ${p(v)}`,
  _in: (c, v, p) => {
    const arr = asArray(v, '_in');
    if (arr.length === 0) return '0=1';
    return `${c} IN (${arr.map(p).join(', ')})`;
  },
  _nin: (c, v, p) => {
    const arr = asArray(v, '_nin');
    if (arr.length === 0) return '1=1';
    return `${c} NOT IN (${arr.map(p).join(', ')})`;
  },
  _contains: (c, v, p) => `${c} LIKE ${p(`%${escapeLike(String(v))}%`)} ESCAPE '\\'`,
  _ncontains: (c, v, p) => `${c} NOT LIKE ${p(`%${escapeLike(String(v))}%`)} ESCAPE '\\'`,
  _starts_with: (c, v, p) => `${c} LIKE ${p(`${escapeLike(String(v))}%`)} ESCAPE '\\'`,
  _ends_with: (c, v, p) => `${c} LIKE ${p(`%${escapeLike(String(v))}`)} ESCAPE '\\'`,
  _between: (c, v, p) => {
    const arr = asArray(v, '_between');
    if (arr.length !== 2) throw new InvalidPayloadError('_between expects [min, max]');
    return `${c} BETWEEN ${p(arr[0])} AND ${p(arr[1])}`;
  },
  _null: (c, v) => (v ? `${c} IS NULL` : `${c} IS NOT NULL`),
  _nnull: (c, v) => (v ? `${c} IS NOT NULL` : `${c} IS NULL`),
};

function asArray(v: unknown, op: string): unknown[] {
  if (!Array.isArray(v)) throw new InvalidPayloadError(`${op} expects an array`);
  return v;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function compileFilter(filter: Filter, ctx: FilterContext): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const push = (v: unknown) => {
    params.push(resolveDynamic(v, ctx));
    return '?';
  };

  const walk = (node: unknown, depth: number): string => {
    if (depth > 12) throw new InvalidPayloadError('Filter too deeply nested');
    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      throw new InvalidPayloadError('Filter node must be an object');
    }
    const clauses: string[] = [];
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '_and' || key === '_or') {
        const list = asArray(value, key);
        if (list.length === 0) continue;
        const parts = list.map((n) => walk(n, depth + 1));
        clauses.push(`(${parts.join(key === '_and' ? ' AND ' : ' OR ')})`);
      } else if (key === '_not') {
        clauses.push(`NOT (${walk(value, depth + 1)})`);
      } else {
        // field condition
        if (!ctx.columns.has(key)) {
          throw new InvalidPayloadError(`Unknown filter field: ${key}`);
        }
        const col = ctx.alias ? `${ident(ctx.alias)}.${ident(key)}` : ident(key);
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [op, opVal] of Object.entries(value as Record<string, unknown>)) {
            const fn = OPS[op];
            if (!fn) throw new InvalidPayloadError(`Unknown filter operator: ${op}`);
            clauses.push(fn(col, resolveDynamicShallow(opVal, ctx), push));
          }
        } else {
          // shorthand { field: value } => _eq
          clauses.push(OPS._eq(col, resolveDynamicShallow(value, ctx), push));
        }
      }
    }
    if (clauses.length === 0) return '1=1';
    return clauses.join(' AND ');
  };

  const sql = walk(filter, 0);
  return { sql, params };
}

function resolveDynamic(v: unknown, ctx: FilterContext): unknown {
  if (v === '$CURRENT_USER') return ctx.userId ?? null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

function resolveDynamicShallow(v: unknown, ctx: FilterContext): unknown {
  if (Array.isArray(v)) return v.map((x) => resolveDynamic(x, ctx));
  return resolveDynamic(v, ctx);
}

/** AND-combine several filters (used to merge query filter + policy row filter). */
export function andFilters(...filters: (Filter | null | undefined)[]): Filter | null {
  const list = filters.filter((f): f is Filter => !!f && Object.keys(f).length > 0);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  return { _and: list };
}
