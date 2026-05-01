# Getting Started

This guide covers both **self-hosted production setup** (via Docker Compose) and **local development** from source.

## Self-Hosted Setup (Docker Compose)

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- A domain name or local IP for the web UI (optional for local testing)

### 1. Clone the repository

```bash
git clone https://github.com/nubisco/verba.git
cd verba
```

### 2. Run the setup wizard

Verba ships with an interactive CLI wizard that guides you through first-time configuration:

```bash
node packages/cli/dist/index.js setup
```

The `verba setup` wizard will:

1. Ask whether to use **SQLite** (simple, single-file) or **PostgreSQL** (recommended for teams)
2. Generate a secure random `JWT_SECRET`
3. Optionally configure **SMTP** for email / OTP login
4. Write `apps/api/.env` with all your settings
5. Run database migrations automatically

> **Tip:** If you prefer to configure manually, copy `apps/api/.env.example` to `apps/api/.env` and edit the values. See [Self-Hosting](./self-hosting) for the full variable reference.

### 3. Start the services

```bash
docker compose up -d
```

The web UI is available at `http://localhost:3000` and the API at `http://localhost:4000`.

On first run you will be prompted to create the initial admin account.

---

## Local Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+

```bash
npm install -g pnpm@9
```

### 1. Clone and install

```bash
git clone https://github.com/nubisco/verba.git
cd verba
pnpm install
```

### 2. Configure the API

```bash
cp apps/api/.env.example apps/api/.env
```

The defaults work out of the box for local development:

```ini
PORT=4000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=file:./dev.db
JWT_SECRET=change-me-in-production
```

### 3. Run database migrations

```bash
pnpm --filter @nubisco/verba-api exec prisma migrate dev
```

This creates `apps/api/prisma/dev.db` with the full schema.

### 4. Start the dev servers

```bash
pnpm dev
```

Both services start concurrently:

| Service | URL                   |
| ------- | --------------------- |
| Web     | http://localhost:5173 |
| API     | http://localhost:4000 |

---

## First Steps: Creating Your First Project

### 1. Create a project

After logging in, click **New Project** on the dashboard. Give the project a name. Verba will generate a 2-letter avatar from the initials automatically.

### 2. Add locales

Inside the project, go to **Settings → Locales** and add the languages you need. Use BCP-47 tags such as `en`, `pt-PT`, `de`, `ja`, etc.

```
en        → English (source language)
pt-PT     → Portuguese (Portugal)
de        → German
fr        → French
```

### 3. Add namespaces

Namespaces group related keys. Go to **Settings → Namespaces** and create at least one:

```
common      → Shared UI strings (buttons, labels)
auth        → Login, registration, password reset
dashboard   → Dashboard-specific strings
```

### 4. Add your first key

Go to **Translation Keys** and click **New Key**. Enter a flat key name and choose the namespace:

```
Key:       common.welcome_message
Namespace: common
```

Keys are always flat strings internally. The dot-notation is a convention, not a hierarchy.

### 5. Assign translators

Go to **Settings → Members** to:

1. Invite users (or add existing users) to the project with a role.
2. Assign specific **locales** to each translator so they only see their languages.

| Role       | What they can do                  |
| ---------- | --------------------------------- |
| ADMIN      | Full project management           |
| MAINTAINER | Approve translations, manage keys |
| TRANSLATOR | Edit and submit translations      |
| READER     | Read-only access                  |

### 6. Start translating

Translators can now:

1. Navigate to **Translation Keys** and click a key to open the editor.
2. Select their assigned locale tab (or "My Languages" to see only their locales).
3. Enter the translation and click **Save**. Status moves from `TODO` to `IN_PROGRESS` automatically.
4. Click **Submit for Review** when ready. Status moves to `SUBMITTED`.

A maintainer or admin then reviews and approves.

---

## Project Structure (for developers)

```
verba/
├── apps/
│   ├── api/          # Node.js + Fastify backend
│   └── web/          # Vue 3 frontend
├── packages/
│   ├── shared/       # Shared TypeScript types
│   └── cli/          # verba setup / verba migrate CLI
└── docs/             # This documentation (VitePress)
```

## Useful Commands

| Command                                                    | Description                    |
| ---------------------------------------------------------- | ------------------------------ |
| `pnpm dev`                                                 | Start all services (API + web) |
| `pnpm build`                                               | Build all packages             |
| `pnpm --filter @nubisco/verba-api test`                    | Run API tests                  |
| `pnpm --filter @nubisco/verba-api exec prisma migrate dev` | Run DB migrations (dev)        |
| `pnpm docs:dev`                                            | Start docs dev server          |
| `node packages/cli/dist/index.js setup`                    | Run the setup wizard           |
| `node packages/cli/dist/index.js migrate`                  | Run migrations (production)    |

## Next Steps

- [Core Concepts](./concepts): understand projects, namespaces, workflow, and roles
- [Workflow Guide](./workflow): day-to-day translation flow for all team members
- [Import & Export](./import-export): bring in existing translations and export for production
- [Self-Hosting](./self-hosting): production deployment, environment variables, and upgrades
