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
6. Runs `prisma migrate deploy`

### Running Migrations

When upgrading Verba to a new version, run pending migrations:

```bash
node packages/cli/dist/index.js migrate
```

This is equivalent to `prisma migrate deploy` but uses the correct connection string automatically.

---

## Environment Variables

Configure the API via environment variables in `apps/api/.env`:

| Variable                | Default                    | Description                                                       |
| ----------------------- | -------------------------- | ----------------------------------------------------------------- |
| `PORT`                  | `4000`                     | API listen port                                                   |
| `CORS_ORIGIN`           | `http://localhost:5173`    | Exact origin of your web frontend (no trailing slash)             |
| `DATABASE_URL`          | `file:./prisma/dev.db`     | Prisma connection string. SQLite for dev, Postgres for prod       |
| `JWT_SECRET`            | _(required in production)_ | Random 48-byte hex string. Rotate periodically                    |
| `ENABLE_LOCAL_PASSWORD` | `false`                    | Enable password login/register endpoints; CE defaults to OTP-only |
| `DISABLE_LOCAL_OTP`     | `false`                    | Disable local OTP login                                           |
| `PLATFORM_ISSUER`       | _(unset)_                  | Enable Nubisco Platform token verification for delegated auth     |
| `SMTP_HOST`             | _(unset = log to stdout)_  | SMTP host for email / OTP delivery                                |
| `SMTP_PORT`             | `587`                      | SMTP port                                                         |
| `SMTP_FROM`             | `noreply@verba.app`        | From address for outgoing email                                   |
| `SMTP_USER`             | _(optional)_               | SMTP username                                                     |
| `SMTP_PASS`             | _(optional)_               | SMTP password                                                     |
| `SMTP_SECURE`           | `false`                    | Set `true` for port-465 TLS                                       |

> **Development mode:** When `SMTP_HOST` is not set, OTP codes are printed to the API server's stdout log.

## Authentication Model

- **Community Edition default:** local email OTP, no passwords required
- **Optional transitional mode:** set `ENABLE_LOCAL_PASSWORD=true` if you need password login/register
- **Enterprise direction:** set `PLATFORM_ISSUER` to enable Nubisco Platform token verification alongside local auth

For CE, the first user can be bootstrapped without creating a permanent password.

### Platform SSO for EE

When `PLATFORM_ISSUER` is configured, the login screen exposes a **Continue with Nubisco Platform** action.

Register this redirect URI in Platform for your Verba app:

```text
https://your-verba-domain.example/login
```

Platform redirects back to the login route with a short-lived token and `state`. Verba exchanges that token at `/auth/platform/callback`, creates its own local session cookie, and then redirects the user back into the app.

---

## Database

### SQLite (development / small teams)

SQLite requires no extra infrastructure and stores everything in a single file. It is the default for local development.

```ini
DATABASE_URL=file:./prisma/dev.db
```

The file is created automatically on first migration.

### PostgreSQL (recommended for production)

For teams and production deployments, use PostgreSQL.

```ini
DATABASE_URL=postgresql://verba:strongpassword@db:5432/verba
```

The `docker-compose.yml` already defines a `db` Postgres service. To use it:

```bash
# Start only the database first
docker compose up -d db

# Run migrations against it
docker compose exec api npx prisma migrate deploy

# Start all services
docker compose up -d
```

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
- [ ] `verba migrate` is run after each upgrade

---

## Upgrading Verba

```bash
# Pull the latest code
git pull

# Rebuild Docker images
docker compose pull
docker compose build

# Apply any pending migrations
docker compose exec api node /app/packages/cli/dist/index.js migrate
# or: docker compose exec api npx prisma migrate deploy

# Restart all services
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
