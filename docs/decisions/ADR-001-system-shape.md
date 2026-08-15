# ADR-001: System shape — modular monolith around one data engine

## Problem
Ten reference systems solve overlapping problems (dynamic data, content, commerce, admin,
building, extensibility). The new system must be ONE system, not ten glued ones.

## Options
1. **Microservices / isolated modules with orchestration** (Medusa-style): strong isolation,
   but requires link-modules/orchestration machinery, duplicates persistence concerns, and
   at this scale multiplies operational cost for zero benefit.
2. **Framework-coupled monolith** (Bagisto-style): fast to build, but capabilities are baked
   into the framework and end-user schema changes need deploys.
3. **Modular monolith around a runtime Schema Registry + single Data Engine**
   (synthesis of Directus + NocoBase + Payload): every entity — system or user-defined —
   is a collection in one registry; one records service enforces validation, access policy,
   revisions, events, search indexing, and audit for ALL reads/writes. Domain modules
   (commerce, content) add services on top but never bypass the engine. Plugins use the
   same extension points as core modules.

## Decision
Option 3.

## Why
- It is the only shape that makes "Single Source of Truth" structurally enforced instead of
  a convention: there is exactly one write path.
- The admin UI collapses to one schema-driven surface (Refine/Filament insight) — zero
  duplicated CRUD pages.
- Extensibility comes free: a plugin registering a collection instantly gets API, admin UI,
  permissions, search, audit, revisions.

## Consequences
- Domain services must express transactional logic through the engine + DB transactions.
- A future scale-out path is extraction along module seams (modules communicate via the
  event bus and service interfaces, not shared internals).

## Rejected
Options 1 and 2, for the reasons above.
