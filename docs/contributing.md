# Contributing

Contributions are welcome! This guide covers everything you need to know as a contributor or developer.

## Development Setup

```bash
git clone https://github.com/nubisco/verba.git
cd verba
pnpm install

# Initialise the database
cd apps/api
cp .env.example .env
npx prisma migrate dev
cd ../..

# Start all services
pnpm dev
```

| Service | URL                                         |
| ------- | ------------------------------------------- |
| Web app | http://localhost:5173                       |
| API     | http://localhost:4000                       |
| Docs    | http://localhost:4173 (run `pnpm docs:dev`) |

## Repository Layout

```
verba/
├── apps/
│   ├── api/          # Fastify + Prisma backend
│   │   ├── src/
│   │   │   ├── routes/       # Thin HTTP handlers, delegate to services
│   │   │   ├── services/     # Business logic, ACL, workflow
│   │   │   ├── schemas/      # Zod request/response schemas
│   │   │   └── __tests__/    # Vitest unit tests
│   │   └── prisma/           # Schema + migrations
│   └── web/          # Vue 3 + Vite frontend
│       └── src/
│           ├── views/        # Page-level Vue components
│           ├── stores/       # Pinia state
│           └── router/       # Vue Router routes
├── packages/
│   ├── shared/       # Shared TypeScript types
│   └── cli/          # verba setup / verba migrate CLI
└── docs/             # VitePress documentation site
```

## Architecture Rules (Hard)

1. **Routes call services, never Prisma directly.** Controllers are thin.
2. **ACL is enforced in services**, using `requireProjectRole` from `acl.service.ts`.
3. **Zod validates all incoming data.** Schemas live in `src/schemas/`.
4. **All mutations emit a domain event** via `bus.emit(payload)` in `events.ts`.
5. **REST only.** No GraphQL, no tRPC.
6. **SQLite for dev, Postgres for production.** Use string constants instead of Prisma enums (SQLite compatibility).
7. **JWT in httpOnly cookie** named `token`. Never use the `Authorization` header.
8. **Tests required** for ACL and workflow on every new feature.

## Role Hierarchy

```
ADMIN (4) > MAINTAINER (3) > TRANSLATOR (2) > READER (1)
```

Global admin (`isGlobalAdmin: true` on User) bypasses project-level membership checks.

## Workflow State Machine

| From          | To            | Who                                   |
| ------------- | ------------- | ------------------------------------- |
| `TODO`        | `IN_PROGRESS` | TRANSLATOR+ (automatic on first save) |
| `IN_PROGRESS` | `SUBMITTED`   | TRANSLATOR+                           |
| `SUBMITTED`   | `APPROVED`    | MAINTAINER+                           |
| `SUBMITTED`   | `IN_PROGRESS` | MAINTAINER+ (reject)                  |
| `APPROVED`    | `IN_PROGRESS` | MAINTAINER+ (reopen)                  |

## Running Tests

```bash
cd apps/api
npx vitest run          # single run
npx vitest              # watch mode
```

All tests must pass before opening a PR. The test suite covers:

- Service unit tests (mocked Prisma)
- ACL and workflow edge cases
- Event emission and plugin loader

## Code Style

- **TypeScript strict mode** everywhere.
- **No `any`**: use `unknown` and narrow.
- **Zod** for runtime validation; do not cast request bodies.
- Vue **Composition API** only (`<script setup>`).
- Pinia stores for cross-component state.
- Comments only where non-obvious logic needs clarification.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add namespace-scoped export endpoint
fix: reject invalid workflow transitions in import
docs: update production deployment guide
chore: upgrade vitepress to 1.7
test: add missing ACL tests for READER role
```

## Branch Naming

```
feat/kanban-board
fix/otp-expiry-edge-case
docs/production-deployment
```

## Pull Request Guidelines

1. Fork and create a branch from `main`.
2. Ensure all existing tests pass (`npx vitest run` in `apps/api`).
3. Add tests for new behaviour (ACL coverage required).
4. Run `pnpm lint` before pushing.
5. Write a clear PR description: what changed, why, and what was tested.

## New Feature Checklist

- [ ] Prisma schema updated (if new model/field) + migration created
- [ ] Zod schema in `src/schemas/`
- [ ] Service function with `requireProjectRole` guard
- [ ] Route registered in `src/routes/`
- [ ] Domain event emitted and audit log written
- [ ] Tests: happy path + ACL edge cases
- [ ] Frontend: Vue component + `apiFetch` calls
- [ ] Docs updated if user-facing

## Open-Core: CE vs. EE

Verba follows an open-core model:

- **Community Edition (CE):** everything outside `packages/ee/`, licensed AGPL-3.0.
- **Enterprise Edition (EE):** `packages/ee/` only, proprietary Nubisco license.

**Import boundary:** CE code must never import from `@nubisco/verba-ee`. This is enforced by ESLint and a CI grep backstop. EE code may import from `@nubisco/verba-shared`.

### Running in OSS-only mode

By default, the API runs in CE mode. EE features are only loaded when `ENABLE_EE=true`:

```bash
# Pure CE (default)
pnpm dev

# With EE features (requires packages/ee to be built)
ENABLE_EE=true pnpm dev

# Explicitly force OSS-only (ignores ENABLE_EE even if set)
OSS_ONLY=true pnpm dev
```

### Adding EE features

1. All EE code goes in `packages/ee/src/`.
2. EE modules register themselves at boot via the dynamic loader in `apps/api/src/index.ts`.
3. Never import EE code from CE services, routes, or components.
4. See `architecture/open-core/` for full ADR and boundary documentation.

## Plugin System

Verba supports server plugins. A plugin is a file that exports a default `VerbaPlugin` object:

```ts
import type { VerbaPlugin } from '@nubisco/verba-api/plugin-types'
export default {
  name: 'my-plugin',
  setup(bus) {
    bus.on((event) => {
      if (event.type === 'translation.approved') {
        /* ... */
      }
    })
  },
} satisfies VerbaPlugin
```

Drop the file into `apps/api/plugins/` and it will be auto-loaded on startup.
