# ADR-002: Technology stack

No stack was assumed up front. Choices below follow from the architecture (ADR-001), the
quality attributes required, and the verified execution environment
(Node 22 present; Docker/PostgreSQL/Redis NOT available in the target environment;
SQLite 3.53 with FTS5 and JSON1 verified working).

## Language & runtime — TypeScript on Node 22
- The architecture is I/O-bound (API + admin + jobs). Node's ecosystem quality for this
  domain is the strongest of the candidates (Go: weaker dynamic-schema ergonomics;
  PHP/Laravel: couples us to a framework, contra ADR-001; Python: weaker end-to-end typing
  with a TS admin).
- One language across server, admin, plugins, and tests → one type system for the schema
  contracts (the registry types are shared by API and UI). This is the single biggest
  maintainability win available.

## HTTP — Hono (on @hono/node-server)
- Compared: Express (untyped, legacy middleware model), Fastify (good, heavier plugin
  encapsulation we don't need since the kernel owns composition), Hono (typed handlers,
  tiny, web-standard Request/Response, trivially testable via `app.request()`).
- Hono chosen: typed, fast, zero lock-in, first-class testing without opening sockets.

## Database — SQLite (better-sqlite3) behind a thin adapter
- The verified environment has no PostgreSQL. Shipping a system that cannot run is worse
  than any theoretical preference.
- better-sqlite3 is synchronous → real ACID transactions without connection-pool
  complexity; FTS5 gives production-quality search; JSON1 supports dynamic fields.
- The DDL/query layer is isolated in `src/db/` (adapter + filter compiler). The filter AST
  and DDL sync are deliberately portable; a PostgreSQL adapter is the documented scale-up
  path. No ORM: the Schema Registry IS the model layer — an ORM would be a second,
  competing source of truth.

## Cache / queue — in-process + DB-backed
- No Redis available. Jobs are persisted in a `jobs` table (at-least-once, retries with
  exponential backoff); scheduler is an in-process loop. The queue interface is the
  contract; a Redis driver is a drop-in later.

## Auth tokens — opaque session tokens (hashed at rest) + API keys; no JWT
- JWTs cannot be revoked without a denylist (which reintroduces state). Opaque tokens with
  SHA-256 at rest + sliding expiry are simpler and safer for a first-party admin.
  API keys (hashed, prefixed) serve machine access. Passwords: scrypt via node:crypto
  (no native build deps, OWASP-accepted parameters).

## Admin UI — React 18 SPA, esbuild-bundled, served by the same server
- Compared: Next.js (second server, second routing model, host/origin issues, heavyweight
  for an admin), SPA served by the API (one process, one origin, one deploy unit).
- Design system: hand-rolled CSS design tokens (no utility-framework build step) — a single
  `tokens + components` layer used by every screen.

## Validation — zod at the API edge; field-type validators in the engine
- One validation source: field validators live in the field-type registry (drives API
  validation and admin form rules). zod only validates transport envelopes.

## Testing — vitest (unit/integration) + Hono's `app.request()` for API tests
- In-memory SQLite per test → fast, hermetic, no test infra to install.
