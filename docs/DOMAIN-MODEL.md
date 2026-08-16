# Domain Model

Designed before implementation. Nothing here is copied from any reference schema.

## Core principle
**Everything is a record in a collection.** Collections are defined in the Schema Registry
(itself persisted). System collections (users, files, orders …) and user-created
collections are the same kind of thing and flow through the same engine.

## Bounded contexts & their aggregates

### 1. Schema (the meta-domain)
- **Collection** — name, kind (`system`|`user`), options (versioned, localized, timestamps,
  audit), field list. Aggregate root for its Fields.
- **Field** — name, type (from Field-Type Registry), required/unique/default, relation
  target, validation rules, UI hints. A field's type contract drives: column DDL,
  validation, serialization, form widget, table cell, filter operators.
- **Relation** — belongsTo (FK column), hasMany (inverse), manyToMany (join collection).

### 2. Identity & Access
- **User** — one identity for admins, staff, customers. Credentials optional (a customer
  created at checkout may have no password yet).
- **Role** — named set of policies. Users ↔ Roles (m2m).
- **Policy** — (collection × action) → `{ rowFilter?, fields?, presets? }`. Row filter uses
  the same filter AST as queries. Admin flag on role short-circuits.
- **Session** — opaque token (hashed), sliding expiry.
- **ApiKey** — hashed key bound to a user (machine identity).

### 3. Content
- Content types are just collections. Extra semantics provided by the engine:
  - **status** field convention (`draft`/`published`/`archived`) when `versioned`.
  - **Revision** — snapshot of a record at each mutation (also the audit detail).
  - **publish_at** — scheduled transition executed by the job scheduler.
  - **blocks field type** — ordered typed component tree (the visual-builder model).
  - **localized fields** — per-locale values stored in a translations side table.

### 4. Commerce (domain services over system collections)
- **Product** (aggregate root) → **Variants** (price, sku, options). Products are records:
  they get media, SEO, blocks, localization from the engine for free.
- **InventoryMovement** — append-only ledger; stock = SUM(qty). No mutable "stock" column.
- **Cart** → **CartItem**. Price captured at add-time, revalidated at checkout.
- **Discount** — code, type (percent/fixed), constraints (min subtotal, usage limit, window).
- **Order** (aggregate root) → **OrderItems**; immutable monetary snapshot; state machine:
  `pending → paid → fulfilled → completed` (+ `cancelled`, `refunded`).
- **Payment / Fulfillment** — records attached to orders; providers are plugins.
- All money in **integer minor units** + currency code. Never floats.

### 5. Platform services (single instances, shared by all)
- **File** — storage-driver-backed; referenced by id everywhere.
- **Activity** — one stream: actor, action, collection, record, ip; joined to revisions.
- **Notification** — in-app inbox records, produced by event subscribers.
- **Setting** — typed key/value, namespaced.
- **Webhook** — subscription: events[] → URL; delivered via job queue; HMAC-signed.
- **Job** — persisted queue entry with attempts/backoff/schedule.

## Canonical events (single event bus)
`records.create|update|delete` (with collection), `auth.login|logout|failed`,
`orders.placed|paid|fulfilled|cancelled`, `files.upload`, `jobs.failed`.
Hooks = sync interceptors around engine operations (`before/after` × action).
Webhooks = async subscribers. Search indexing & notifications = subscribers. One pipeline.

## Invariants (enforced in the engine/service layer)
1. Every mutation passes access policy + field validation + hooks, and produces
   activity (+ revision if versioned) and events. No second write path exists.
2. Stock can never be reserved below zero inside the checkout transaction.
3. Orders are immutable after placement except through state transitions.
4. A record referencing a file/user/record must reference an existing one (FKs on).
5. Deleting a collection is blocked while relations point at it.
