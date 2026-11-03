---
layout: nubisco
title: 'Hosting on Cloudflare'
intro: "The plan for moving Nubisco's hosted Verba (verba.nubisco.io) from a Docker deployment on Nubisco's NAS to Cloudflare Workers, the way Acta runs, while the Docker image stays exactly what self-hosters run. Jose took the open decisions on 2026-11-03, and they are recorded below as decided."
---

## Why, and what does not change

Jose decided on 2026-11-03 to port hosted Verba to Cloudflare first and only then switch on paid plans (the plans code is already merged, see [Plans and Billing](./plans-and-billing)). The NAS is becoming Nubisco's sandbox and staging machine, and a product that bills belongs on the platform the rest of the hosted fleet runs on.

**Hosted Verba starts fresh on Cloudflare** (Jose, 2026-11-03). There are no customers and no content on the NAS that must survive, so nothing is copied across: no data migration, no write freeze, no rollback window and no NAS on standby. The cutover is switching the hostname to the Worker.

What stays the same, at every stage:

- **Self-hosting is Docker.** The public images (`verba-api`, `verba-ce`) keep building from this repository, Community Edition only, and keep running on Node with PostgreSQL or SQLite. Nothing in this plan removes a feature from them.
- **One codebase.** The API is one Hono app. Node serves it in Docker, a Worker serves it on Cloudflare. Routes and services do not know which.
- **The hosted URL.** verba.nubisco.io, the web app at `/` and the API at `/api`, as today.

## Where it runs today

Checked against the code on 2026-11-03, not taken from older notes:

| Part           | Today                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API            | Node 22 in Docker. Fastify 5, and Hono from stage 1.                                                                                                                                                                                                                                                                                                     |
| Database       | **PostgreSQL 16** in the same compose project, through Prisma 7 and `@prisma/adapter-pg`. The schema says `sqlite` in the repository (development) and the Dockerfile switches it to `postgresql` before `prisma generate`. Production applies the reviewed PostgreSQL history in `apps/api/prisma/migrations` with `prisma migrate deploy` at start-up. |
| Web            | The Vue build, served by nginx in the `verba-ce` image, which proxies `/api/` (WebSocket upgrades included) to the API container.                                                                                                                                                                                                                        |
| Hosted image   | `verba-api-ee`, a private image with `packages/ee` compiled in (PR #173), for verba.nubisco.io only.                                                                                                                                                                                                                                                     |
| Deploy         | `.github/workflows/docker.yml`: after Release on master, build the images, then `ssh nas-deploy "verba sha-<7>"` from the self-hosted runner.                                                                                                                                                                                                            |
| Edge           | verba.nubisco.io already resolves to Cloudflare's proxy, so Cloudflare sits in front of the NAS today.                                                                                                                                                                                                                                                   |
| Files          | **None stored.** Imports are parsed in memory, exports are generated per request, avatars from the identity provider are URLs, and a project's own avatar is a data URL in its row.                                                                                                                                                                      |
| Scheduled work | **None.** No timers or cron. A stale plan is refreshed when a request needs it.                                                                                                                                                                                                                                                                          |
| Realtime       | `@fastify/websocket` (now `@hono/node-ws`): one in-memory room per project and one set of sockets per person, in the API process.                                                                                                                                                                                                                        |
| Rate limits    | In memory, 15-minute windows, per IP and per email on the sign-in routes.                                                                                                                                                                                                                                                                                |

## Target architecture

```
                 verba.nubisco.io
                        │
              Cloudflare Worker "verba"
        ┌───────────────┼──────────────────────┐
  static assets     /api/* → Hono app      /api/ws/* → Durable Object
  (apps/web/dist)       │                   one per account (LiveHub)
                        │
              D1 "verba" (Prisma, adapter-d1)
```

- **The Worker** serves the built web app from Workers static assets and the API under `/api`. `run_worker_first = ["/api/*"]` and `not_found_handling = "single-page-application"`, so a page request never wakes the Worker and a deep link still loads the app. The web build is unchanged: in production it already calls `/api`.
- **The API** is the same Hono app the Docker image runs (`buildApp()` in `apps/api/src/app.ts`), with a Worker entry beside the Node one, as Acta has `server/src/worker.ts` beside `server/src/index.ts`.
- **The database** is D1, through Prisma's D1 driver adapter. See the next section.
- **Realtime** is a Durable Object per account holding that account's sockets (every project room of the account, and each person's notifications), as AGENTS.md requires ("Getting it to an open tab now: live delivery", reference `acta/server/src/live-hub.ts`). An in-process room only reaches the tabs connected to the same isolate, which on Workers is not delivery.
- **Rate limits** use Cloudflare's rate limiting binding with per-minute numbers (decided, Jose, 2026-11-03), with the in-memory limiter as the fallback, as in `acta/server/src/core/rateLimit.ts`. The binding only counts per 10 or 60 seconds, so the Worker has its own numbers, below. The Docker image keeps its 15-minute windows. The per-code attempt cap on one-time codes, which is in the database, is the same in both.

  | Door                       | Docker, per 15 minutes       | Worker, per minute          |
  | -------------------------- | ---------------------------- | --------------------------- |
  | Asking for a one-time code | 20 per address, 5 per email  | 5 per address, 2 per email  |
  | Entering a one-time code   | 30 per address, 15 per email | 10 per address, 5 per email |
  | Password sign-in           | 20 per address, 10 per email | 5 per address, 3 per email  |
  | Return from single sign-on | 30 per address               | 10 per address              |

  The per-minute numbers allow more over a full 15 minutes than the Docker image does. What stops a code being guessed is the attempt cap, which burns a code after a few wrong guesses wherever it runs.

- **Cron**: nothing needs one for parity. The first jobs that will (deleting Free accounts idle for 240 days, pruning expired one-time codes) get a `[triggers]` cron and a `scheduled` handler then, as Acta's does.
- **R2**: none (decided). Verba stores no files, so a bucket is added only when a feature stores one: an asynchronous export too big for one response, or project avatars moved out of their rows.
- **`nodejs_compat`** is on. Unlike Acta, Verba uses `node:crypto`, `node:events` and `Buffer`, and reads its settings from `process.env`, which Workers fill from vars and secrets with that flag and a compatibility date after 2025-04-01.

## D1, not PostgreSQL through Hyperdrive

**Decided: D1** (Jose, 2026-11-03), for these reasons:

|                | D1                                                                                                                                                  | PostgreSQL through Hyperdrive                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fits the fleet | Acta runs on D1.                                                                                                                                    | No other hosted Nubisco product does.                                                                                                                                                        |
| Platforms      | Cloudflare only.                                                                                                                                    | Needs a PostgreSQL somewhere: a new provider (a third platform, which AGENTS.md "Deployment" rules out without a reason), or the NAS through a tunnel, which keeps the NAS in every request. |
| Schema         | Already SQLite-compatible by design (ARCHITECTURE.md principle 5): enums are strings, lists are JSON in strings, and development runs SQLite today. | The production schema as it is.                                                                                                                                                              |
| Migrations     | A D1 history beside the PostgreSQL one, both from the one schema and both checked in CI.                                                            | The one history as it is.                                                                                                                                                                    |
| Cost           | Included in the Workers paid plan at Verba's size.                                                                                                  | The database host, plus Hyperdrive.                                                                                                                                                          |

What D1 changes, and how each is handled:

- **Transactions.** D1 has no interactive transactions. Verba uses only the batch form (`prisma.$transaction([...])`, once, in `account.service.ts`), which the adapter runs without isolation. Stage 3 exercises it under `wrangler dev`.
- **Bound parameters.** D1 allows 100 per statement. Long `in` lists (a key's history over many translations, large imports) are checked against the adapter in stage 3, and chunked where the adapter does not already do it.
- **Search.** Prisma's `contains` is case-sensitive on PostgreSQL and case-insensitive for ASCII on SQLite. Hosted key and people search becomes case-insensitive. That is arguably better, and with a fresh start nobody relies on the old behaviour.
- **Size.** 10 GB per database. Hosted Verba is far below that. The size goes on the operator's checklist, as Acta's cron watches its own.
- **Round trips.** An import upserts row by row. On D1 every query is a round trip, so a 1,500-key import could take seconds. Stage 3 measures it and batches the writes if it needs to.

## One codebase, two runtimes

The rule from stage 1 on: **routes and services take everything through Hono's context and the seams below, never through Node.** `c.env.incoming` (the Node request) is read in one place, `rate-limits.ts`, to find the caller's address.

| Seam                    | Node (Docker)                                                                 | Worker                                                                           |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| HTTP server             | `@hono/node-server` (`src/index.ts`)                                          | `export default { fetch }` (`src/worker.ts`)                                     |
| WebSockets              | `@hono/node-ws`, rooms in the process (`src/ws`)                              | The `LiveHub` Durable Object                                                     |
| Database                | `src/prisma.ts`: `adapter-pg` or `adapter-better-sqlite3` from `DATABASE_URL` | `adapter-d1` from the `DB` binding                                               |
| Client address          | Socket and `X-Forwarded-For` behind trusted proxies (`TRUST_PROXY`)           | `cf-connecting-ip`                                                               |
| Rate limits             | In-memory fixed window                                                        | The rate limiting binding, in-memory fallback                                    |
| Work after the response | Runs on its own                                                               | `executionCtx.waitUntil`, through a `defer()` seam like Acta's `setDeferrer`     |
| Plugins                 | Loaded from `PLUGINS_DIR`                                                     | None: the hosted instance runs no third-party plugins                            |
| Start-up jobs           | After `listen`                                                                | None needed: the one there is reseals old AI keys, and a fresh database has none |

**Work after the response** needs its own line. `analytics.track` sends a `fetch` it never awaits, on purpose. On Workers, a promise still running when the response is sent can be cancelled, so stage 2 routes it through `defer()`, which is `waitUntil` on Workers and a plain call on Node.

## Node-only dependencies

| Dependency                       | Used for                                      | On Workers                                 | Replacement                                                                                                                                       |
| -------------------------------- | --------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fastify` and `@fastify/*`       | The HTTP layer                                | No                                         | **Hono** (stage 1, done)                                                                                                                          |
| `exceljs`                        | XLSX export                                   | Built on Node streams and `fs`, unreliable | SheetJS (`xlsx`), already a dependency for import, which is pure JavaScript (stage 2)                                                             |
| `archiver`                       | The zip of a split-by-namespace export        | Node streams                               | `fflate` (`zipSync`), pure JavaScript (stage 2)                                                                                                   |
| `nodemailer`                     | SMTP for one-time codes                       | No raw SMTP                                | Resend over `fetch`, the fleet standard, already the first choice in `otp.service.ts`. SMTP stays for self-hosters, loaded only on Node (stage 2) |
| `@prisma/adapter-pg`, `pg`       | PostgreSQL                                    | Not used there                             | `@prisma/adapter-d1` (stage 3)                                                                                                                    |
| `@prisma/adapter-better-sqlite3` | Development SQLite                            | Native module                              | Not used there                                                                                                                                    |
| `proxy-addr`                     | Client address behind proxies                 | Not used there                             | `cf-connecting-ip` (stage 1 seam)                                                                                                                 |
| `dotenv`                         | `.env` in development                         | Harmless but useless                       | Imported only by the Node entry (stage 2)                                                                                                         |
| `node:fs`                        | `package.json` version, plugin loader         | No                                         | The version as a build-time constant (stage 2). Plugins stay Node-only                                                                            |
| `node:crypto`                    | Hashes, HMAC, random codes, AI key encryption | Yes, with `nodejs_compat`                  | None needed. Stage 3 exercises it under `wrangler dev`                                                                                            |
| `node:events`                    | The event bus                                 | Yes, with `nodejs_compat`                  | None needed                                                                                                                                       |
| `bcryptjs`                       | Local passwords                               | Yes, pure JavaScript, cost 10              | None needed. Hosted Verba signs in through Accord, so it rarely runs                                                                              |
| `xlsx`, `fast-xml-parser`, `zod` | Import, XLIFF, validation                     | Yes                                        | None needed                                                                                                                                       |

## The Enterprise Edition and the images

- **The Worker includes `packages/ee`.** The API loads the Enterprise Edition with `import('@nubisco/verba-ee')`, and wrangler's bundler resolves that to the workspace package, so the hosted Worker carries it. The bundle is uploaded to Cloudflare and never published, so no proprietary code is distributed.
- **There is no Community Edition Worker.** Self-hosting on Workers is not supported (decided, Jose, 2026-11-03). Docker is the self-hosting story, and `wrangler.toml` describes Nubisco's hosted instance only.
- **The public Docker images stay.** `verba-api` (Community Edition, `EDITION=ce` by default) and `verba-ce` keep building for self-hosters on every release.
- **The private `verba-api-ee` image (PR #173) and the NAS deploy job go at cutover** (decided, Jose, 2026-11-03). Their only consumer is the NAS, and with no rollback window there is nothing to keep them for. The cutover removes the `build-ee` and `nas` jobs from `docker.yml`, and the private package can then be deleted.

## Secrets and settings

All set with `wrangler secret put` (secrets) or `[vars]` in `wrangler.toml` (settings), never in a tracked file. **Every secret can be new.** Nothing is copied from the NAS, so there are no sessions to keep (a new `JWT_SECRET` only means people sign in again on the new instance) and no stored AI provider keys to read (a new `AI_ENCRYPTION_KEY` seals the keys projects save from then on).

| Name                                                                                                                                                                      | Kind     | Note                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                                                                                                                              | Secret   | Signs sessions. Required.                                                                                                                                  |
| `AI_ENCRYPTION_KEY`                                                                                                                                                       | Secret   | Seals projects' AI provider keys.                                                                                                                          |
| `RESEND_API_KEY`                                                                                                                                                          | Secret   | One-time codes by email.                                                                                                                                   |
| `VERBA_LICENSES_SERVICE_TOKEN`                                                                                                                                            | Secret   | licenses' `SERVICE_TOKEN_VERBA` (plans-and-billing.md). Plans stay off until it is set.                                                                    |
| `VERBA_ENTITLEMENT_WEBHOOK_SECRET`                                                                                                                                        | Secret   | licenses' `ENTITLEMENT_WEBHOOK_SECRET_VERBA`.                                                                                                              |
| `OIDC_CLIENT_SECRET`                                                                                                                                                      | Secret   | If OIDC sign-in is used.                                                                                                                                   |
| `ANALYTICS_TOKEN`                                                                                                                                                         | Secret   | Server-side product analytics.                                                                                                                             |
| `NODE_ENV=production`, `ENABLE_EE=true`                                                                                                                                   | Var      |                                                                                                                                                            |
| `VERBA_OPERATORS`                                                                                                                                                         | Var      | Operator emails.                                                                                                                                           |
| `VERBA_LICENSES_URL`, `VERBA_SALES_URL`                                                                                                                                   | Var      | plans-and-billing.md.                                                                                                                                      |
| `PLATFORM_ISSUER`, `PLATFORM_APP_ID`, `PLATFORM_AUTH_ORIGIN`, `PLATFORM_SERVER_FLOW`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_SCOPES`, `OIDC_LABEL`, `OIDC_AUTO_PROVISION` | Var      | Sign-in through Accord.                                                                                                                                    |
| `MAIL_FROM`, `ANALYTICS_URL`, `ANALYTICS_DOMAIN`, `SESSION_TTL_HOURS`                                                                                                     | Var      |                                                                                                                                                            |
| `CORS_ORIGIN`, `TRUST_PROXY`, `PORT`, `DATABASE_URL`, `PLUGINS_DIR`, `SMTP_*`, `LICENSE_KEY`                                                                              | Not used | Same origin, Cloudflare's address header, a binding instead of a URL, no plugins, Resend only, and plans come from licenses rather than a self-hosted key. |

## Cutover

verba.nubisco.io is already proxied by Cloudflare, so the switch is a **Worker route on the existing hostname**, not a DNS change. A route takes effect in seconds, and no record, certificate or cached address is involved.

1. Create the D1 database (`wrangler d1 create verba`), put its id in `apps/api/wrangler.toml` in place of the placeholder, and apply its migrations (`wrangler d1 migrations apply verba --remote`). The deploy job applies them before every deploy from then on.
2. Set the secrets above with `wrangler secret put`.
3. Uncomment the route `verba.nubisco.io/*` in `wrangler.toml`, and deploy from a new `worker` job in the deploy workflow (with a `CLOUDFLARE_API_TOKEN` secret), as Acta's does. Check the `PLATFORM_*` vars against the NAS settings and set `VERBA_OPERATORS`.
4. Smoke test: sign in, a project, keys, a translation through the workflow, comments, notifications, an import, every export, a live update between two browsers, the account pages.
5. In the same change, remove the `build-ee` and `nas` jobs from `docker.yml`. The public images keep building. On the NAS, hosted Verba's containers can be stopped.

Plans switch on afterwards, when licenses has its Verba settings (plans-and-billing.md, "Switching it on"): set the two licenses secrets on the Worker and the URL in `[vars]`. Nothing else changes.

## Stages

Each stage is one pull request, stacked on the one before, and each can be reviewed and reverted on its own. Stages 1 to 3 change nothing for anyone using the NAS today.

| #   | Stage                                                                                                                                                                                                                                                                                                                                                                                                                                        | Ships to                  | Size              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------- |
| 1   | **Fastify to Hono, still on Node in Docker.** See below.                                                                                                                                                                                                                                                                                                                                                                                     | NAS, by the normal deploy | 1 to 2 days, done |
| 2   | **Portable on Node.** SheetJS in place of exceljs, fflate in place of archiver, `dotenv` and the version file read only by the Node entry, `defer()` for work after the response, a live-delivery interface (the in-process rooms on Node), a rate limiter interface with the Worker's per-minute numbers, the Prisma client chosen by the entry rather than at import, and a D1 migration history beside the PostgreSQL one, checked in CI. | NAS (no visible change)   | 2 days            |
| 3   | **The Worker, in local `wrangler dev`.** `src/worker.ts`, `wrangler.toml` (D1, static assets, the `LiveHub` Durable Object, rate limiting bindings, `nodejs_compat`), a Prisma client for workerd with the D1 adapter, and the `Origin` check and 30-minute re-sign-in on sockets that the fleet standard asks for. Proved end to end against a local D1, plans included. Nothing is created on Cloudflare.                                  | Nowhere (local only)      | 3 days            |
| 4   | **Cutover**, as above: the D1 database, the secrets, a `worker` deploy job, the route, and the NAS jobs and private image removed.                                                                                                                                                                                                                                                                                                           | verba.nubisco.io          | 1 day             |
| 5   | **Paid plans on.** The licenses settings on the Worker, once licenses is configured for Verba.                                                                                                                                                                                                                                                                                                                                               | Cloudflare                | Half a day        |

After those, one more piece of the live-delivery standard remains: frames that say what changed rather than carrying the content (a translation's text today), with the web app re-reading what a frame names. It touches the web app as well as the API, so it is its own change.

**Total: 7 to 9 working days, about 1 to 2 of them done.** The estimate assumes the D1 adapter handles Verba's queries without rewrites. If the parameter limit or the round trips force batching in imports, stage 3 grows by a day or two.

### Stage 1, as shipped

The API moved from Fastify 5 to Hono 4, served on Node by `@hono/node-server`, in the same Docker image with the same environment, the same routes and the same responses. What it covered:

- Every route, the session (the same HS256 tokens and cookie, so nobody is signed out), the read-only guard (`guardEveryWrite` puts it on every write route as it is registered, as Fastify's `onRoute` hook did), the sign-in rate limits (same numbers and windows), CORS, the 1 MiB body limit, multipart import, the error handler, the EE billing routes and the WebSocket rooms (`@hono/node-ws`).
- Every existing test passes, ported one to one: 368 in the API and 69 in the EE package, the same counts as before. The route tests use a small `inject()` helper with the shape of Fastify's, so their assertions did not change. Six new tests (`http.test.ts`) pin what the port had to rebuild by hand: the body limit, malformed JSON, unknown routes, the `/export/<locale>.json` path and uploads.
- The Fastify build and the Hono build were run side by side on SQLite and sent the same 74 requests (setup, sign-in, projects, locales, keys, translations through the workflow, comments, history, every export, imports, admin, CORS, WebSockets, rate limits). Status codes, bodies, cookies and headers matched, with these differences:
  - **An upload over 1 MiB is now refused** with 413 `request file too large`. Fastify cut such a file at 1 MiB without saying so and imported what was left, which loses rows silently.
  - JSON responses say `application/json` without `; charset=utf-8` (JSON is UTF-8 by definition), and empty 204 answers carry a `text/plain` type.
  - A refused cross-origin request now also gets `Access-Control-Allow-Credentials` (without `Access-Control-Allow-Origin`, so the browser still refuses it).
  - Request logs are one JSON line per request with method, path, status and time, rather than Fastify's pino lines.

Why this first: it is the largest change that is independent of Cloudflare, it is the precondition for everything after it (Fastify does not run on Workers), and it ships through the normal deploy with no data, DNS or infrastructure change.

### Stage 2, as shipped

Still Node, still the same Docker image, and nothing anyone using the NAS can see:

- **The Prisma client is chosen by the entry point.** `src/prisma.ts` holds it, the Node entry creates it with `src/prisma-node.ts` (PostgreSQL or SQLite from `DATABASE_URL`), and no other module imports a driver.
- **`dotenv` and `package.json`** are read by the Node entry only. `buildApp()` takes the version as an option.
- **`defer()`** (`src/defer.ts`) carries analytics events, and is where a Worker plugs in `waitUntil`.
- **`live()`** (`src/live.ts`) delivers live updates. On Node it is the in-process rooms, as before. A notification now names its project, so a Worker can find the account's Durable Object.
- **Rate limits** take a source: this process (unchanged on Node) or a Worker's bindings, with the per-minute numbers in `WORKER_RATE_LIMITS`.
- **Exports** are built with SheetJS (XLSX) and fflate (the split-by-namespace zip). The files hold the same sheets, rows and paths. `exceljs` and `archiver` are gone.
- **A D1 migration history**, `prisma/d1`, generated from the schema (`pnpm db:d1:new`), and checked against it in CI (`pnpm db:d1:check`) beside the PostgreSQL check.

### Stage 3, as shipped

The Worker runs hosted Verba end to end in local `wrangler dev`, against a local D1, with nothing created on Cloudflare:

- **`src/worker.ts`** copies the Worker's vars and secrets into `process.env` (the services read their settings there, as on Node), sets the workerd Prisma client with the D1 adapter, live delivery through the hub and the rate limiting bindings, and serves `/api` with the prefix removed, as nginx does in Docker. Everything else is the static web app.
- **A second Prisma generator** in `prisma/schema.prisma` builds the same client for workerd (`src/generated/prisma-worker`), which loads its query compiler as a WebAssembly module. Only the Worker imports it.
- **`LiveHub`** (`src/worker/live-hub.ts`), one Durable Object per account, holds every tab through the hibernation API, tagged by project and by person. It sends the frames the Node server sends, so the web app does not change. It closes a socket older than 30 minutes with 4001 the next time it would send to it, and the tab reconnects through the sign-in check. The Worker refuses a socket from another origin (403) and answers a plain GET with 426, as the fleet standard asks.
- **`wrangler.toml`** (`apps/api`): D1 with `migrations_dir = "prisma/d1"`, the assets with only `/api/*` waking the Worker, the hub, the seven rate limiting bindings (1201 to 1207, compared with the code by a test), `nodejs_compat`, the vars, and the secrets listed by name only. The D1 id is a placeholder and the route is commented out until the cutover.
- **CI** typechecks the Worker and bundles it with `wrangler deploy --dry-run`, which needs no credentials. The bundle is 1.7 MB gzipped.

Proved against the local Worker with a stand-in for the licenses service: the web app and a deep link, setup and password sign-in, two people in one account and project, presence and live edits between two sockets through the hub, a comment and a mention reaching the other person as a live notification, a refused socket without a session (1008) and from another origin (403), an import of 150 keys in two locales (past D1's 100 bound parameters, about two seconds), listing, search, history and kanban, every export, an XLIFF import and export, the billing page, checkout sent to nubisco.io, Free refusing a second project, a signed entitlement webhook moving the account to Pro and an unsigned one refused, removing someone from the account, and the one-time code limit refusing the third request in a minute.

**One known difference on D1:** Prisma's D1 adapter runs a transaction as separate statements (D1 has no transactions in this sense). Verba has one, removing a person from an account, which deletes their project memberships and then their account membership. If the second statement failed, the person would have lost the projects and kept the account, which a retry finishes. It is the safe direction, and the run above exercised it.

## Running the Worker locally

From `apps/api`, with `pnpm install` and `pnpm build` done at the root:

1. `cp .dev.vars.example .dev.vars` (local settings, never committed).
2. `pnpm exec wrangler d1 migrations apply verba --local`
3. `pnpm worker:dev`, then open http://localhost:8787 and run setup with an address in `VERBA_OPERATORS`.

To try plans locally, point `VERBA_LICENSES_URL` in `.dev.vars` at a stand-in for licenses that answers `GET /v1/entitlements/verba/:accountId`, and set the two other licenses lines. Everything stays in `.wrangler/` in the working copy. `--local` and `wrangler dev` never touch Cloudflare.

## Risks

- **Prisma on Workers.** The D1 adapter and the workerd build of the Prisma 7 client are newer than the PostgreSQL path. Stage 3 runs the whole app against them locally before anything depends on it.
- **Bundle size and cold starts.** Prisma's query compiler and SheetJS make a large Worker. It must fit the paid plan's limit, and a cold request must stay well inside the few seconds a webhook caller waits. Acta learned this the hard way: its migrations on every cold isolate took almost five seconds until it fingerprinted the schema. Verba applies D1 migrations with wrangler at deploy, never at request time.
- **Two migration histories.** Every schema change writes a PostgreSQL migration and a D1 one. CI checks both, but it is a permanent cost.
- **Behaviour that differs on SQLite**: case-insensitive search, and anything that relied on PostgreSQL-only behaviour the tests do not cover. Stage 3 walks the whole app for this reason.
- **Live frames carry content** until the follow-up above ships. That is how it works on the NAS today, so moving does not make it worse.

## Decisions

Taken by Jose on 2026-11-03:

1. **D1**, not PostgreSQL through Hyperdrive.
2. **Rate limits on Workers**: Cloudflare's limiter with per-minute numbers.
3. **Cutover is immediate.** Hosted Verba starts fresh on D1: no data migration, no write freeze, no dual writes, no read-only standby.
4. **At cutover**, the NAS deploy job and the private EE image from #173 are removed. The public Community Edition images stay for self-hosters.

Taken as proposed, unless Jose objects:

5. **Self-hosting on Workers** is not supported. Docker only.
6. **The import size limit** stays at 1 MiB, now refused clearly instead of cut silently.
7. **No R2** until a feature stores files.
