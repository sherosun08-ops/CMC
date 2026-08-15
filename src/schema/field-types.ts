/**
 * Field-Type Registry — ONE definition per field type drives:
 *   - column DDL
 *   - validation (server-side; the admin reads the same rules)
 *   - serialization to/from storage
 *   - filterability / searchability / sortability
 * This is the anti-duplication keystone: backend validation and admin form
 * behavior derive from the same contract (see ANALYSIS.md §2).
 */
import { ValidationError } from '../kernel/errors.js';

export interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  /** For `relation` type: target collection. */
  relation?: { collection: string; onDelete?: 'cascade' | 'set null' | 'restrict' };
  /** Validation options interpreted per type (min, max, pattern, choices...). */
  options?: Record<string, unknown>;
  /** Store per-locale values in the translations table. */
  localized?: boolean;
  /** Hide from non-admin API output (e.g. password). */
  hidden?: boolean;
  /** UI hints for admin rendering — never affects server behavior. */
  ui?: Record<string, unknown>;
}

export interface FieldType {
  name: string;
  sqlType: string;
  /** validate + normalize an input value; throw ValidationError on failure. */
  cast(value: unknown, field: FieldDef): unknown;
  /** convert DB value to API value */
  fromDb?(value: unknown, field: FieldDef): unknown;
  searchable?: boolean;
  sortable?: boolean;
}

function num(value: unknown, field: FieldDef, integer: boolean): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || Number.isNaN(n)) {
    throw new ValidationError(`Field "${field.name}" must be a number`);
  }
  if (integer && !Number.isInteger(n)) {
    throw new ValidationError(`Field "${field.name}" must be an integer`);
  }
  const { min, max } = (field.options ?? {}) as { min?: number; max?: number };
  if (min !== undefined && n < min) throw new ValidationError(`Field "${field.name}" must be >= ${min}`);
  if (max !== undefined && n > max) throw new ValidationError(`Field "${field.name}" must be <= ${max}`);
  return n;
}

function str(value: unknown, field: FieldDef): string {
  if (typeof value !== 'string') throw new ValidationError(`Field "${field.name}" must be a string`);
  const { minLength, maxLength, pattern, choices } = (field.options ?? {}) as {
    minLength?: number; maxLength?: number; pattern?: string; choices?: string[];
  };
  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(`Field "${field.name}" must have at least ${minLength} characters`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`Field "${field.name}" must have at most ${maxLength} characters`);
  }
  if (pattern && !new RegExp(pattern).test(value)) {
    throw new ValidationError(`Field "${field.name}" has invalid format`);
  }
  if (choices && choices.length > 0 && !choices.includes(value)) {
    throw new ValidationError(`Field "${field.name}" must be one of: ${choices.join(', ')}`);
  }
  return value;
}

const types: Record<string, FieldType> = {
  string: { name: 'string', sqlType: 'TEXT', searchable: true, sortable: true, cast: (v, f) => str(v, f) },
  text: { name: 'text', sqlType: 'TEXT', searchable: true, sortable: false, cast: (v, f) => str(v, f) },
  richtext: { name: 'richtext', sqlType: 'TEXT', searchable: true, cast: (v, f) => str(v, f) },
  slug: {
    name: 'slug', sqlType: 'TEXT', sortable: true,
    cast: (v, f) => {
      const s = str(v, f);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) {
        throw new ValidationError(`Field "${f.name}" must be a valid slug (lowercase, hyphens)`);
      }
      return s;
    },
  },
  email: {
    name: 'email', sqlType: 'TEXT', sortable: true,
    cast: (v, f) => {
      const s = str(v, f).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
        throw new ValidationError(`Field "${f.name}" must be a valid email`);
      }
      return s;
    },
  },
  integer: { name: 'integer', sqlType: 'INTEGER', sortable: true, cast: (v, f) => num(v, f, true) },
  float: { name: 'float', sqlType: 'REAL', sortable: true, cast: (v, f) => num(v, f, false) },
  /** Money is ALWAYS integer minor units (cents). */
  money: {
    name: 'money', sqlType: 'INTEGER', sortable: true,
    cast: (v, f) => {
      const n = num(v, f, true);
      if (n < 0 && !(f.options as { allowNegative?: boolean } | undefined)?.allowNegative) {
        throw new ValidationError(`Field "${f.name}" cannot be negative`);
      }
      return n;
    },
  },
  boolean: {
    name: 'boolean', sqlType: 'INTEGER', sortable: true,
    cast: (v, f) => {
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v === 0 || v === 1) return v;
      if (v === 'true') return 1;
      if (v === 'false') return 0;
      throw new ValidationError(`Field "${f.name}" must be a boolean`);
    },
    fromDb: (v) => v === 1 || v === true,
  },
  datetime: {
    name: 'datetime', sqlType: 'TEXT', sortable: true,
    cast: (v, f) => {
      if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) {
        throw new ValidationError(`Field "${f.name}" must be an ISO 8601 datetime`);
      }
      return new Date(v).toISOString();
    },
  },
  json: {
    name: 'json', sqlType: 'TEXT',
    cast: (v, f) => {
      try {
        return JSON.stringify(v);
      } catch {
        throw new ValidationError(`Field "${f.name}" must be JSON-serializable`);
      }
    },
    fromDb: (v) => (typeof v === 'string' && v !== '' ? JSON.parse(v) : v),
  },
  /**
   * blocks — the visual-builder field type (ANALYSIS.md §6): an ordered tree of
   * typed components. Validation checks structure; block types are validated
   * against the blocks registry by the content module's hook.
   */
  blocks: {
    name: 'blocks', sqlType: 'TEXT', searchable: false,
    cast: (v, f) => {
      if (!Array.isArray(v)) throw new ValidationError(`Field "${f.name}" must be an array of blocks`);
      const check = (list: unknown[], depth: number) => {
        if (depth > 6) throw new ValidationError(`Field "${f.name}": blocks nested too deeply`);
        for (const b of list) {
          if (b === null || typeof b !== 'object' || Array.isArray(b)) {
            throw new ValidationError(`Field "${f.name}": each block must be an object`);
          }
          const block = b as Record<string, unknown>;
          if (typeof block.type !== 'string' || !block.type) {
            throw new ValidationError(`Field "${f.name}": block missing "type"`);
          }
          if (block.children !== undefined) {
            if (!Array.isArray(block.children)) {
              throw new ValidationError(`Field "${f.name}": block children must be an array`);
            }
            check(block.children, depth + 1);
          }
        }
      };
      check(v, 0);
      return JSON.stringify(v);
    },
    fromDb: (v) => (typeof v === 'string' && v !== '' ? JSON.parse(v) : []),
  },
  relation: {
    name: 'relation', sqlType: 'TEXT', sortable: true,
    cast: (v, f) => {
      if (typeof v !== 'string' || !v) {
        throw new ValidationError(`Field "${f.name}" must be a record id`);
      }
      return v;
    },
  },
  /** hash — stored value is opaque; input is passed through (hashing done by auth service). */
  hash: { name: 'hash', sqlType: 'TEXT', cast: (v) => v },
};

export function getFieldType(name: string): FieldType {
  const t = types[name];
  if (!t) throw new ValidationError(`Unknown field type: ${name}`);
  return t;
}

export function listFieldTypes(): FieldType[] {
  return Object.values(types);
}
