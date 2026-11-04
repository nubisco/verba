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

Instance operators are named by email in `VERBA_OPERATORS` (comma separated) and manage accounts. Nobody becomes one by registering first, and operators get no access to projects they are not members of (VE-77). Put your own address in `apps/api/.env` to use the admin pages in development.

## Repository Layout

```
verba/
├── apps/
│   ├── api/                  # Hono + Prisma backend (Node server in Docker)
│   │   ├── src/
│   │   │   ├── app.ts              # Hono app factory: CORS, body limit, errors, routes
│   │   │   ├── index.ts            # Node entry point (@hono/node-server), WebSockets, plugins
│   │   │   ├── http.ts             # App type, readBody, httpError
│   │   │   ├── session.ts          # Session JWT cookie, `authenticate` middleware
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
│   │   │   └── migrations/         # PostgreSQL migration history, applied by migrate deploy
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
3. **No microservices.** Everything in `apps/api` is a single Hono app. Today it runs as one Node process. Hosted Verba is moving to Cloudflare Workers (docs/hosting-on-cloudflare.md), so nothing in a route or service may depend on Node's HTTP server: take the request through Hono's context, never through `c.env.incoming`, except in `rate-limits.ts`.
4. **ACL is enforced on the server.** The frontend may hide UI elements but the API must always validate role and status independently.
5. **Flat keys internally.** Translation keys are dot-separated strings (e.g. `auth.login.title`), never nested objects in the database.
6. **Zod for all input validation.** Define schemas in `src/schemas/`, parse in the route handler before calling the service.
7. **Emit events after successful mutations.** Use `emit()` from `events.ts` at the end of service functions, not inside route handlers.
8. **Audit log every mutation.** Call `audit.log()` inside the relevant service after every create/update/delete.

## Tech Stack

| Layer    | Technology                                  |
| -------- | ------------------------------------------- |
| Frontend | Vue 3, TypeScript, SCSS, Vite, Pinia        |
| Backend  | Node.js 22, TypeScript, Hono 4              |
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

## Accounts

Every project belongs to one **account** (the tenant, fleet standard "Every rail has the same anatomy"). Account roles are `OWNER > ADMIN > MEMBER` (`types.ts` `AccountRole`). Rules, all in `account.service.ts`:

- Project access needs membership of the project **and** of its account. `getMembership` checks both in one query, so every route that calls `requireProjectRole` is account-scoped. Never look a membership up any other way for an access decision.
- Routes that are not about one project resolve the account with `resolveAccount(userId, accountSelector(req))`: the `X-Verba-Account` header or `?account=` (id or slug), else the person's only account. Several and none named is a 400 listing them, someone else's is a 404.
- Only Platform admins of this app (`User.platformRole === 'admin'`, the app-level `role` claim stored at sign-in) and instance operators create accounts. Account owners and admins add people. Only owners touch owners, and the last owner cannot leave.
- Accounts are Community Edition code: access control cannot depend on the EE package. Plans, limits and billing per account stay in `packages/ee`.
- Hosted plans come from Nubisco's licenses service (Paddle as merchant of record), cached per account in `AccountPlan` (`packages/ee/src/plans`, docs/plans-and-billing.md). They switch on only with `ENABLE_EE=true`, `VERBA_LICENSES_URL` and `VERBA_LICENSES_SERVICE_TOKEN`. Verba never calls Paddle and never opens a checkout itself: checkout runs on nubisco.io. There is no Stripe code, and the old `Subscription` table is not read. A service that creates a project, adds a person to an account, creates keys or adds a locale calls `assertWithinLimit` (`plan-limits.service.ts`) first, which refuses nothing unless hosted plans are on. An account over its plan is read-only except for deleting, removing people and billing (`read-only.ts`, an `onRoute` hook). A self-hosted instance has no plan limits. Checkout is a separate switch, `VERBA_CHECKOUT_OPEN` (off unless `"true"`): with it off, the checkout route answers 403 `checkout_closed`, `/config` reports `features.checkout: false`, and the web app shows no See plans or upgrade panel, only Contact sales. Hosted keeps it off until the terms and pricing are published.

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
- Sessions expire (`SESSION_TTL_HOURS`, default 7 days) and are renewed once a day while in use, which is also when a deactivated account is signed out. Create one only with `issueSession()` and clear it with `clearSession()` from `src/session.ts`, which set `secure` (production), `sameSite=lax` and the expiry. Never sign a token or set the cookie by hand.
- The frontend uses `credentials: 'include'` on every fetch (see `api.ts`).
- Routes that need auth put the `authenticate` middleware from `src/session.ts` before the handler: `app.get(path, authenticate, async (c) => ...)`.
- `c.var.user` contains `{ userId, email }` after authentication.
- **Sign-up and terms** live in `services/signup.service.ts`, the same shape as Acta's (LA-402). `VERBA_SIGNUP_OPEN=false` refuses new users by every door (an email code, password registration, Platform or OIDC provisioning), with 403 `signup_closed`, while existing users and `VERBA_OPERATORS` addresses sign in. Unset means open, so self-hosters are unaffected. Every new user goes through `createLocalUser` (`auth.service.ts`) or `upsertUserFromClaims` (`platform-auth.service.ts`), and both call `assertSignupAllowed`: a new door that creates a user must too. `VERBA_TERMS_VERSION` (with `VERBA_TERMS_URL`, `VERBA_PRIVACY_URL`) stores the accepted version and time on `User`. The accepted version rides in the session (`terms` claim), and `authenticate` refuses everything outside `/auth` with 403 `terms_required` until the current version is accepted (`POST /auth/me/terms`). Hosted Verba keeps sign-up closed and the terms unset until the terms are published (`apps/api/wrangler.toml`).
- **Hosted Verba is a Cloudflare Worker** (`src/worker.ts`, `apps/api/wrangler.toml`, `src/worker/`), built from the same app. It sets the D1 Prisma client, live delivery through the account's Durable Object (`src/worker/live-hub.ts`) and the per-minute rate limiting bindings, then serves `/api`. Its typecheck is `pnpm --filter @nubisco/verba-api types:check`, and CI bundles it with `wrangler deploy --dry-run`. Run it locally as docs/hosting-on-cloudflare.md, "Running the Worker locally", describes. Deploys go through the deploy workflow from the cutover on, so nothing on Cloudflare is created or changed from a working copy.
- **Long work runs as chunked background jobs** (`src/jobs.ts`, `services/import-job.service.ts`): imports and AI fills answer 202 with an `ImportRun`, and the page follows it. On a Worker each job is a Queue message with its own budget of about 1,000 D1 queries. A new bulk operation follows the same shape, never a loop of queries in one request.
- **Never `include` across a whole project.** On D1 Prisma loads an include with one query per 100 parent rows, so a 60,000-row export with includes ran 1,049 queries. Select scalar columns and join in memory (`services/key-index.service.ts`). Lookups by a list of ids go in groups of at most 90 values (D1 allows 100 bound parameters per statement).
- **Email is Resend over `fetch` only** (`services/email.service.ts`), with `MAIL_FROM` required and no default. There is no SMTP.
- Work that may finish after the response (an analytics event, a live update) goes through `defer()` (`src/defer.ts`), and live updates through `live()` (`src/live.ts`), never straight to `wsManager`: on a Worker both are different (docs/hosting-on-cloudflare.md).
- Handlers return `c.json(...)`, read bodies with `readBody(c)` (`src/http.ts`) and throw `httpError(status, message)` for a refusal. Every POST, PUT and PATCH route gets the read-only guard automatically (`guardEveryWrite`, `src/read-only.ts`).

## Database

- Dev: `apps/api/prisma/dev.db` (SQLite). **Do not commit this file.**
- Prod: Postgres via `DATABASE_URL` env var.
- Prisma enums are stored as **string constants** (not native DB enums) for SQLite compatibility. Types are in `src/types.ts`.
- **Production (PostgreSQL) applies a reviewed migration history, never `db push`.** `prisma/migrations` holds PostgreSQL SQL, starting from `20261024000000_baseline`. The API image runs `prisma migrate deploy` on every start, and `verba migrate` does the same for a PostgreSQL `.env`. `db push --accept-data-loss` at start-up was removed (VE-77) because a schema change could silently drop customer columns.
- **Development (SQLite) uses `db push`.** After a schema change: `pnpm db:push` then `pnpm prisma:generate` from `apps/api/`.
- **Every schema change ships a migration in the same commit, for PostgreSQL and for D1.** Start a scratch Postgres, then from `apps/api/`: `SHADOW_DATABASE_URL=postgresql://... pnpm db:migration:new <snake_case_name>`, and `pnpm db:d1:new <snake_case_name>` for hosted Verba's D1 history in `prisma/d1` (docs/hosting-on-cloudflare.md). Read the SQL both write (it runs unattended in production), and run `pnpm db:migration:check` and `pnpm db:d1:check` to confirm both histories match the schema. Never edit a migration that has shipped.
- A database created by the old `db push` start-up has no history. It is baselined once by hand (`prisma migrate resolve --applied 20261024000000_baseline`) before the first image with `migrate deploy` runs against it. See docs/self-hosting.md, "Moving an existing database onto migrations".
- Prisma 7: `prisma generate` writes the client to `apps/api/src/generated/prisma` (gitignored, compiled into `dist`). Services import `prisma` only from `src/prisma.ts`, which holds whichever client the entry point set. The Node entry creates it with `src/prisma-node.ts`, which picks the driver adapter from `DATABASE_URL` (`@prisma/adapter-pg` for Postgres, `@prisma/adapter-better-sqlite3` for `file:` URLs). Never import a driver anywhere else: a Worker bundle must not carry one. The CLI reads the connection from `apps/api/prisma.config.ts`, not from the schema.

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

| Variable            | Default         | Required in prod      |
| ------------------- | --------------- | --------------------- |
| `DATABASE_URL`      | `file:./dev.db` | ✅ (Postgres URL)     |
| `JWT_SECRET`        | `dev-secret`    | ✅                    |
| `PORT`              | `4000`          |                       |
| `CORS_ORIGIN`       |                 | ✅                    |
| `PLUGINS_DIR`       |                 |                       |
| `VERBA_OPERATORS`   |                 | ✅ (operator emails)  |
| `AI_ENCRYPTION_KEY` |                 | ✅ (to store AI keys) |

Hosted billing (Nubisco's own instance only) adds `ENABLE_EE`, `VERBA_LICENSES_URL`, `VERBA_LICENSES_SERVICE_TOKEN`, `VERBA_ENTITLEMENT_WEBHOOK_SECRET`, `VERBA_SALES_URL` and `VERBA_CHECKOUT_OPEN`. See docs/plans-and-billing.md.

Sign-up and terms: `VERBA_SIGNUP_OPEN` (open unless `false`), `VERBA_TERMS_VERSION`, `VERBA_TERMS_URL`, `VERBA_PRIVACY_URL` (no terms step unless the version is set). See docs/self-hosting.md, "Closing sign-up, and asking for terms".

The API refuses to start with the default `JWT_SECRET` in production.

## Images and the hosted deployment

- **One public API image, from one Dockerfile.** `apps/api/Dockerfile` takes `EDITION` (default `ce`). `ghcr.io/nubisco/verba-api` is the public Community Edition image: packages/ee is replaced by a stub, so no proprietary code ships in it. `EDITION=ee` still builds, but CI publishes no EE image: hosted Verba is the Cloudflare Worker, which bundles packages/ee itself. Never publish an EE image publicly and never point the public `docker-compose.yml` at one.
- **Deploy** (`.github/workflows/docker.yml`): after Release on master, for one pinned commit, the `worker` job builds the web app, applies the D1 migrations and deploys the Worker to verba.nubisco.io with `VERBA_GIT_SHA`, then checks `/api/version` reports that commit. The public images are built and tagged `sha-<7>` beside it. The NAS no longer runs Verba (cutover, 2026-11-04).

## New Feature Checklist

1. **Schema change?** → Edit `prisma/schema.prisma`, run `pnpm db:push` and `pnpm prisma:generate`, then write the PostgreSQL migration with `pnpm db:migration:new <name>` (see Database).
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
- Self-serve account creation (accounts exist, but only admins create them). Hosted billing and its limits exist (docs/plans-and-billing.md)
- Native mobile apps
- GraphQL API
