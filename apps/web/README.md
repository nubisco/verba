# Verba Web App

The frontend SPA for [Verba](https://github.com/nubisco/verba), the open-source translation management platform.

---

## Stack

|                   |                                           |
| ----------------- | ----------------------------------------- |
| Framework         | Vue 3 + TypeScript (`<script setup>`)     |
| Build             | Vite 8                                    |
| State             | Pinia                                     |
| Routing           | Vue Router 5 (module-based, auth-guarded) |
| i18n              | vue-i18n 11                               |
| UI                | @nubisco/ui                               |
| Error tracking    | Sentry (`@sentry/vue`)                    |
| Product analytics | PostHog (prod-only, disabled in dev)      |
| Package manager   | pnpm                                      |

---

## Development

**Prerequisites:** Node 20+, pnpm, backend running at `http://localhost:4000`.

```bash
pnpm install
pnpm dev        # dev server at http://localhost:5173
pnpm build      # production build
pnpm preview    # preview production build
pnpm test       # run tests
pnpm types:check
```

---

## Environment variables

Copy `.env.example` to `.env.local` for local overrides (gitignored). All `VITE_*` variables are inlined at build time.

| Variable            | Default                    | Purpose                                                                                                        |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`      | `http://localhost:4000`    | Backend API base URL                                                                                           |
| `VITE_POSTHOG_KEY`  | _(empty)_                  | PostHog project API key: leave empty to disable. Analytics are automatically skipped in dev regardless.        |
| `VITE_POSTHOG_HOST` | `https://eu.i.posthog.com` | PostHog ingestion host. Defaults to EU cloud. Use `https://us.i.posthog.com` for US or your own reverse proxy. |

Analytics are **automatically disabled in development**: the `initPostHog()` function checks `import.meta.env.PROD` before initializing.

---

## Deployment

### GitHub Actions / CI

Set the following in **Settings → Secrets and variables → Actions**:

| Kind     | Name                | Value                        |
| -------- | ------------------- | ---------------------------- |
| Variable | `VITE_API_URL`      | Production API URL           |
| Variable | `VITE_POSTHOG_HOST` | `https://eu.i.posthog.com`   |
| Secret   | `VITE_POSTHOG_KEY`  | Your PostHog project API key |

### Docker

The app ships with a `Dockerfile` and `nginx.conf`. Build and run:

```bash
docker build -t verba-web .
docker run -p 80:80 \
  -e VITE_API_URL=https://api.example.com \
  verba-web
```

> Note: `VITE_*` variables are inlined at build time by Vite. Pass them as build args rather than runtime env vars if building from scratch in Docker.

---

## Auth flow

Routes with `meta: { requiresAuth: true }` are guarded by a `router.beforeEach` hook that:

1. Redirects to `/setup` if the instance has never been configured
2. Calls `GET /auth/me` to verify session
3. Redirects to `/login?redirect=<original-path>` if unauthenticated

Login supports **password** and **magic link (OTP)** modes.

---

## Analytics events

PostHog events tracked out of the box:

| Event        | Fired when                                       |
| ------------ | ------------------------------------------------ |
| `Login`      | Successful password login (`method: 'password'`) |
| `Register`   | Successful registration (`method: 'password'`)   |
| `$pageview`  | Every route navigation (via `router.afterEach`)  |
| `$pageleave` | Page unload (PostHog built-in)                   |

User identity is set via `identifyUser()` on login/register and cleared via `resetUser()` on logout. Add further events with `trackEvent(name, props)` from `src/composables/useAnalytics.ts`.
