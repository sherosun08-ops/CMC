# Progress Tracker

Resume point for future sessions. Keep updated after every module.

## Phases
- [x] Phase 0 — environment audit; removed prior mock-based scaffold (failed acceptance criteria)
- [x] Phase 1 — repository intelligence (docs/ANALYSIS.md)
- [x] Phase 2 — domain model (docs/DOMAIN-MODEL.md)
- [x] Phase 3 — architecture + ADRs (docs/ARCHITECTURE.md, docs/decisions/)
- [ ] Phase 4 — implementation (order below)
- [ ] Phase 5 — full test pass + final architecture audit

## Implementation order (each: implement → test → audit → next)
1. [ ] kernel: config, errors, logger, event bus, db adapter (+tx), filter compiler
2. [ ] schema: field-type registry, collection registry, DDL sync, system collections
3. [ ] access: policy engine
4. [ ] engine: records service (CRUD pipeline, revisions, activity, hooks)
5. [ ] auth: passwords (scrypt), sessions, api keys, middleware
6. [ ] jobs: DB queue + scheduler
7. [ ] files: local storage driver + upload/download
8. [ ] search: FTS5 driver + event subscribers
9. [ ] webhooks + notifications + settings
10. [ ] content: scheduled publishing, blocks field + render
11. [ ] commerce: pricing, inventory ledger, cart, checkout, orders, discounts
12. [ ] api: routers + OpenAPI + rate limiting
13. [ ] plugins: loader + context; prove with a real example plugin
14. [ ] admin SPA: design system, schema-driven browser/form, dashboards, module screens
15. [ ] seed + docker + README
16. [ ] final audit (duplication, security, dead code, test coverage of critical paths)

## Testing status
(none yet)

## Known deferred items
- PostgreSQL adapter (interface in place; ADR-002)
- Redis queue driver (interface in place)
- OAuth/SSO providers (auth designed for pluggable identities; not shipped in v1)
