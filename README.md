# CMC — Composable Management Core

**One unified platform for dynamic data, content, and commerce** — built from scratch as a
single coherent architecture, informed by a deep study of ten reference systems
(Directus, Payload, Filament, Bagisto, Medusa, NocoBase, Strapi, GrapesJS, Refine, Saleor)
without copying any of their code or their shapes.

> One system. One architecture. One domain model. One source of truth.
> One unified experience. Zero unnecessary duplication.

## What makes it one system

Everything — users, files, pages, products, orders, settings, plugin data, and any
collection you define at runtime — is a **record in a collection** managed by one
**Schema Registry** and read/written through one **Data Engine** pipeline:

```
access policy → validation → hooks → SQL → revisions → activity → events
```

There is exactly **one** write path, **one** policy engine (row filters + field allowlists
as data), **one** event pipeline (hooks / subscribers / signed webhooks), **one** job queue,
**one** search index, **one** media system, **one** notification inbox, **one** settings
store, and **one** admin surface that renders every collection from its schema.

## Quick start

```bash
npm install
npm run seed          # demo roles, users, policies, pages, products, an order
npm run build:admin   # bundle the admin SPA
npm run dev           # http://localhost:4000
```

Log in with `admin@cmc.local` / `admin12345` (or `editor@cmc.local` / `editor12345`
to see policy-scoped access). Set `ADMIN_EMAIL`/`ADMIN_PASSWORD` before seeding to override.

### Docker

```bash
CMC_SECRET=$(openssl rand -hex 32) docker compose up --build
```

## Highlights

- **Runtime data modeling** — create collections & fields from the admin ("Data model");
  DDL syncs additively, the API/OpenAPI/admin/search pick them up instantly.
- **Policies as data** — per role × collection × action: row filter (same AST as query
  filters, with `$CURRENT_USER`), field allowlist, server-enforced presets. Public access
  via the reserved `$public` role.
- **Versioning** — snapshots per mutation on versioned collections, restore from the admin;
  scheduled publishing via `publish_at` through the single job queue.
- **Blocks** — the visual-builder data model: a typed component tree stored in a `blocks`
  field, composed in the admin (drag to reorder, nested containers), rendered server-side
  (escaped) for previews and public pages. Works on pages, products, and your collections.
- **Commerce as collections + domain services** — inventory is an append-only ledger;
  checkout is one transaction (price revalidation, stock verification, order snapshot,
  discount consumption); order state machine with automatic restock on cancel/refund.
- **Plugins** — `plugins/<name>/index.ts` gets a typed context: collections, engine hooks,
  events, jobs, routes (`/api/x/<name>`), block types, policies. The shipped
  `product-reviews` plugin demonstrates all of it with zero core changes.
- **API platform** — uniform REST (`/api/records/:collection` + filters/sort/search/
  pagination/bulk/revisions), OpenAPI generated live from the registry, session cookies +
  bearer tokens + API keys, per-user rate limiting, HMAC-signed webhooks with retries.

## Layout

```
src/
  kernel/     config · errors · logger · event bus
  db/         SQLite adapter (swappable) · filter AST → SQL
  schema/     field types · collection registry · DDL sync · system collections
  access/     policy engine
  engine/     records service (THE write path) · hooks
  auth/       scrypt passwords · opaque sessions · API keys
  jobs/       DB-backed queue + scheduler
  files/      storage driver + upload/probe/download
  search/     FTS5 driver, event-fed
  content/    blocks registry/renderer · scheduled publishing
  commerce/   carts · checkout · inventory ledger · discounts · order lifecycle
  platform/   settings · notifications · webhooks
  api/        Hono routers · middleware · OpenAPI
  plugins/    plugin contract + loader
admin/        schema-driven React SPA (design tokens, one browser/form/table)
plugins/      installed plugins (product-reviews example)
tests/        66 unit/integration/API tests (in-memory, hermetic)
docs/         ANALYSIS · DOMAIN-MODEL · ARCHITECTURE · ADRs · PROGRESS
```

## Documentation

- [docs/ANALYSIS.md](docs/ANALYSIS.md) — repository intelligence matrix & capability extraction
- [docs/DOMAIN-MODEL.md](docs/DOMAIN-MODEL.md) — aggregates, invariants, canonical events
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module boundaries & key flows
- [docs/decisions/](docs/decisions/) — ADRs (system shape, stack)

## Tests

```bash
npm test          # 66 tests: engine, access, auth, jobs, search, blocks,
                  # scheduling, files, commerce, full HTTP API, plugin
npm run typecheck
```

## Configuration (env)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | HTTP port |
| `DATABASE_URL` | `./data/cmc.db` | SQLite path (`:memory:` for tests) |
| `STORAGE_ROOT` | `./data/uploads` | local file storage |
| `CMC_SECRET` | dev value | HMAC signing (required in production) |
| `SESSION_TTL` | 7 days | sliding session lifetime (seconds) |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_AUTH_MAX` | 300 / 10 | per window per key |
| `PUBLIC_URL` | `http://localhost:PORT` | absolute links & OpenAPI server |

Scale-up paths are interfaces, not rewrites: PostgreSQL adapter (db), Redis queue driver
(jobs), Meilisearch driver (search), S3 driver (files) — each documented in ADR-002.
