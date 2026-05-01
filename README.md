<div align="center">

  <br />

  <img src="docs/public/logo.svg" alt="Verba" width="96" />

  <br />

# Verba

**Open-source, self-hostable i18n collaboration engine. Structured, reviewable, and deployable translations, without enterprise bloat.**

[![CI](https://github.com/nubisco/verba/actions/workflows/ci.yml/badge.svg)](https://github.com/nubisco/verba/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/nubisco/verba)](https://github.com/nubisco/verba/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-339933)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-f69220)](https://pnpm.io/)
[![Docker](https://img.shields.io/badge/docker-ready-2496ed?logo=docker&logoColor=white)](https://hub.docker.com/r/nubisco/verba)
[![license](https://img.shields.io/github/license/nubisco/verba)](LICENSE)
[![Docs](https://img.shields.io/website?url=https%3A%2F%2Fdocs.nubisco.io%2Fverba%2F&label=docs)](https://docs.nubisco.io/verba/)

</div>

---

## Table of Contents

- [Verba](#verba)
  - [Table of Contents](#table-of-contents)
  - [Why Verba?](#why-verba)
  - [Features](#features)
  - [Quick Start](#quick-start)
    - [Local Development](#local-development)
  - [Self-Hosting with Docker](#self-hosting-with-docker)
  - [CLI](#cli)
  - [Core Concepts](#core-concepts)
  - [Documentation](#documentation)
  - [Contributing](#contributing)
  - [Support this project](#support-this-project)
  - [License](#license)
    - [Community Edition (CE)](#community-edition-ce)
    - [Enterprise Edition (EE)](#enterprise-edition-ee)
    - [Contributing](#contributing-1)

---

## Why Verba?

Most teams start with spreadsheets. This works for a while, but spreadsheets are a poor source of truth for collaborative translation:

- **Inconsistent schemas.** Columns shift, naming differs across sheets
- **No workflow.** No distinction between a draft and an approved string
- **No permissions.** Anyone can edit anything
- **No history.** Changes are invisible unless someone tracks them manually
- **No pipeline.** Turning "the spreadsheet" into deployable JSON is a manual job

Verba makes translations **structured, reviewable, and deployable**.

---

## Features

- **Projects & Namespaces.** Projects own locales, namespaces, keys, and memberships
- **Translation Workflow.** `TODO → IN_PROGRESS → SUBMITTED → APPROVED` enforced on the server
- **Role-Based ACL.** Admin / Maintainer / Translator / Reader roles with namespace-scoped write permissions
- **Import from JSON/CSV/XLSX.** Structured import with preview before applying
- **Export to JSON.** Canonical `namespace.key` output per locale; only approved translations included
- **Audit Log.** Every action logged with actor, timestamp, and before/after values
- **Comments.** Discuss keys before approving
- **Docker-first.** SQLite for development, Postgres for production

---

## Quick Start

### Local Development

**Prerequisites:** [Node.js](https://nodejs.org/) v20+ and [pnpm](https://pnpm.io/) v9+

```bash
# 1. Clone the repository
git clone https://github.com/nubisco/verba.git
cd verba

# 2. Install dependencies
pnpm install

# 3. Configure the API (defaults work out of the box)
cp apps/api/.env.example apps/api/.env

# 4. Create the database
pnpm --filter @nubisco/verba-api exec prisma migrate dev

# 5. Start both services
pnpm dev
```

| Service | URL                   |
| ------- | --------------------- |
| Web     | http://localhost:5173 |
| API     | http://localhost:4000 |

---

## Self-Hosting with Docker

The fastest way to run Verba is with Docker Compose. A **first-run setup wizard** guides you through creating the admin account on first visit.

```bash
git clone https://github.com/nubisco/verba.git
cd verba
cp .env.example .env          # edit JWT_SECRET at minimum
docker compose up -d
```

Then open **http://localhost**. You will be redirected to the setup wizard automatically.

Switch to Postgres for production by updating `DATABASE_URL` in your `.env`:

```ini
DATABASE_URL=postgresql://user:password@db:5432/verba
```

See the [Self-Hosting docs](https://docs.nubisco.io/verba/self-hosting) for the full guide, environment variables reference, and upgrade instructions.

---

## CLI

Install the Verba CLI to manage your instance from the terminal:

```bash
# npm (global install)
npm install -g @nubisco/verba-cli

# Homebrew (macOS / Linux)
brew tap nubisco/tap
brew install verba

# Or run without installing
npx @nubisco/verba-cli --help
```

**Commands:**

| Command         | Description                     |
| --------------- | ------------------------------- |
| `verba setup`   | Interactive first-run wizard    |
| `verba migrate` | Run pending database migrations |

---

## Core Concepts

| Concept       | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| **Project**   | Top-level workspace container for locales, namespaces, keys, and members       |
| **Namespace** | Logical grouping inside a project; keys belong to one namespace                |
| **Key**       | Stored as `name` within a namespace and exposed canonically as `namespace.key` |
| **Workflow**  | `TODO → IN_PROGRESS → SUBMITTED → APPROVED`, only ADMIN/MAINTAINER can approve |
| **ACL**       | Role-based, namespace-scoped, server-enforced                                  |

---

## Documentation

Full documentation is available at **[docs.nubisco.io/verba](https://docs.nubisco.io/verba/)**, including:

- [Introduction](https://docs.nubisco.io/verba/introduction)
- [Quick Start](https://docs.nubisco.io/verba/getting-started)
- [Self-Hosting](https://docs.nubisco.io/verba/self-hosting)
- [Core Concepts](https://docs.nubisco.io/verba/concepts)
- [Import & Export](https://docs.nubisco.io/verba/import-export)
- [Architecture](https://docs.nubisco.io/verba/architecture)

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and pull request guidelines.

Issues and pull requests are welcome. If you're proposing a large change, open an issue first to align on scope.

---

## Support this project

If Verba saves your team time, consider sponsoring development. Building and maintaining an open-source tool takes real effort. GitHub Sponsors helps ensure long-term support.

- ❤️ [Sponsor via GitHub](https://github.com/sponsors/joseporto)
- ⭐ [Star the repository](https://github.com/nubisco/verba)

---

## License

### Community Edition (CE)

The Verba Community Edition is licensed under the **[MIT License](LICENSE)**.  
You are free to use, modify, redistribute, and self-host it, even commercially.

### Enterprise Edition (EE)

Files under `packages/ee/` are **proprietary**. Copyright © Nubisco, All Rights Reserved.  
EE features (SSO/SAML, advanced audit logs, multi-tenancy) require a commercial license key.  
The source code is publicly visible for auditability, but may not be used in production  
without a valid key.

👉 **[See COMMERCIAL.md](COMMERCIAL.md)** for the full dual-licensing terms.

### Contributing

By submitting a pull request you agree to the **[Contributor License Agreement (CLA)](CLA.md)**,  
which grants Nubisco the right to include your contribution in both CE and EE.
