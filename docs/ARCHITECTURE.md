# Architecture

One deployable unit: HTTP server + admin SPA + job worker in a single Node process
(worker separable later; modules communicate only via interfaces + event bus).

```
┌─────────────────────────────────────────────────────────────────┐
│  ADMIN SPA (React, schema-driven; one CollectionBrowser,        │
│  one RecordForm, one Table — configured by /api/schema)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST /api/* (session or API key)
┌──────────────────────────▼──────────────────────────────────────┐
│  HTTP LAYER (Hono)                                              │
│  auth middleware → rate limiter → routers (thin: parse,         │
│  delegate, serialize; zero business logic in handlers)          │
├─────────────────────────────────────────────────────────────────┤
│  DOMAIN SERVICES                                                │
│  auth · users/roles/policies · files · settings · notifications │
│  commerce: cart · checkout · pricing · inventory · orders       │
│  content: publish scheduling · blocks render                    │
│     │  all reads/writes go through ↓ (no exceptions)            │
├─────▼───────────────────────────────────────────────────────────┤
│  DATA ENGINE (the single write path)                            │
│  access policy → field validation → before-hooks → SQL          │
│  → revisions → activity → after-hooks → events                  │
│  Schema Registry (persisted) + Field-Type Registry + Filter AST │
│  → compiled to SQL; DDL sync (additive)                         │
├─────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE (single instances)                              │
│  db adapter (SQLite; swappable) · event bus · job queue (DB)    │
│  scheduler · search (FTS5 driver) · storage driver (local)      │
│  logger · errors · config                                       │
└─────────────────────────────────────────────────────────────────┘
        ▲ plugins register collections/hooks/routes/jobs/permissions
          through the same PluginContext the core modules use
```

## Module boundaries
| Module | Owns | May call |
|---|---|---|
| `db` | connection, tx, DDL sync, filter→SQL | — |
| `schema` | collection/field registry, field types | db |
| `access` | policy evaluation | schema |
| `engine` | records CRUD pipeline, revisions, activity | db, schema, access, events, hooks |
| `auth` | sessions, api keys, login, mfa-ready | engine (users), db (token tables) |
| `files` | upload, storage drivers, image metadata | engine |
| `commerce` | cart/checkout/pricing/inventory/orders | engine, db(tx), events |
| `content` | scheduled publish, blocks render | engine, jobs |
| `search` | index + query (driver) | events, db |
| `jobs` | queue, scheduler, handlers registry | db, events |
| `webhooks` | subscriptions, signed delivery | events, jobs |
| `notifications` | inbox records, subscribers | engine, events |
| `api` | HTTP routers, OpenAPI doc | domain services only |
| `plugins` | loader + PluginContext | all public contracts |

Forbidden: routers touching db directly; any module writing records except via engine;
any second implementation of auth/files/search/queue/settings.

## Key flows
- **Request**: token → session/apikey lookup → accountability{user,roles,admin} →
  router → service → engine(policy→validate→hooks→sql→revision→activity→events) → response.
- **Checkout**: one DB transaction: revalidate prices → check stock via ledger SUM →
  write negative movements → create order+items snapshot → clear cart → commit → emit
  `orders.placed` → subscribers (notification, webhook, search) run outside the tx.
- **Publish scheduling**: record saved with `publish_at` → engine after-hook enqueues job →
  scheduler flips status at time T → normal engine update (so events/webhooks/audit fire).
- **Plugin**: `register(ctx)` may add collections (registry + DDL sync), hooks, routes
  (namespaced `/api/x/<plugin>`), job handlers, event subscribers, permissions.
