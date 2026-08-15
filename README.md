# CMC — Unified Content, Media & Commerce Platform

> **The ultimate open-source CMS + E-commerce platform** — combining the best of Directus, Payload CMS, Strapi, Medusa, Saleor, Bagisto, NocoBase, Filament, Refine, and GrapesJS into ONE unified system.

![TypeScript](https://img.shields.io/badge/TypeScript-100%25-blue)
![Next.js](https://img.shields.io/badge/Next.js-14+-black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-green)
![Turborepo](https://img.shields.io/badge/Turborepo-monorepo-purple)

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/cmc.git
cd cmc

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your database credentials

# 4. Initialize database
pnpm db:generate
pnpm db:push

# 5. Start development
pnpm dev
```

Admin panel: **http://localhost:3000**  
API: **http://localhost:4000/api**  
API Docs: **http://localhost:4000/api/docs**  
GraphQL: **http://localhost:4000/api/graphql**  

### Docker Development

```bash
docker compose -f docker/docker-compose.dev.yml up
```

---

## 🏗 Architecture

```
cmc/
├── apps/
│   ├── api/          # Express + Fastify backend (REST + GraphQL + WebSocket)
│   └── admin/        # Next.js 14 Admin Panel (App Router)
├── packages/
│   ├── ui/           # Shared UI library (Shadcn/ui + Tailwind)
│   ├── db/           # Prisma ORM + database schema
│   ├── core/         # Core types, errors, events, logging
│   ├── auth/         # Authentication (JWT, OAuth, TFA, SSO)
│   ├── api/          # API layer (REST routes, GraphQL, WebSockets, Webhooks)
│   ├── cms/          # Content management (CT builder, versions, SEO)
│   ├── ecommerce/    # E-commerce (products, cart, orders, payments)
│   ├── media/        # Media management (upload, storage, transforms)
│   ├── page-builder/ # Drag & drop page builder (GrapesJS integration)
│   ├── search/       # Search (Meilisearch)
│   ├── notifications/# Notifications (email, push, in-app)
│   ├── audit-log/    # Activity & audit logging
│   ├── workflows/    # Workflow automation engine
│   └── plugins/      # Plugin system (marketplace, registry, SDK)
├── docker/           # Docker configuration files
└── scripts/          # Utility scripts
```

---

## ✨ Features

### 📊 Admin Panel _(Filament + Directus + Refine)_
- ✅ Full dashboard with KPI cards & charts
- ✅ Advanced data tables (sort, filter, search, batch actions)
- ✅ Dynamic form builder
- ✅ Media library with grid/list view
- ✅ Role-based access control (RBAC)
- ✅ Activity log & audit trail
- ✅ Notifications center
- ✅ Multi-language support (i18n)
- ✅ Dark mode & RTL support
- ✅ Settings management

### 📝 CMS _(Payload + Strapi + Directus)_
- ✅ Visual Content Type Builder (create types with custom fields)
- ✅ Page Builder with drag & drop _(GrapesJS)_
- ✅ Blocks system (hero, CTA, features, FAQ, etc.)
- ✅ Live preview with draft content
- ✅ Version history & rollback
- ✅ Scheduled publishing
- ✅ SEO management (meta, OG, JSON-LD, sitemap)
- ✅ Multi-language content
- ✅ Comments & approvals

### 🛒 E-Commerce _(Medusa + Saleor + Bagisto)_
- ✅ Product management with variants (color, size, etc.)
- ✅ Category management (tree hierarchy)
- ✅ Inventory management (warehouse, stock movements)
- ✅ Order management (full lifecycle)
- ✅ Multi-gateway payments (Stripe, PayPal)
- ✅ Shipping management (rules, tracking)
- ✅ Discount & coupon system (percentage, fixed, free shipping)
- ✅ Customer management & groups
- ✅ Reviews & ratings
- ✅ Multi-currency & multi-store
- ✅ Gift cards
- ✅ Tax rules (region-based)

### 🎨 Page Builder _(GrapesJS)_
- ✅ Full drag & drop visual editor
- ✅ Component library (reusable)
- ✅ Theme system (colors, typography, CSS variables)
- ✅ Real-time preview
- ✅ Responsive editing (mobile, tablet, desktop)
- ✅ Template system
- ✅ Custom CSS/JS injection

### 🔌 API Layer
- ✅ REST API (auto-generated CRUD endpoints)
- ✅ GraphQL API (auto-generated schema)
- ✅ WebSocket real-time events
- ✅ Webhook system (configurable, retry)
- ✅ API keys management
- ✅ Rate limiting (per-user/per-IP)
- ✅ Swagger/OpenAPI documentation

### 🔐 Authentication
- ✅ Email & password (bcrypt, JWT)
- ✅ Social login (Google, GitHub, Apple)
- ✅ Two-factor authentication (TOTP)
- ✅ SSO (SAML/OIDC)
- ✅ JWT access + refresh tokens
- ✅ Session management
- ✅ Password reset flow

### 🧩 Plugin System _(NocoBase + Filament)_
- ✅ Plugin marketplace
- ✅ Enable/disable modules
- ✅ Custom plugin development
- ✅ Plugin configuration UI
- ✅ Plugin permissions

---

## 🛠 Tech Stack

| Category | Technology |
|----------|------------|
| **Language** | TypeScript (100%) |
| **Backend** | Node.js + Express |
| **Frontend** | Next.js 14+ (App Router) |
| **Database** | PostgreSQL + Prisma ORM |
| **Cache** | Redis |
| **Search** | Meilisearch |
| **Storage** | S3-compatible (MinIO, AWS S3, GCS) |
| **Queue** | BullMQ |
| **Real-time** | Socket.io |
| **UI** | Shadcn/ui + Tailwind CSS |
| **State** | Zustand + TanStack Query |
| **API** | REST + GraphQL + tRPC-ready |
| **Auth** | Custom JWT + NextAuth.js compatible |
| **Package** | pnpm |
| **Monorepo** | Turborepo |

---

## 📖 API Documentation

Once running, visit **http://localhost:4000/api/docs** for the full Swagger UI.

### Key REST Endpoints

```
# Auth
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh
POST   /api/auth/logout
POST   /api/auth/forgot-password
POST   /api/auth/reset-password

# CMS
GET    /api/cms/content-types
POST   /api/cms/content-types
GET    /api/cms/content-types/:id
GET    /api/cms/content-types/:id/items
POST   /api/cms/content-types/:id/items
PATCH  /api/cms/content-types/:id/items/:itemId
DELETE /api/cms/content-types/:id/items/:itemId
POST   /api/cms/content-types/:id/items/:itemId/publish
GET    /api/cms/pages
POST   /api/cms/pages
GET    /api/cms/pages/slug/:slug

# E-Commerce
GET    /api/ecommerce/products
POST   /api/ecommerce/products
GET    /api/ecommerce/products/:id
GET    /api/ecommerce/products/slug/:slug
GET    /api/ecommerce/categories
GET    /api/ecommerce/cart
POST   /api/ecommerce/cart/items
POST   /api/ecommerce/cart/:id/checkout
GET    /api/ecommerce/orders
GET    /api/ecommerce/orders/:id
PATCH  /api/ecommerce/orders/:id/status
GET    /api/ecommerce/customers
GET    /api/ecommerce/discounts
POST   /api/ecommerce/discounts
GET    /api/ecommerce/discounts/validate
POST   /api/ecommerce/payments
POST   /api/ecommerce/payments/webhook/:provider
GET    /api/ecommerce/reviews/:productId
POST   /api/ecommerce/reviews

# Media
GET    /api/media/files
POST   /api/media/files
GET    /api/media/files/:id
PATCH  /api/media/files/:id
DELETE /api/media/files/:id
GET    /api/media/folders
POST   /api/media/folders

# System
GET    /api/health
GET    /api/graphql
```

### GraphQL

```graphql
query {
  products(page: 1, limit: 10) {
    items { id title sku prices { amount currency } }
    total
  }
}
```

---

## 🗄 Database Schema

The database covers **40+ models** across 5 domains:

- **Auth & Users**: User, Role, Permission, ApiKey, Session, Account
- **CMS**: ContentType, ContentField, ContentItem, ContentVersion, SeoMeta, Comment
- **Pages**: Page, PageVersion, PageTemplate, Theme, Component, Layout
- **Media**: Media, MediaFolder, MediaTransformation
- **E-Commerce**: Store, Product, ProductVariant, ProductCategory, Cart, Order, OrderItem, Payment, Shipment, Discount, GiftCard, InventoryItem, Customer, Review, TaxRule, Currency, Region, ShippingOption, etc.
- **System**: Workflow, Webhook, Notification, Setting, Plugin, ScheduledJob

View the full schema: `packages/db/prisma/schema.prisma`

---

## 🔧 Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Redis 7+

### Setup

```bash
# Install
pnpm install

# Database
pnpm db:generate
pnpm db:push
pnpm db:seed

# Run all dev servers
pnpm dev

# Run specific app
pnpm --filter @cmc/admin dev
pnpm --filter @cmc/api-server dev
```

### Testing

```bash
pnpm test          # Unit tests
pnpm test:e2e      # Playwright E2E tests
```

### Building

```bash
pnpm build          # Build all packages
pnpm --filter @cmc/admin build    # Build admin only
pnpm --filter @cmc/api-server build  # Build API only
```

---

## 🐳 Docker Production Deployment

```bash
# 1. Set production environment variables
export DB_PASSWORD=your_secure_password
export JWT_SECRET=your_32_char_secret
export JWT_REFRESH_SECRET=your_32_char_refresh_secret
export MEILI_MASTER_KEY=your_meili_key

# 2. Start
docker compose -f docker/docker-compose.prod.yml up -d

# 3. Run migrations
docker exec cmc-api npx prisma migrate deploy

# 4. Create admin user
docker exec cmc-api node scripts/create-admin.ts
```

---

## 🔒 Security

- Password hashing with bcrypt (12 rounds)
- JWT with short-lived access tokens + refresh tokens
- Rate limiting on all endpoints
- CORS configured per environment
- Helmet security headers
- Input validation with Zod
- SQL injection protection (Prisma)
- XSS protection
- API key hashing (SHA-256)
- Session management with rotation
- 2FA support (TOTP)

---

## 🎯 Zero-Duplication Principle

This system follows a strict **zero duplication** rule:

- Every feature exists **ONCE** in the system
- No duplicate components, APIs, or database tables
- Shared component library used everywhere
- Every line of business logic lives in exactly one package
- Auth is unified — one authentication flow for all modules
- Admin panel is unified — one UI framework for CMS, Commerce, and System

---

## 📊 Origin Repositories

This platform is the synthesis of 10 leading open-source projects:

| Repository | Stars | Key Contribution |
|------------|-------|-----------------|
| [Directus](https://github.com/directus/directus) | 28k+ | Auto-generated APIs, RBAC, Flows |
| [Payload CMS](https://github.com/payloadcms/payload) | 24k+ | Content types, versions, plugins, admin UI |
| [Strapi](https://github.com/strapi/strapi) | 64k+ | Content Type Builder, admin panel |
| [Medusa](https://github.com/medusajs/medusa) | 26k+ | E-commerce modules architecture |
| [Saleor](https://github.com/saleor/saleor) | 21k+ | GraphQL e-commerce, checkout flow |
| [Bagisto](https://github.com/bagisto/bagisto) | 15k+ | Multi-store, multi-currency |
| [Filament](https://github.com/filamentphp/filament) | 18k+ | Admin panel patterns, KPI dashboard |
| [Refine](https://github.com/refinedev/refine) | 28k+ | UI framework for admin panels |
| [NocoBase](https://github.com/nocobase/nocobase) | 12k+ | Plugin system, ACL |
| [GrapesJS](https://github.com/GrapesJS/grapesjs) | 21k+ | Drag & drop page builder |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.