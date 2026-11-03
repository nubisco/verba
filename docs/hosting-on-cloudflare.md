---
layout: nubisco
title: 'Hosting on Cloudflare'
intro: "The plan for moving Nubisco's hosted Verba (verba.nubisco.io) from a Docker deployment on Nubisco's NAS to Cloudflare Workers, the way Acta runs, while the Docker image stays exactly what self-hosters run. Stage 1 is done. Everything marked **Proposal** is waiting for Jose's decision."
---

## Why, and what does not change

Jose decided on 2026-11-03 to port hosted Verba to Cloudflare first and only then switch on paid plans (the plans code is already merged, see [Plans and Billing](./plans-and-billing)). The NAS is becoming Nubisco's sandbox and staging machine, and a product that bills belongs on the platform the rest of the hosted fleet runs on.

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
- **Realtime** is a Durable Object per account holding that account's sockets, as AGENTS.md requires ("Getting it to an open tab now: live delivery", reference `acta/server/src/live-hub.ts`). An in-process room only reaches the tabs connected to the same isolate, which on Workers is not delivery.
- **Rate limits** use Cloudflare's rate limiting binding, with the in-memory limiter as the fallback, as in `acta/server/src/core/rateLimit.ts`.
- **Cron**: nothing needs one for parity. The first jobs that will (deleting Free accounts idle for 240 days, pruning expired one-time codes) get a `[triggers]` cron and a `scheduled` handler then, as Acta's does.
- **R2**: nothing needs it for parity, because Verba stores no files. **Proposal:** add an R2 bucket only when a feature stores a file: an asynchronous export too big for one response, or project avatars moved out of their rows.
- **`nodejs_compat`** is on. Unlike Acta, Verba uses `node:crypto`, `node:events` and `Buffer`, and reads its settings from `process.env`, which Workers fill from vars and secrets with that flag and a compatibility date after 2025-04-01.

## D1 or PostgreSQL through Hyperdrive

**Recommendation (Proposal): D1.**

|                | D1                                                                                                                                                  | PostgreSQL through Hyperdrive                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fits the fleet | Acta runs on D1.                                                                                                                                    | No other hosted Nubisco product does.                                                                                                                                                        |
| Platforms      | Cloudflare only.                                                                                                                                    | Needs a PostgreSQL somewhere: a new provider (a third platform, which AGENTS.md "Deployment" rules out without a reason), or the NAS through a tunnel, which keeps the NAS in every request. |
| Schema         | Already SQLite-compatible by design (ARCHITECTURE.md principle 5): enums are strings, lists are JSON in strings, and development runs SQLite today. | The production schema as it is.                                                                                                                                                              |
| Migrations     | A second, SQLite history beside the PostgreSQL one, both generated from the one schema and both checked in CI.                                      | The one history as it is.                                                                                                                                                                    |
| Cost           | Included in the Workers paid plan at Verba's size.                                                                                                  | The database host, plus Hyperdrive.                                                                                                                                                          |

What D1 changes, and how each is handled:

- **Transactions.** D1 has no interactive transactions. Verba uses only the batch form (`prisma.$transaction([...])`, once, in `account.service.ts`), which the adapter supports. A test in stage 3 keeps it that way.
- **Bound parameters.** D1 allows 100 per statement. Long `in` lists (a key's history over many translations, large imports) must be checked against the adapter in stage 3, and chunked where it does not.
- **Search.** Prisma's `contains` is case-sensitive on PostgreSQL and case-insensitive for ASCII on SQLite. Hosted key and people search becomes case-insensitive. That is arguably better, but it is a change, so the stage that ships it says so.
- **Size.** 10 GB per database. Hosted Verba is far below that. The size goes on the operator's checklist, as Acta's cron watches its own.
- **Round trips.** An import upserts row by row. On D1 every query is a round trip, so a 1,500-key import could take seconds. Stage 3 measures it and batches the writes if it needs to.

## One codebase, two runtimes

The rule from stage 1 on: **routes and services take everything through Hono's context and the seams below, never through Node.** `c.env.incoming` (the Node request) is read in one place, `rate-limits.ts`, to find the caller's address.

| Seam                    | Node (Docker)                                                                 | Worker                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| HTTP server             | `@hono/node-server` (`src/index.ts`)                                          | `export default { fetch }` (`src/worker.ts`)                                             |
| WebSockets              | `@hono/node-ws`, rooms in the process (`src/ws`)                              | The `LiveHub` Durable Object                                                             |
| Database                | `src/prisma.ts`: `adapter-pg` or `adapter-better-sqlite3` from `DATABASE_URL` | `adapter-d1` from the `DB` binding                                                       |
| Client address          | Socket and `X-Forwarded-For` behind trusted proxies (`TRUST_PROXY`)           | `cf-connecting-ip`                                                                       |
| Rate limits             | In-memory fixed window                                                        | The rate limiting binding, in-memory fallback                                            |
| Work after the response | Runs on its own                                                               | `executionCtx.waitUntil`, through a `defer()` seam like Acta's `setDeferrer`             |
| Plugins                 | Loaded from `PLUGINS_DIR`                                                     | None: the hosted instance runs no third-party plugins                                    |
| Start-up jobs           | After `listen`                                                                | None needed: the one there is (resealing old AI keys) has already run on the hosted data |

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
| `node:crypto`                    | Hashes, HMAC, random codes, AI key encryption | Yes, with `nodejs_compat`                  | None needed. Stage 4 runs the encryption tests under workerd to prove it                                                                          |
| `node:events`                    | The event bus                                 | Yes, with `nodejs_compat`                  | None needed                                                                                                                                       |
| `bcryptjs`                       | Local passwords                               | Yes, pure JavaScript, cost 10              | None needed. Hosted Verba signs in through Accord, so it rarely runs                                                                              |
| `xlsx`, `fast-xml-parser`, `zod` | Import, XLIFF, validation                     | Yes                                        | None needed                                                                                                                                       |

## The Enterprise Edition and the images

- **The Worker includes `packages/ee`.** Nubisco's `wrangler.toml` points `main` at an EE entry (`packages/ee/src/worker.ts`) that hands the EE module to the API's Worker factory, as Acta's does. The bundle is uploaded to Cloudflare and never published, so no proprietary code is distributed.
- **A Community Edition Worker entry** (`apps/api/src/worker.ts`) builds with `@nubisco/verba-ee` aliased to the same stub the CE image uses. **Proposal:** it exists so the code stays honest, but self-hosting on Workers is not documented or supported until someone asks for it. Docker is the self-hosting story.
- **The public Docker image stays CE.** `apps/api/Dockerfile` keeps `EDITION=ce` as its default and the public build does not change.
- **The private `verba-api-ee` image (PR #173)** has exactly one consumer, the NAS, and the NAS stops serving hosted Verba at cutover. **Proposal:** keep building and deploying it until the rollback window closes (stage 7), because the rollback target is the NAS running that image. Then remove the `build-ee` and `nas` jobs from `docker.yml` and delete the private package, or keep deploying it to the NAS as staging if Jose wants a staging Verba there.

## Secrets and settings

All set with `wrangler secret put` (secrets) or `[vars]` in `wrangler.toml` (settings), never in a tracked file. **Two of them must be copied from the NAS, not created:** a new `JWT_SECRET` signs every person out at cutover, and a new `AI_ENCRYPTION_KEY` makes every stored AI provider key unreadable.

| Name                                                                                                                                                                      | Kind     | Note                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                                                                                                                                              | Secret   | **The NAS value.** Sessions survive the move only if it is the same.                          |
| `AI_ENCRYPTION_KEY`                                                                                                                                                       | Secret   | **The NAS value.** Projects' AI keys are sealed with it.                                      |
| `RESEND_API_KEY`                                                                                                                                                          | Secret   | One-time codes by email.                                                                      |
| `VERBA_LICENSES_SERVICE_TOKEN`                                                                                                                                            | Secret   | licenses' `SERVICE_TOKEN_VERBA` (plans-and-billing.md).                                       |
| `VERBA_ENTITLEMENT_WEBHOOK_SECRET`                                                                                                                                        | Secret   | licenses' `ENTITLEMENT_WEBHOOK_SECRET_VERBA`.                                                 |
| `OIDC_CLIENT_SECRET`                                                                                                                                                      | Secret   | If OIDC sign-in is used.                                                                      |
| `LICENSE_KEY`                                                                                                                                                             | Secret   | Only if the hosted instance uses one today.                                                   |
| `ANALYTICS_TOKEN`                                                                                                                                                         | Secret   | Server-side product analytics.                                                                |
| `NODE_ENV=production`, `ENABLE_EE=true`                                                                                                                                   | Var      |                                                                                               |
| `VERBA_OPERATORS`                                                                                                                                                         | Var      | Operator emails.                                                                              |
| `VERBA_LICENSES_URL`, `VERBA_SALES_URL`                                                                                                                                   | Var      | plans-and-billing.md.                                                                         |
| `PLATFORM_ISSUER`, `PLATFORM_APP_ID`, `PLATFORM_AUTH_ORIGIN`, `PLATFORM_SERVER_FLOW`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_SCOPES`, `OIDC_LABEL`, `OIDC_AUTO_PROVISION` | Var      | Sign-in, as the NAS has them.                                                                 |
| `MAIL_FROM`, `ANALYTICS_URL`, `ANALYTICS_DOMAIN`, `SESSION_TTL_HOURS`                                                                                                     | Var      | As the NAS has them.                                                                          |
| `CORS_ORIGIN`, `TRUST_PROXY`, `PORT`, `DATABASE_URL`, `PLUGINS_DIR`, `SMTP_*`                                                                                             | Not used | Same origin, Cloudflare's address header, bindings instead of a URL, no plugins, Resend only. |

The values come from the NAS's `.env`, read on the NAS by Jose. The reference copy of the compose file in the private `infrastructure` repository names neither the EE image nor the licenses variables, so it is not a reliable list.

## Data migration

From the NAS PostgreSQL to D1, with a tool that ships in stage 5 (`apps/api/scripts/pg-to-d1.mjs`):

1. **Export.** Read every table through `pg` in foreign-key order and write one SQL file of `INSERT`s in SQLite syntax: booleans as 0 and 1, timestamps in the format Prisma's SQLite client reads, JSON strings as they are.
2. **Load.** `wrangler d1 execute verba --remote --file=<export>.sql` into a D1 that the SQLite migration history has just created empty.
3. **Verify.** Row counts per table, and a checksum per table over the ids and `updatedAt`, computed on both sides. Any difference stops the run.

**Dry run, as many times as it takes, before cutover:**

1. A `pg_dump` of the NAS database, restored into a scratch PostgreSQL on a laptop (nothing runs against production).
2. Export, load into a throwaway D1 (`verba-dryrun`), verify.
3. Point the staging Worker (stage 4) at it and walk the app: sign in, a project, keys, a translation through the workflow, comments, notifications, an import, every export format, the account and billing pages.
4. Delete the throwaway D1.

**Rollback** has two halves, because users may write on Cloudflare before a rollback:

- The route is removed and traffic is back on the NAS in seconds (see the next section).
- Anything written on D1 in the meantime is carried back by the reverse tool (`d1-to-pg.mjs`, also stage 5): `wrangler d1 export`, then upserts into PostgreSQL by id, newest `updatedAt` winning. It is rehearsed in the same dry run, against the scratch PostgreSQL.

## Cutover without downtime

verba.nubisco.io is already proxied by Cloudflare, which makes the switch a **Worker route on the existing hostname** rather than a DNS change. A route takes effect in seconds and is removed as quickly. No record is deleted, no certificate is issued, and no client caches an address.

1. **Freeze writes on the NAS.** **Proposal:** a maintenance flag (`VERBA_READ_ONLY=true`, stage 5) that refuses every write with a 503 and a plain sentence, while reading, exporting and signing in keep working. Expected length: 10 to 20 minutes. No outage, but no edits for that window. Doing better means writing to both databases for a while, which is not worth it at Verba's size.
2. Final export, load and verify, as in the dry run.
3. Add the route `verba.nubisco.io/*` to the Worker and deploy.
4. Smoke test as in the dry run, plus a live WebSocket between two browsers and a signed entitlement webhook from licenses (its URL, `https://verba.nubisco.io/api/billing/entitlement`, does not change).
5. Leave the NAS running, read-only, for the rollback window.

**Rollback:** remove the route (traffic returns to the NAS at once), carry any D1 writes back with the reverse tool, and lift the NAS freeze.

## Stages

Each stage ships on its own, changes nothing users can see unless it says so, and can be reverted on its own.

| #   | Stage                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ships to                                              | Reverted by                                   | Size                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- | ------------------------- |
| 1   | **Fastify to Hono, still on Node in Docker.** Done, see below.                                                                                                                                                                                                                                                                                                                                                                                 | NAS, by the normal deploy                             | Reverting the PR. Sessions survive both ways. | 1 to 2 days, done         |
| 2   | **Portable dependencies and seams, still on Node.** SheetJS for XLSX export, fflate for zips, nodemailer and dotenv only in the Node entry, the version as a constant, `defer()`, a live-delivery interface (in-process on Node) with frames that carry what changed and not the content, an `Origin` check and a 30-minute re-sign-in on sockets (the fleet standard), and a rate limiter interface. The web app re-reads what a frame names. | NAS                                                   | Reverting the PR                              | 2 to 3 days               |
| 3   | **SQLite and D1 ready, still on Node.** A SQLite migration history beside the PostgreSQL one, both checked in CI. The API's request script run against SQLite in CI. The D1 limits above tested and handled.                                                                                                                                                                                                                                   | NAS (no runtime change)                               | Reverting the PR                              | 2 to 3 days               |
| 4   | **The Worker, on staging.** `src/worker.ts`, the EE entry, `wrangler.toml` with D1, assets, the `LiveHub` Durable Object, rate limiting bindings and `nodejs_compat`, and a `worker` job in the deploy workflow aimed at a staging name. Proved on workerd (`wrangler dev`), including a write reaching another tab.                                                                                                                           | A staging Worker on a `workers.dev` address, empty D1 | Deleting the staging Worker                   | 3 to 4 days               |
| 5   | **Data tools and dry runs.** `pg-to-d1`, `d1-to-pg`, the checks, and the write-freeze flag. Two clean dry runs.                                                                                                                                                                                                                                                                                                                                | NAS (the flag only)                                   | Reverting the PR                              | 2 days                    |
| 6   | **Cutover**, as above.                                                                                                                                                                                                                                                                                                                                                                                                                         | verba.nubisco.io                                      | Removing the route, then the reverse tool     | Half a day, then watching |
| 7   | **After the rollback window.** Retire the NAS deploy for hosted Verba, decide the private image, keep a final PostgreSQL dump, then switch on paid plans with the licenses secrets on the Worker (plans-and-billing.md, "Switching it on").                                                                                                                                                                                                    | Cloudflare                                            | Each step on its own                          | 1 day                     |

**Honest total: 12 to 16 working days of build and review, plus the rollback window.** The estimate assumes the D1 adapter handles Verba's queries without rewrites. If the parameter limit or the round trips force batching in imports, stage 3 grows by two or three days.

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

## Risks

- **Prisma on Workers.** The D1 adapter and the `cloudflare` runtime of the Prisma 7 client are newer than the PostgreSQL path. Stage 3 runs Verba's own queries against them before anything depends on it.
- **Bundle size and cold starts.** Prisma's query compiler and SheetJS make a large Worker. It must fit the paid plan's limit, and a cold request must stay well inside the few seconds a webhook caller waits. Acta learned this the hard way: its migrations on every cold isolate took almost five seconds until it fingerprinted the schema. Measured in stage 4.
- **Two migration histories.** Every schema change writes PostgreSQL and SQLite migrations. CI checks both, but it is a permanent cost.
- **Behaviour that differs on SQLite**: case-insensitive search, and anything that relied on PostgreSQL-only behaviour the tests do not cover. The dry run walks the whole app for this reason.
- **Losing secrets at cutover.** A new `JWT_SECRET` or `AI_ENCRYPTION_KEY` would sign everyone out or lose every stored AI key. The checklist copies both from the NAS.
- **Writes during a rollback window.** Carried back by the reverse tool, which is rehearsed, but a rollback after a long window is real work.
- **Live frames change shape** in stage 2. The web app and the API ship together, but a tab left open across that deploy sees old frames until it reloads.

## Decisions for Jose

Every item marked **Proposal** above, gathered:

1. **D1** rather than PostgreSQL through Hyperdrive.
2. **Rate limits on Workers**: the binding with per-minute numbers (it only counts 10 or 60 seconds), equivalent to today's 15-minute ones, with the existing per-code attempt cap underneath. The alternative is exact 15-minute windows kept in a Durable Object.
3. **A 10 to 20 minute write freeze at cutover**, reading and exporting still working, rather than dual writes.
4. **The rollback window**: two weeks proposed, with the NAS read-only on standby.
5. **The private EE image and the NAS afterwards**: remove both jobs, or keep the NAS as a staging Verba.
6. **Self-hosting on Workers**: not documented or supported for now. Docker only.
7. **The import size limit**: keep 1 MiB, now refused clearly instead of cut silently, or raise it.
8. **R2**: not until a feature stores files.
