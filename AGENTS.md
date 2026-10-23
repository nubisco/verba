# AGENTS.md

Guidelines for AI coding agents working on this repository.

## Project Overview

**Verba** is an open-source, self-hostable i18n collaboration tool. It lets teams manage translation keys, assign work to translators, and run an approval workflow before translations ship.

## Quickstart

```bash
pnpm install                  # install all workspace deps
cd apps/api && pnpm prisma:generate   # generate Prisma client
pnpm build                    # type-check + build all packages
pnpm test                     # run all tests
pnpm dev                      # start API (port 4000) + web (port 5173)
```

The default dev user (seeded via the registration endpoint) is whatever you register first. That user becomes **ADMIN** automatically (see milestone 7.2).

## Repository Layout

```
verba/
├── apps/
│   ├── api/                  # Fastify + Prisma backend
│   │   ├── src/
│   │   │   ├── app.ts              # Fastify factory, CORS, JWT, plugin registration
│   │   │   ├── index.ts            # Entry point, starts server, loads plugins
│   │   │   ├── routes/             # HTTP handlers (thin, delegate to services)
│   │   │   ├── services/           # All business logic lives here
│   │   │   ├── schemas/            # Zod input schemas
│   │   │   ├── events.ts           # Typed event bus (singleton)
│   │   │   ├── plugin-loader.ts    # Auto-loads plugins from PLUGINS_DIR
│   │   │   ├── plugin-types.ts     # PluginContext / VerbaPlugin interfaces
│   │   │   ├── types.ts            # Role + Status string constants
│   │   │   └── prisma.ts           # Prisma client singleton
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Data model
│   │   │   └── migrations/         # Auto-generated migration files
│   │   ├── plugins/                # Example plugins (JS, loaded at runtime)
│   │   └── __tests__/              # Vitest unit tests
│   └── web/                  # Vue 3 + Pinia + SCSS frontend
│       └── src/
│           ├── views/              # Page components (one per route)
│           ├── stores/             # Pinia stores (auth.ts)
│           ├── router/             # Vue Router, all routes in index.ts
│           └── api.ts              # apiFetch<T> helper (cookie credentials)
├── packages/
│   └── shared/               # Shared TypeScript types (not yet used heavily)
├── docs/                     # VitePress documentation site
├── samples/                  # Sample import files (CSV, XLSX, JSON)
├── eslint.config.mjs         # ESLint v9 flat config
└── docker-compose.yml
```

## Architecture Rules

These are hard rules. Do not deviate.

1. **Routes never call Prisma directly.** Every route handler must call a service function. Prisma queries belong in services only.
2. **REST only.** No GraphQL, no tRPC, no WebSockets.
3. **No microservices.** Everything in `apps/api` is a single Fastify process.
4. **ACL is enforced on the server.** The frontend may hide UI elements but the API must always validate role and status independently.
5. **Flat keys internally.** Translation keys are dot-separated strings (e.g. `auth.login.title`), never nested objects in the database.
6. **Zod for all input validation.** Define schemas in `src/schemas/`, parse in the route handler before calling the service.
7. **Emit events after successful mutations.** Use `emit()` from `events.ts` at the end of service functions, not inside route handlers.
8. **Audit log every mutation.** Call `audit.log()` inside the relevant service after every create/update/delete.

## Tech Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Frontend | Vue 3, TypeScript, SCSS, Vite, Pinia        |
| Backend  | Node.js 22, TypeScript, Fastify 4           |
| Auth     | JWT in httpOnly cookie (`token`)            |
| ORM      | Prisma (SQLite for dev, Postgres for prod)  |
| Monorepo | pnpm workspaces                             |
| Testing  | Vitest (API), no web tests yet              |
| Linting  | ESLint v9 flat config (`eslint.config.mjs`) |
| Docs     | VitePress (`docs/`)                         |
| Deploy   | Docker Compose, multi-stage, non-root       |

## Role Hierarchy

```
ADMIN (4) > MAINTAINER (3) > TRANSLATOR (2) > READER (1)
```

Higher roles inherit the permissions of lower roles. Defined in `acl.service.ts`.

## Workflow State Machine

```
TODO → IN_PROGRESS → SUBMITTED → APPROVED
                  ↑               |
                  └───────────────┘  (reject / reopen)
```

| Transition              | Allowed roles                 |
| ----------------------- | ----------------------------- |
| TODO → IN_PROGRESS      | TRANSLATOR, MAINTAINER, ADMIN |
| IN_PROGRESS → SUBMITTED | TRANSLATOR, MAINTAINER, ADMIN |
| SUBMITTED → APPROVED    | MAINTAINER, ADMIN             |
| SUBMITTED → IN_PROGRESS | MAINTAINER, ADMIN             |
| APPROVED → IN_PROGRESS  | MAINTAINER, ADMIN             |

Invalid transitions return HTTP 422. Implemented in `canTransitionStatus()` in `acl.service.ts`.

## Authentication

- **Login/Register**: `POST /auth/login`, `POST /auth/register`
- Token is stored as an `httpOnly` cookie named `token`. Never in `localStorage`.
- The frontend uses `credentials: 'include'` on every fetch (see `api.ts`).
- Fastify routes that need auth use `{ preHandler: [app.authenticate] }`.
- `req.user` contains `{ userId, email }` after authentication.

## Database

- Dev: `apps/api/prisma/dev.db` (SQLite). **Do not commit this file.**
- Prod: Postgres via `DATABASE_URL` env var.
- Prisma enums are stored as **string constants** (not native DB enums) for SQLite compatibility. Types are in `src/types.ts`.
- After schema changes: `pnpm prisma migrate dev --name <name>` from `apps/api/`.
- After pulling migrations: `pnpm prisma:generate` from the repo root.
- Prisma 7: `prisma generate` writes the client to `apps/api/src/generated/prisma` (gitignored, compiled into `dist`). Import it only through `src/prisma.ts`, which picks the driver adapter from `DATABASE_URL` (`@prisma/adapter-pg` for Postgres, `@prisma/adapter-better-sqlite3` for `file:` URLs). The CLI reads the connection from `apps/api/prisma.config.ts`, not from the schema.

## Frontend Conventions

- One `.vue` file per route, lives in `src/views/`.
- `apiFetch<T>(path, init?)` in `api.ts` is the only way to call the API. Do not use `fetch()` directly.
- Navigation is in `DefaultLayout.vue` (sidebar). Route definitions are in `router/index.ts`.
- Auth state is in the `auth` Pinia store (`stores/auth.ts`). Access it with `useAuthStore()`.
- SCSS is scoped per component. Global styles go in `src/style.scss` (or equivalent).
- Status badge colors: `badge-grey` (TODO), `badge-blue` (IN_PROGRESS), `badge-orange` (SUBMITTED), `badge-green` (APPROVED).

## Event Bus

All events are typed via `VerbaEvent` in `src/events.ts`. Use the `emit()` helper:

```ts
import { emit } from '../events.js'
emit({ type: 'key.created', keyId, projectId, name })
```

Plugins subscribe via `ctx.onEvent(listener)`. They must never crash the app (fail-safe wrapper in `plugin-loader.ts`).

## Testing

- All tests live in `apps/api/src/__tests__/`.
- Use **Vitest** with `vi.mock('../prisma.js')` to mock Prisma. Never hit a real DB in unit tests.
- Every service should have a test file. Every ACL rule and workflow transition must be tested.
- Run: `pnpm test` from repo root or `pnpm test` from `apps/api/`.

## CORS

The API allows `GET, POST, PUT, PATCH, DELETE, OPTIONS`. In dev, any `localhost` origin is accepted. In production, set `CORS_ORIGIN` env var.

## Environment Variables

| Variable       | Default         | Required in prod  |
| -------------- | --------------- | ----------------- |
| `DATABASE_URL` | `file:./dev.db` | ✅ (Postgres URL) |
| `JWT_SECRET`   | `dev-secret`    | ✅                |
| `PORT`         | `4000`          |                   |
| `CORS_ORIGIN`  |                 | ✅                |
| `PLUGINS_DIR`  |                 |                   |

The API refuses to start with the default `JWT_SECRET` in production.

## New Feature Checklist

1. **Schema change?** → Edit `prisma/schema.prisma`, run `pnpm prisma migrate dev`.
2. **New service function?** → Add to `src/services/`, write unit tests.
3. **New route?** → Add to `src/routes/`, register in `app.ts`, validate with Zod.
4. **New event type?** → Add to `VerbaEvent` union in `events.ts`.
5. **New frontend page?** → Create `src/views/MyView.vue`, add route in `router/index.ts`, add sidebar link in `DefaultLayout.vue` if needed.
6. **ACL rule?** → Add to `acl.service.ts`, write tests in `acl.service.test.ts`.
7. Run `pnpm build && pnpm test` before committing.

## Out of Scope (MVP)

Do not implement unless explicitly requested:

- Real-time collaboration (WebSockets, SSE)
- Machine translation integration
- Billing or multi-tenancy (SaaS model)
- Native mobile apps
- GraphQL API
