# Architecture

This page describes Verba's internal architecture for contributors and developers building on top of it.

## High-Level Overview

```
Vue 3 Frontend  →  Fastify API  →  Prisma ORM  →  SQLite / Postgres
                        ↓
                   Event Bus
                        ↓
                    Plugins
```

- The **API is the source of truth**. All business rules (workflow, ACL) live there.
- The **frontend** is a convenience layer; it cannot perform operations the API does not permit.
- The **event bus** decouples the core from side effects (plugins, notifications, webhooks).
- **Plugins** are isolated and cannot bypass ACL or directly mutate the database.

## Stack

| Layer      | Technology                     |
| ---------- | ------------------------------ |
| Frontend   | Vue 3, TypeScript, SCSS, Vite  |
| Backend    | Node.js, TypeScript, Fastify   |
| ORM        | Prisma                         |
| Database   | SQLite (dev) / Postgres (prod) |
| Monorepo   | pnpm workspaces                |
| Deployment | Docker Compose                 |

## Repository Layout

```
verba/
├── apps/
│   ├── api/              # Fastify backend
│   │   ├── src/
│   │   │   ├── app.ts          # Fastify app factory
│   │   │   ├── routes/         # HTTP route handlers
│   │   │   ├── services/       # Business logic (ACL, workflow, events)
│   │   │   ├── schemas/        # Zod validation schemas
│   │   │   └── prisma.ts       # Prisma client singleton
│   │   └── prisma/
│   │       └── schema.prisma   # Database schema
│   └── web/              # Vue 3 frontend
│       ├── src/
│       │   ├── views/          # Page components
│       │   ├── stores/         # Pinia stores
│       │   ├── router/         # Vue Router config
│       │   └── api.ts          # API client
│       └── vite.config.ts
├── packages/
│   └── shared/           # Shared TypeScript types
└── docs/                 # VitePress documentation
```

## API Layer

### Routes → Services → Prisma

Controllers (route handlers) **must never call Prisma directly**. All business logic lives in services:

```
Route Handler  →  Service  →  Prisma
```

This pattern ensures:

- ACL checks happen consistently.
- Events are emitted after successful operations.
- Audit entries are written with every mutation.

### Services

| Service              | Responsibility                                |
| -------------------- | --------------------------------------------- |
| `translationService` | CRUD, workflow transitions, validation        |
| `projectService`     | Project lifecycle, locale management          |
| `importService`      | CSV/XLSX parsing, column mapping, diff, apply |
| `auditService`       | Append-only audit log writes                  |

### Validation

All incoming request payloads are validated with **Zod** schemas before reaching the service layer. Zod schemas live in `apps/api/src/schemas/`.

### Authentication & ACL

- Authentication uses **JWT** tokens issued at login.
- ACL is enforced in the service layer. Role checks happen before any mutation.
- Namespace-scoped permissions are resolved per request.

## Event System

Verba emits internal domain events after successful operations:

```typescript
events.emit('translation.approved', { projectId, keyId, localeId, actorId })
events.emit('import.applied', { projectId, importRunId, stats })
```

Events are consumed by:

- The **audit service** (all mutations).
- **Plugins** (optional, isolated).

## Plugin Architecture

Plugins are loaded from a `/plugins` directory and registered via a `register(context)` function. The plugin context exposes:

```typescript
context.events.on('translation.approved', handler)
context.logger
context.config
```

Plugins **cannot**:

- Bypass ACL.
- Directly call Prisma.
- Crash the server on failure (errors are caught and logged).

## Data Model Summary

```
Project
 ├── Locale[]          (en, pt-PT, de, ...)
 ├── Namespace[]
 │     └── Key[]
 │           └── Translation[]  (one per Locale)
 │                 ├── text
 │                 ├── status   (TODO | IN_PROGRESS | SUBMITTED | APPROVED)
 │                 └── version
 ├── Membership[]      (User + Role)
 └── AuditLog[]
```

## Adding a New Feature

1. Define or update the **Prisma schema** (`apps/api/prisma/schema.prisma`).
2. Run `pnpm --filter @nubisco/verba-api exec prisma migrate dev --name <name>`.
3. Add or update **Zod schemas** in `apps/api/src/schemas/`.
4. Implement the **service** method with ACL, event emission, and audit entry.
5. Add a **route handler** that calls the service.
6. Write **tests** covering ACL and workflow transitions (`apps/api/src/__tests__/`).
7. Update the **Vue frontend** with the necessary views/stores/API calls.
