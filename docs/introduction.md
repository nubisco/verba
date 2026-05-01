# Introduction

Verba is an open-source, self-hostable i18n collaboration engine built for development teams that want structured, auditable translations without heavy SaaS tooling.

## Why Verba?

Most teams start with spreadsheets or shared JSON files committed to Git. This works for a while, but falls apart quickly:

- **No real workflow.** There is no distinction between a draft and an approved string.
- **No permissions.** Anyone can edit anything, in any language, even languages they don't speak.
- **No history.** Changes are invisible unless someone manually tracks them.
- **No coordination.** Who is translating what? Is that string still being worked on?
- **No pipeline.** Turning "the spreadsheet" into deployable JSON is a manual, error-prone job.

Verba makes translations **structured, reviewable, and deployable**.

## What Verba Is

Verba is a self-hosted web application that provides:

- A **project-based** workspace model with locales, namespaces, keys, and translations.
- A **four-stage workflow** (`TODO → IN_PROGRESS → SUBMITTED → APPROVED`) that separates drafts from production-ready strings.
- **Role-based access control** enforced on the server. Translators cannot approve their own work.
- **Per-user locale assignments.** A translator only sees and works on the languages they are responsible for.
- A **rich translation editor** with syntax highlighting for `{placeholders}` and `@:key.references`, autocomplete, live preview, plural form toggle, and a variable test panel.
- A **Board** with drag-and-drop task management, swim lanes by assignee, and inline filtering.
- **Threaded comments** and a full **history timeline** on every key.
- **Import** from JSON, CSV, or XLSX.
- **Export** to JSON, CSV, or XLSX, with optional resolution of `@:key` references.
- A full **audit trail** of every status change, assignment, edit, and comment.

## What Verba Is Not

Verba is intentionally minimal. It is **not**:

- A machine translation service.
- A SaaS platform with a marketplace.
- A version-control system for translation files (use Git for that).
- A build tool. Verba exports clean JSON; your build pipeline consumes it.

These are future extension points. The core is designed to remain stable and small.

## Core Philosophy

### Self-hosted first

Your translation data stays on your infrastructure. Verba has no telemetry, no cloud dependency, and no vendor lock-in. A single `docker compose up` is all you need to run it.

### Open source

Verba is MIT-licensed. You can inspect every line of code, contribute fixes, and fork it without restriction.

### Team collaboration without chaos

Translation is a team sport. Verba gives every team member a clear role, a clear queue of work, and a clear path from "not started" to "ready for production", without requiring everyone to be a developer.

### Server-enforced rules

Workflow transitions, role checks, and ACL are validated in the API. The frontend is a convenience layer; the rules cannot be bypassed by a crafty API call.

## Design Principles

- **Canonical full keys.** Keys live inside a namespace and are exposed consistently as `namespace.key`.
- **Server-enforced rules.** Workflow transitions and ACL are validated in the API; the frontend is a convenience layer.
- **Minimal surface area.** REST only, no GraphQL, no microservices.
- **SQLite first, Postgres ready.** Works locally with zero infrastructure; scales to Postgres in production.
- **OTP-first CE auth.** Community deployments default to local email OTP; enterprise deployments can layer Nubisco Platform on top.

## Key Features at a Glance

| Feature              | Description                                                                             |
| -------------------- | --------------------------------------------------------------------------------------- |
| Projects & locales   | Group keys by project; each project has its own set of languages                        |
| Namespaces           | Organise keys by feature/section; useful for large projects                             |
| Translation workflow | TODO → IN_PROGRESS → SUBMITTED → APPROVED, enforced on the server                       |
| Roles                | ADMIN, MAINTAINER, TRANSLATOR, READER, per project                                      |
| Locale assignments   | Each translator is assigned the specific locales they work on                           |
| Translation editor   | Rich editor with placeholder highlighting, key-reference autocomplete, and live preview |
| Board                | Visual task board with drag-and-drop, filters, and assignee swim lanes                  |
| Comments & history   | Threaded comments + full change timeline on every key                                   |
| Import               | Upload JSON files per namespace                                                         |
| Export               | JSON, CSV, or XLSX, with `@:key` reference resolution option                            |
| CLI installer        | `verba setup` wizard for first-time configuration                                       |
| Self-hostable        | Docker Compose + SQLite or Postgres                                                     |
