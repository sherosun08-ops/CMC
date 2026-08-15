# Progress Tracker

Resume point for future sessions. Keep updated after every module.

## Phases
- [x] Phase 0 — environment audit; removed prior mock-based scaffold (failed acceptance criteria)
- [x] Phase 1 — repository intelligence (docs/ANALYSIS.md)
- [x] Phase 2 — domain model (docs/DOMAIN-MODEL.md)
- [x] Phase 3 — architecture + ADRs (docs/ARCHITECTURE.md, docs/decisions/)
- [x] Phase 4 — implementation (order below)
- [x] Phase 5 — full test pass + final architecture audit

## Implementation order (each: implement → test → audit → next)
1. [x] kernel: config, errors, logger, event bus, db adapter (+tx), filter compiler
2. [x] schema: field-type registry, collection registry, DDL sync, system collections
3. [x] access: policy engine
4. [x] engine: records service (CRUD pipeline, revisions, activity, hooks)
5. [x] auth: passwords (scrypt), sessions, api keys, middleware
6. [x] jobs: DB queue + scheduler
7. [x] files: local storage driver + upload/download
8. [x] search: FTS5 driver + event subscribers
9. [x] webhooks + notifications + settings
10. [x] content: scheduled publishing, blocks field + render
11. [x] commerce: pricing, inventory ledger, cart, checkout, orders, discounts
12. [x] api: routers + OpenAPI + rate limiting
13. [x] plugins: loader + context; proven with plugins/product-reviews
14. [x] admin SPA: design system, schema-driven browser/form, dashboard, media, schema designer, activity, settings, order detail, notifications, global search
15. [x] seed + docker + README
16. [x] final audit (see below)

## Testing status
66 tests green across 5 files (engine 21, api 14, platform 12, commerce 11, auth 8).
`tsc --noEmit` clean. Server boots, seeds, serves admin + API + plugin routes live.

## Final audit results
- Duplication scan: no duplicate exported classes/functions; randomId reuse fixed during
  implementation; job/block/plugin registries actively reject duplicate registrations.
- Raw SQL scan: confined to the sanctioned modules (adapter, registry, engine, auth token
  tables, jobs, search FTS, commerce checkout tx + read models, bootstrap maintenance).
  No router or UI touches the DB.
- Mock scan: zero mock data or placeholder implementations in production code.
- Security: scrypt passwords, hashed tokens/keys at rest, timing-safe compares,
  constant-shape login, identifier allowlisting in filter compiler (injection guard tested),
  HTML escaping in block renderer (XSS tested), href scheme allowlist, upload MIME/size
  limits, storage path traversal guard, HMAC webhooks, rate limiting, secrets never
  serialized (hash fields excluded even for admins).

## Known deferred items
- PostgreSQL adapter (interface in place; ADR-002)
- Redis queue driver (interface in place)
- OAuth/SSO providers (auth designed for pluggable identities; not shipped in v1)
