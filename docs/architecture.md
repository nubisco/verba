---
layout: nubisco
title: 'Architecture'
intro: "This page describes Verba's internal architecture for contributors and developers building on top of it."
---

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
- Project access needs two memberships, of the project and of the project's
  account, checked in one query by `requireProjectRole`. Leaving an account
  closes every project in it.

### Accounts

Routes that are not about one project (the project list, project creation) run
in **one account**, resolved by `resolveAccount` in
`apps/api/src/services/account.service.ts`:

- The caller names it, by id or slug, in the **`X-Verba-Account`** header, or as
  `?account=` where a header cannot be set.
- With none named, a person in **exactly one** account works in it. That keeps
  every client written before accounts working unchanged.
- A person in several accounts who names none gets a `400` listing them in
  `accounts`.
- An account the caller is not in answers `404`, exactly like one that does not
  exist, so membership cannot be probed.

Routes under `/projects/:projectId` need no header: the project names its
account. Notifications and personal tasks only come from projects the person
can still open.

| Route                                  | Who                                                    |
| -------------------------------------- | ------------------------------------------------------ |
| `GET /accounts`                        | The caller's accounts, with their role                 |
| `POST /accounts`                       | Platform admins of this app, and instance operators    |
| `GET` / `PATCH /accounts/:id`          | Members read, admins rename                            |
| `GET /accounts/:id/members`            | Members                                                |
| `POST /accounts/:id/members`           | Admins: add someone who has signed in once, by email   |
| `PATCH /accounts/:id/members/:userId`  | Admins (owners for anything owner): change a role      |
| `DELETE /accounts/:id/members/:userId` | Admins, or the member themselves. The last owner stays |
| `GET /admin/entitlements?accountId=`   | Instance operators: the account's plan                 |

Account changes are recorded in the instance audit record
(`GET /admin/audit`), since they belong to no project.

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
Account
 ├── AccountMember[]   (User + OWNER | ADMIN | MEMBER)
 └── Project[]

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
2. Run `pnpm --filter @nubisco/verba-api exec prisma db push`, then `pnpm --filter @nubisco/verba-api prisma:generate`. Then write the PostgreSQL migration that production will apply: `pnpm --filter @nubisco/verba-api db:migration:new <name>` with `SHADOW_DATABASE_URL` pointing at a scratch Postgres. Read the SQL before committing it.
3. Add or update **Zod schemas** in `apps/api/src/schemas/`.
4. Implement the **service** method with ACL, event emission, and audit entry.
5. Add a **route handler** that calls the service.
6. Write **tests** covering ACL and workflow transitions (`apps/api/src/__tests__/`).
7. Update the **Vue frontend** with the necessary views/stores/API calls.
