# Self-Hosting

Verba is designed to be self-hosted on your own infrastructure using Docker Compose.

## Quick Start (Docker Compose)

```bash
git clone https://github.com/nubisco/verba.git
cd verba

# Option A: interactive CLI wizard (recommended)
node packages/cli/dist/index.js setup

# Option B: manual
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env (set DATABASE_URL and JWT_SECRET at minimum)

docker compose up -d
```

The web UI is available at `http://localhost:3000` and the API at `http://localhost:4000`.

---

## CLI Setup Wizard

The bundled `verba` CLI (in `packages/cli/`) walks you through first-time configuration:

```bash
# from the repo root (after pnpm install && pnpm build)
node packages/cli/dist/index.js setup
```

The wizard:

1. Asks for database type: **SQLite** (zero-config) or **PostgreSQL** (recommended for teams)
2. Generates (or accepts) a JWT secret
3. Optionally configures SMTP for email / OTP delivery
4. Creates the initial admin user
5. Writes `apps/api/.env`
6. Creates the database schema (`prisma migrate deploy` on PostgreSQL, `prisma db push` on SQLite)

### Keeping the database schema up to date

**PostgreSQL** (every production install, and the Docker image) applies the
migration history in `apps/api/prisma/migrations` with
`prisma migrate deploy`. Each migration is SQL that was reviewed before it was
released, applied once, in order, and recorded in the `_prisma_migrations`
table. Nothing is ever dropped unless a migration says so in writing.

**SQLite** (development and single-server trials) has no migration history and
is brought in line with `prisma db push`.

**Docker:** nothing to run. The API container runs `prisma migrate deploy`
every time it starts, before it serves anything, and refuses to start if a
migration fails. Back up the database before you pull a new image anyway (see
[Data Backup](#data-backup)).

**From source:** after updating the code, run

```bash
node packages/cli/dist/index.js migrate
```

It reads `DATABASE_URL` from `apps/api/.env`. On PostgreSQL it runs
`prisma migrate deploy`. On SQLite it runs `prisma db push`, where a change that
would lose data stops with Prisma's warning and changes nothing. Back up the
database, then run it again with `--accept-data-loss` to apply it:

```bash
node packages/cli/dist/index.js migrate --accept-data-loss
```

### Moving an existing database onto migrations

Releases before the migration history created and updated the PostgreSQL
schema with `prisma db push` at start-up, so an existing database has the right
tables but no `_prisma_migrations` table. `migrate deploy` would then try to
create every table again and stop. Such a database is **baselined once**: you
tell Prisma that the first migration, `20261024000000_baseline`, is already in
place, and every later migration then applies normally.

Do this once, by hand, with the new image, **before** the API container starts
on it. The baseline only describes a database that the last `db push` release
brought fully up to date, so run the last `db push` release once first if you
skipped versions.

```bash
# 1. Stop the API so nothing writes during the change, and back up.
docker compose stop api
docker compose exec postgres pg_dump -U verba verba > backup_before_baseline_$(date +%Y%m%d).sql

# 2. Pull the new image without starting it.
docker compose pull api

# 3. Check the database is what the baseline expects. This is read only. It
#    prints the SQL that would bring the database to the new schema, which must
#    be exactly the migrations after the baseline (compare it with their
#    migration.sql files in apps/api/prisma/migrations), and nothing else.
docker compose run --rm --no-deps api \
  node_modules/.bin/prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script

# 4. Record the baseline as applied. This only writes to _prisma_migrations.
docker compose run --rm --no-deps api \
  node_modules/.bin/prisma migrate resolve --applied 20261024000000_baseline

# 5. Start the API. It applies the migrations after the baseline, then serves.
docker compose up -d api
```

If step 3 prints anything other than the post-baseline migrations, stop: the
database has drifted from the release it was last pushed by. Restore nothing
(nothing has changed yet) and ask for help on the issue tracker with the output.

---

## Environment Variables

Configure the API via environment variables in `apps/api/.env`:

| Variable                | Default                    | Description                                                        |
| ----------------------- | -------------------------- | ------------------------------------------------------------------ |
| `PORT`                  | `4000`                     | API listen port                                                    |
| `CORS_ORIGIN`           | `http://localhost:5173`    | Exact origin of your web frontend (no trailing slash)              |
| `DATABASE_URL`          | `file:./prisma/dev.db`     | Prisma connection string. SQLite for dev, Postgres for prod        |
| `JWT_SECRET`            | _(required in production)_ | Random 48-byte hex string. Rotate periodically                     |
| `ENABLE_LOCAL_PASSWORD` | `false`                    | Enable password login/register endpoints; CE defaults to OTP-only  |
| `DISABLE_LOCAL_OTP`     | `false`                    | Disable local OTP login                                            |
| `PLATFORM_ISSUER`       | _(unset)_                  | Nubisco Platform issuer URL. Required with `PLATFORM_APP_ID`       |
| `PLATFORM_APP_ID`       | _(unset)_                  | The app slug this deployment is registered under on Platform       |
| `OIDC_ISSUER`           | _(unset)_                  | OpenID Connect issuer URL. Required with `OIDC_CLIENT_ID`          |
| `OIDC_CLIENT_ID`        | _(unset)_                  | The client id your identity provider issued for Verba              |
| `OIDC_CLIENT_SECRET`    | _(unset)_                  | The client secret, for a confidential client                       |
| `OIDC_SCOPES`           | `openid email profile`     | Scopes requested at the provider                                   |
| `OIDC_LABEL`            | `single sign-on`           | What the sign-in button calls your provider                        |
| `OIDC_AUTO_PROVISION`   | `true`                     | Create a Verba user on first sign-in                               |
| `PUBLIC_API_URL`        | _(derived)_                | Public address of this API, if it is not `<web origin>/api`        |
| `PLATFORM_SERVER_FLOW`  | `false`                    | Run Platform sign-in server-side (register the new callback first) |
| `LICENSE_KEY`           | _(unset)_                  | Enterprise Edition licence; required for federated sign-in         |
| `SMTP_HOST`             | _(unset = log to stdout)_  | SMTP host for email / OTP delivery                                 |
| `SMTP_PORT`             | `587`                      | SMTP port                                                          |
| `SMTP_FROM`             | `noreply@verba.app`        | From address for outgoing email                                    |
| `SMTP_USER`             | _(optional)_               | SMTP username                                                      |
| `SMTP_PASS`             | _(optional)_               | SMTP password                                                      |
| `SMTP_SECURE`           | `false`                    | Set `true` for port-465 TLS                                        |

> **Development mode:** When `SMTP_HOST` is not set, OTP codes are printed to the API server's stdout log.

## Authentication Model

- **Community Edition default:** local email OTP, no passwords required
- **Optional transitional mode:** set `ENABLE_LOCAL_PASSWORD=true` if you need password login/register
- **Enterprise direction:** set `PLATFORM_ISSUER` to enable Nubisco Platform token verification alongside local auth

For CE, the first user can be bootstrapped without creating a permanent password.

### Platform SSO for EE

When both `PLATFORM_ISSUER` and `PLATFORM_APP_ID` are configured, the login screen exposes a **Continue with Nubisco Platform** action. Setting only the issuer is treated as a half-configured instance and the action stays hidden: the app id is the slug Platform knows your deployment by, it is not derivable from the product name, and sending the wrong one gets `unknown_app` back from Platform rather than a login screen. Nubisco's own instance is registered as `nubisco-verba`.

Find the slug in the Platform admin UI under **Apps**, and register this redirect URI for the same app:

```text
https://your-verba-domain.example/login
```

Platform redirects back to the login route with a short-lived token and `state`. Verba exchanges that token at `/auth/platform/callback`, creates its own local session cookie, and then redirects the user back into the app.

### OpenID Connect

Verba speaks the standard authorization-code flow, so any compliant provider works: Keycloak, Auth0, Okta, Microsoft Entra ID, Google Workspace, or anything else that publishes a discovery document. Everything but the issuer and the client is read from that document, so there is nothing else to configure.

> Federated sign-in is an Enterprise Edition feature and requires `LICENSE_KEY`. Local email one-time codes are Community Edition and are never gated, so an unlicensed instance always has a way in.

**1. Register Verba with your provider** as a web application (confidential client):

- **Redirect URI**: `https://verba.example.com/api/auth/sso/callback`
- **Grant type**: authorization code
- **Scopes**: `openid`, `email`, `profile`

**2. Configure Verba:**

```sh
OIDC_ISSUER=https://keycloak.example.com/realms/acme
OIDC_CLIENT_ID=verba
OIDC_CLIENT_SECRET=...
OIDC_LABEL=Acme SSO
```

The issuer is whatever hosts `/.well-known/openid-configuration`. Check it before restarting:

```sh
curl -s https://keycloak.example.com/realms/acme/.well-known/openid-configuration | jq
```

| Provider           | Issuer looks like                                    |
| ------------------ | ---------------------------------------------------- |
| Keycloak           | `https://host/realms/<realm>`                        |
| Auth0              | `https://<tenant>.eu.auth0.com/`                     |
| Okta               | `https://<tenant>.okta.com/oauth2/default`           |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| Google Workspace   | `https://accounts.google.com`                        |

Google does not send `email` unless the scope is requested, which is why `email` is in the default scope list. Verba refuses a sign-in whose token carries no email, because the email is how a token becomes a user.

**Who gets in.** `OIDC_AUTO_PROVISION=true` (the default) means anyone your provider vouches for becomes a Verba user on first sign-in; you already chose which users or groups may reach Verba when you registered the client. Set it to `false` to require that users exist in Verba first.

**What is checked.** Every sign-in verifies the **state**, bound to an httpOnly cookie, so the callback must belong to a sign-in this browser started; **PKCE (S256)**, so an intercepted authorization code cannot be exchanged by anyone but this browser; the **signature**, against the JWKS named in the discovery document, with one refetch on an unknown key id so provider key rotation does not lock you out; and the **issuer**, **expiry**, **audience** (the token was minted for your client and not another at the same provider) and **nonce** (the token belongs to this sign-in rather than an earlier one).

A failure sends the person to `/login?error=...`. The reason is written to the API log and never to the browser, because telling an attacker which half of a check failed is telling them how to pass it.

### Moving Platform sign-in server-side

Platform sign-in originally ran in the browser, which put a live token in the address bar. The server-side flow keeps it out of the page entirely, but it uses a different callback, so it is opt-in rather than automatic: an instance that already works must not be moved to a URI its provider has not been told about.

1. Register `https://verba.example.com/api/auth/sso/callback` as an additional redirect URI for your app in the Platform admin UI, alongside the existing `/login` one.
2. Set `PLATFORM_SERVER_FLOW=true` and restart.
3. Once nobody is mid-sign-in, the `/login` redirect URI can be removed.

If both OIDC and Platform sign-in are configured, OIDC wins.

---

## Database

### SQLite (development / small teams)

SQLite requires no extra infrastructure and stores everything in a single file. It is the default for local development.

```ini
DATABASE_URL=file:./prisma/dev.db
```

The file is created the first time the schema is pushed (`verba setup` or `verba migrate`).

### PostgreSQL (recommended for production)

For teams and production deployments, use PostgreSQL.

```ini
DATABASE_URL=postgresql://verba:strongpassword@db:5432/verba
```

The `docker-compose.yml` already defines a `db` Postgres service. To use it:

```bash
docker compose up -d
```

The API container waits for Postgres to report healthy, then applies any pending
migrations with `prisma migrate deploy` before it starts serving.

---

## Reverse Proxy

Do not expose the API directly on port 443. Place Verba behind a reverse proxy.

### Caddy (recommended, auto-TLS)

```
verba.example.com {
  reverse_proxy /api/* localhost:4000
  reverse_proxy * localhost:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    server_name verba.example.com;

    location /api/ {
        proxy_pass http://localhost:4000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://localhost:3000/;
    }
}
```

> **WebSocket support:** Verba uses WebSockets for real-time comment and history updates. Ensure your proxy passes `Upgrade` and `Connection` headers (shown above).

Set `CORS_ORIGIN=https://verba.example.com` in your `.env` when behind a proxy.

---

## Production Deployment Checklist

- [ ] `JWT_SECRET` is at least 32 random characters (never the default placeholder)
- [ ] `CORS_ORIGIN` is set to your exact production origin (no trailing slash)
- [ ] PostgreSQL password is strong and not publicly accessible
- [ ] API port (4000) is **not** directly accessible. Only the reverse proxy is
- [ ] HTTPS is enabled on the reverse proxy
- [ ] SMTP is configured (or users will need console access to retrieve OTP codes)
- [ ] Database is backed up regularly (see below)
- [ ] The database is backed up before each upgrade (the API image applies pending migrations when it starts)

---

## Upgrading Verba

```bash
# Pull the latest code
git pull

# Back up the database first: the new API image applies pending migrations on start
# (prisma migrate deploy). Upgrading from a release that used prisma db push?
# Baseline the database once first, see "Moving an existing database onto migrations".

# Pull the new images and restart. The API applies pending migrations as it starts.
docker compose pull
docker compose up -d
```

---

## Data Backup

### PostgreSQL

```bash
docker compose exec db pg_dump -U verba verba > backup_$(date +%Y%m%d).sql
```

Restore:

```bash
docker compose exec -T db psql -U verba verba < backup_20240101.sql
```

### SQLite

```bash
cp apps/api/prisma/dev.db backup_$(date +%Y%m%d).db
```

---

## Administration

### User Management

Global admins can access **Admin → Users** to:

- **Deactivate** a user: prevents login without deleting their work.
- **Delete** a user: permanently removes their account.
- View all registered users and their project memberships.

### Project Members

Project-level admins manage members in **Project → Settings → Members**:

- Add users with a specific role (ADMIN, MAINTAINER, TRANSLATOR, READER).
- Assign **locales** to translators so they only see their languages.
- Remove members from the project.

---

## Troubleshooting

| Symptom                    | Likely Cause                         | Fix                                                  |
| -------------------------- | ------------------------------------ | ---------------------------------------------------- |
| API returns 500 on startup | `JWT_SECRET` not set                 | Add `JWT_SECRET` to `.env`                           |
| CORS errors in browser     | `CORS_ORIGIN` mismatch               | Set exact origin (no trailing slash)                 |
| Migrations fail            | Database not reachable               | Check `DATABASE_URL` and DB service                  |
| OTP codes never arrive     | SMTP not configured                  | Set `SMTP_HOST` or check server logs                 |
| WebSocket disconnects      | Proxy not forwarding upgrade headers | Add `Upgrade` / `Connection` headers to proxy config |
| Docker build fails         | Stale node_modules                   | Run `docker compose build --no-cache`                |
