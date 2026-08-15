# Repository Intelligence Matrix

> Phase 1 output. Sources were studied as **engineering references only** — none of their
> code is copied into this system. What was examined: repository structures, package/module
> layouts, service inventories, and selected source files via the GitHub API. What was NOT
> examined: every file line-by-line (the ten repositories total millions of lines; a full
> read is not possible nor necessary — structural analysis + targeted file reads were used).

## Scope of inspection per repository

| Repository | Inspected | Not inspected |
|---|---|---|
| directus/directus | `api/src` full tree, `api/src/services` (70+ services), `api/src/permissions/lib` (policy fetch pipeline), packages layout | Vue app internals, individual test files |
| payloadcms/payload | `packages/payload/src` tree, `fields/config`, `versions/*` (drafts, scheduling, maxVersions), collections/operations layout | richtext-lexical internals, db adapters line-by-line |
| medusajs/medusa | `packages/modules` (36 isolated modules), `packages/core` (workflows-sdk, orchestration, modules-sdk) | admin dashboard internals |
| nocobase/nocobase | `packages/core` (acl, data-source-manager, resourcer, server kernel incl. plugin-manager, pub-sub-manager, audit-manager), plugin catalog (100+ plugins) | client UI engine internals |
| strapi/strapi | `packages/core` (content-manager, content-type-builder, permissions engine `domain/engine` split, review-workflows, data-transfer) | admin React internals |
| saleor/saleor | `saleor/` Django app layout (30 domains), `core` (jwt, pricing, search, tasks), `checkout` (calculations, lock_objects, complete_checkout), `discount` | GraphQL schema files |
| filamentphp/filament | packages layout (schemas, forms, tables, infolists, actions, widgets, panels, support), `support/src` (Authorization, Assets, Components) | Livewire/Blade view layer |
| refinedev/refine | packages layout (core + 30 data providers), `core/src` (hooks/contexts/definitions) | per-provider implementations |
| GrapesJS/grapesjs | `packages/core/src` (module-per-concern editor architecture: dom_components, blocks, pages, data_sources, undo_manager, storage_manager) | canvas rendering internals |
| bagisto/bagisto | Laravel app layout, packages organization | Blade themes |

## Capability matrix

Legend: **P** = problem solved · **S** = strengths · **W** = weaknesses · **V** = verdict for the new system

### 1. Dynamic data modeling (collections defined at runtime)
- Seen in: Directus (`collections`/`fields`/`relations` services), NocoBase (data-source-manager + collection manager), Strapi (content-type-builder writes schema files).
- **P**: users need new entity types without deploys.
- **S**: Directus stores schema *in the database* and syncs DDL — no codegen, instant. NocoBase abstracts multiple data sources behind one collection protocol.
- **W**: Strapi's file-writing approach needs restarts and breaks in immutable deploys. Directus couples some system logic to Knex specifics.
- **V**: **ADOPT & REDESIGN.** A persisted Schema Registry that is the single source of truth for *system and user collections alike*, with automatic, additive DDL sync. No schema files, no codegen, no restart.

### 2. Declarative field system with validation
- Seen in: Payload (field configs with hooks + `validations.ts` + sanitize pipeline), Filament (schema-driven forms/tables from one definition).
- **S**: Payload sanitizes definitions once, then everything (DB, API, admin UI) derives from the same field config. Filament proves one field definition can drive form + table + detail views.
- **W**: Payload's config lives in code — flexible for devs, closed to end-users.
- **V**: **ADOPT & MERGE** with #1: one field-type registry drives DDL, validation, API serialization, OpenAPI, and admin form/table rendering. Zero duplication between backend validation and admin forms.

### 3. Access control
- Seen in: Directus (roles → **policies** → permissions with row-level filters and field allowlists, `fetch-roles-tree` + `fetch-policies` pipeline), Strapi (permissions `domain/engine` split), NocoBase (ACL core), Saleor (permission groups).
- **S**: Directus' policy model is the most expressive: per collection × action, a policy carries a *row filter* (same language as query filters) and a *field allowlist*. Permissions become data, editable in the admin.
- **W**: Multiple systems bolt on a second authorization path for custom endpoints (drift risk).
- **V**: **ADOPT.** One policy engine, evaluated inside the single data engine so *every* consumer (REST, admin, plugins, domain services) passes through the same gate. Row filters use the same filter AST as queries.

### 4. Versioning / drafts / scheduled publishing
- Seen in: Payload (`versions/` — drafts, `enforceMaxVersions`, `schedule/`), Directus (revisions + content versions), Strapi (draft/publish + releases).
- **S**: Payload's model: versions are snapshots in a side table; drafts are just versions with status; scheduling is a queued job that flips status.
- **V**: **ADOPT.** One revisions store (doubles as audit trail detail), `versioned` flag per collection, `publish_at` handled by the single job scheduler.

### 5. Commerce domain
- Seen in: Medusa (isolated modules: cart, order, pricing, promotion, inventory, payment, fulfillment; workflows for checkout), Saleor (checkout `complete_checkout` + `lock_objects` for concurrency, discount events, channel model), Bagisto (classic monolithic commerce packages).
- **S**: Medusa's separation of *inventory as a ledger* and *pricing as a resolver* is clean. Saleor's checkout locking prevents oversell. Both treat cart → order as a transactional transformation.
- **W**: Medusa's module isolation costs heavy orchestration machinery (link-modules); overkill at this scale. Bagisto couples commerce to the framework.
- **V**: **ADOPT IDEAS, SIMPLIFY.** Commerce entities are *system collections in the same data engine* (products, variants, carts, orders, discounts, inventory movements). Domain services (cart, checkout, pricing, inventory) add transactional logic on top. Inventory is an append-only ledger. Checkout is a DB transaction with stock verification. No parallel store.

### 6. Visual building
- Seen in: GrapesJS (component tree model separated from rendering; blocks, pages, data_sources modules), Payload (blocks field), Directus visual-editing.
- **S**: GrapesJS shows the editor should manipulate a *serializable component tree*, not HTML. Payload shows blocks-as-field integrates building into the content model.
- **W**: A full free-form canvas editor (GrapesJS-class) is an enormous standalone product; embedding one would violate the "one architecture" rule.
- **V**: **ADOPT THE MODEL, NOT THE EDITOR.** A `blocks` field type stores an ordered typed component tree (JSON). The admin ships a block composer (add/reorder/edit/preview). Server renders blocks for previews. It is a native field type — page building lives inside the same domain model.

### 7. Admin UI generation
- Seen in: Refine (headless resource hooks over data providers), Filament (panels built from schemas), Directus (app driven by collection metadata).
- **S**: Refine proves the UI should consume an abstract data contract, so *one* browser/form/table component serves every resource.
- **V**: **ADOPT.** The admin is one schema-driven SPA: one CollectionBrowser, one RecordForm, one Table — configured entirely by the Schema Registry over the REST API. No per-entity page duplication.

### 8. Plugin architecture
- Seen in: NocoBase (everything-is-a-plugin microkernel; plugin lifecycle: load/install/enable/disable; plugins get kernel services), Payload (plugins = config transformers), Filament (panel plugins), Medusa (modules + providers).
- **S**: NocoBase's contract — a plugin receives the kernel context and registers collections, routes, hooks, jobs — is the most complete without forking the core.
- **W**: Payload's "config transformer" plugins can't add runtime behavior cleanly.
- **V**: **ADOPT.** Formal `Plugin` contract: `register(ctx)` receives typed APIs (collections, hooks, routes, jobs, permissions, search). Core modules use the *same* extension points as third-party plugins — the contract is proven by the core itself.

### 9. Events / hooks / webhooks
- Seen in: Directus (emitter + flows), Payload (field/collection hooks), Medusa (event-bus module, subscribers), Saleor (webhooks per domain event).
- **V**: **ADOPT.** One typed event bus. Data engine emits canonical events (`records.create` …). Hooks are synchronous interceptors (filter/action, Directus-style). Webhooks are event subscribers delivered by the job queue with retries. One pipeline, three consumption modes.

### 10. Search
- Seen in: Directus (per-driver search), Saleor (Postgres full-text + tasks), Medusa (search module).
- **V**: **ADOPT.** One search service with a driver interface; default driver = SQLite FTS5, kept in sync by data-engine events. Swappable (Meilisearch, PG-FTS) without touching consumers.

### 11. Files / media
- Seen in: Directus (storage drivers per cloud + assets transform service), Payload (uploads + storage adapters), Strapi (upload plugin).
- **V**: **ADOPT.** One `files` system collection + storage-driver interface (local driver shipped). Every module references files by id — no second media path.

### 12. Background jobs & scheduling
- Seen in: Payload (queues + scheduled publish jobs), Saleor (celery tasks/schedulers), NocoBase (async task manager, cron).
- **V**: **ADOPT.** One persistent job queue (DB-backed, at-least-once, retry with backoff) + cron-like scheduler. Used by webhooks, scheduled publishing, cart cleanup — never a second queue.

### 13. Audit / activity
- Seen in: Directus (activity + revisions), NocoBase (audit-manager plugin), Saleor (order events).
- **V**: **ADOPT.** One activity stream written by the data engine for every mutation; revision snapshots attach to activity entries.

## Duplication resolution (cross-source)

| Capability duplicated across sources | Single implementation in this system |
|---|---|
| Users vs Customers vs Admins (Saleor/Medusa/Bagisto each split them) | One `users` collection; "customer" and "admin" are roles. Commerce references `user_id`. |
| CMS pages vs commerce CMS (Bagisto has its own CMS; Saleor has `page`) | One data engine; `pages` is just a collection with a `blocks` field. |
| Product content vs CMS content (Medusa/Saleor duplicate rich content for products) | Products are collections — they get rich fields, media, SEO, localization from the same engine. |
| Permissions for API vs permissions for admin (Strapi has two systems) | One policy engine; admin is just an API client. |
| Search per module | One search service, event-fed. |
| Media per module (Bagisto product images vs CMS media) | One `files` collection. |
| Notifications per module | One notifications service (in-app + event-driven). |
| Settings scattered (env + DB + files across sources) | One settings service (typed, DB-backed) + env for infrastructure secrets only. |
