/**
 * OpenAPI document — generated from the Schema Registry (single source of truth):
 * documentation always matches the actual collections, zero manual drift.
 */
import type { SchemaRegistry } from '../schema/registry.js';
import type { FieldDef } from '../schema/field-types.js';

const FIELD_TYPE_TO_OPENAPI: Record<string, { type: string; format?: string }> = {
  string: { type: 'string' },
  text: { type: 'string' },
  richtext: { type: 'string' },
  slug: { type: 'string' },
  email: { type: 'string', format: 'email' },
  integer: { type: 'integer' },
  float: { type: 'number' },
  money: { type: 'integer', format: 'minor-units' },
  boolean: { type: 'boolean' },
  datetime: { type: 'string', format: 'date-time' },
  json: { type: 'object' },
  blocks: { type: 'array' },
  relation: { type: 'string', format: 'record-id' },
  hash: { type: 'string' },
};

function fieldSchema(f: FieldDef): Record<string, unknown> {
  const base = FIELD_TYPE_TO_OPENAPI[f.type] ?? { type: 'string' };
  const out: Record<string, unknown> = { ...base };
  const opts = f.options ?? {};
  if (opts.choices) out.enum = opts.choices;
  if (opts.min !== undefined) out.minimum = opts.min;
  if (opts.max !== undefined) out.maximum = opts.max;
  if (opts.maxLength !== undefined) out.maxLength = opts.maxLength;
  if (f.relation) out.description = `References ${f.relation.collection}.id`;
  return out;
}

export function buildOpenApiDocument(registry: SchemaRegistry, publicUrl: string): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  const paths: Record<string, unknown> = {};

  for (const col of registry.list()) {
    const properties: Record<string, unknown> = {
      id: { type: 'string', readOnly: true },
      created_at: { type: 'string', format: 'date-time', readOnly: true },
      updated_at: { type: 'string', format: 'date-time', readOnly: true },
    };
    const required: string[] = [];
    for (const f of col.fields) {
      if (f.hidden || f.type === 'hash') continue;
      properties[f.name] = fieldSchema(f);
      if (f.required) required.push(f.name);
    }
    schemas[col.name] = { type: 'object', properties, ...(required.length ? { required } : {}) };

    const tag = col.label ?? col.name;
    paths[`/api/records/${col.name}`] = {
      get: {
        tags: [tag], summary: `List ${col.name}`,
        parameters: [
          { name: 'filter', in: 'query', schema: { type: 'string' }, description: 'JSON filter AST' },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'e.g. -created_at,title' },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', maximum: 200 } },
          { name: 'locale', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${col.name}` } } } } } } } },
      },
      post: {
        tags: [tag], summary: `Create ${col.name}`,
        requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${col.name}` } } } },
        responses: { '201': { description: 'Created' }, '403': { description: 'Forbidden' }, '422': { description: 'Validation failed' } },
      },
    };
    paths[`/api/records/${col.name}/{id}`] = {
      get: { tags: [tag], summary: `Get one`, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      patch: { tags: [tag], summary: `Update`, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${col.name}` } } } }, responses: { '200': { description: 'OK' } } },
      delete: { tags: [tag], summary: `Delete`, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'OK' } } },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CMC API',
      version: '0.1.0',
      description: 'Unified data, content & commerce platform. Auth: `Authorization: Bearer <session-or-api-key>`.',
    },
    servers: [{ url: publicUrl }],
    components: {
      schemas,
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    },
    security: [{ bearer: [] }],
    paths,
  };
}
