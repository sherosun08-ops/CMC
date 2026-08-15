/**
 * Access module — the ONE authorization gate (ANALYSIS.md §3).
 * Policies are data: (role × collection × action) → { rowFilter, fields, presets }.
 * Evaluated inside the data engine so every consumer passes through it.
 */
import type { Db } from '../db/adapter.js';
import { ForbiddenError } from '../kernel/errors.js';
import { andFilters, type Filter } from '../db/filter.js';

export interface Accountability {
  userId: string | null;
  roleIds: string[];
  admin: boolean;
  ip?: string;
}

/** System/root accountability — used ONLY by trusted internal services. */
export const SYSTEM: Accountability = { userId: null, roleIds: [], admin: true };

export const PUBLIC: Accountability = { userId: null, roleIds: [], admin: false };

export type Action = 'create' | 'read' | 'update' | 'delete';

export interface Permission {
  rowFilter: Filter | null;
  /** null = all fields allowed */
  fields: string[] | null;
  presets: Record<string, unknown> | null;
}

export class AccessService {
  constructor(private db: Db) {}

  /**
   * Resolve effective permission for an actor on collection × action.
   * Multiple policies (across roles) merge permissively: row filters OR-ed,
   * field lists unioned. Throws ForbiddenError when nothing grants access.
   */
  resolve(acc: Accountability, collection: string, action: Action): Permission {
    if (acc.admin) return { rowFilter: null, fields: null, presets: null };

    const roleParams = acc.roleIds.length > 0 ? acc.roleIds : ['__none__'];
    const placeholders = roleParams.map(() => '?').join(', ');
    // Public policies are attached to the reserved role id '$public'.
    const rows = this.db.all(
      `SELECT row_filter, fields, presets FROM policies
       WHERE collection = ? AND action = ? AND (role IN (${placeholders}) OR role = '$public')`,
      [collection, action, ...roleParams],
    );
    if (rows.length === 0) {
      throw new ForbiddenError(`No permission to ${action} on "${collection}"`);
    }

    let rowFilter: Filter | null = null;
    let unrestricted = false;
    let fields: string[] | null = [];
    let allFields = false;
    let presets: Record<string, unknown> | null = null;

    const orParts: Filter[] = [];
    for (const row of rows) {
      const rf = row.row_filter ? (JSON.parse(row.row_filter as string) as Filter) : null;
      if (!rf || Object.keys(rf).length === 0) unrestricted = true;
      else orParts.push(rf);

      const fl = row.fields ? (JSON.parse(row.fields as string) as string[] | null) : null;
      if (!fl) allFields = true;
      else fields = [...new Set([...(fields ?? []), ...fl])];

      const pr = row.presets ? (JSON.parse(row.presets as string) as Record<string, unknown>) : null;
      if (pr) presets = { ...(presets ?? {}), ...pr };
    }
    if (!unrestricted) {
      rowFilter = orParts.length === 1 ? orParts[0] : { _or: orParts };
    }
    return { rowFilter, fields: allFields ? null : fields, presets };
  }

  /** Non-throwing check used by UIs to know what to display. */
  can(acc: Accountability, collection: string, action: Action): boolean {
    try {
      this.resolve(acc, collection, action);
      return true;
    } catch {
      return false;
    }
  }

  /** Merge a caller-supplied filter with the policy row filter. */
  applyRowFilter(perm: Permission, filter: Filter | null | undefined): Filter | null {
    return andFilters(perm.rowFilter, filter ?? undefined);
  }
}

/** Resolve dynamic values in policy presets ("$CURRENT_USER"). */
export function resolvePresets(
  presets: Record<string, unknown> | null,
  acc: Accountability,
): Record<string, unknown> {
  if (!presets) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(presets)) {
    out[k] = v === '$CURRENT_USER' ? acc.userId : v;
  }
  return out;
}
