# Nubisco Verba: Architecture

Nubisco Verba is an open-source, self-hostable i18n collaboration engine.

This document defines:

- Core data model
- Workflow rules
- Access control model
- Event & plugin architecture
- MVP boundary
- Architectural principles

---

# 1. Architectural Principles

1. **Canonical full keys, normalized storage**
   - A key belongs to exactly one namespace.
   - Storage is normalized as `Namespace + Key.name`.
   - API and export surfaces expose the canonical full key as `namespace.key`.

2. **Server-enforced rules**
   - Workflow and ACL are enforced in the API layer.
   - The frontend is a convenience layer only.

3. **Minimal surface area**
   - No GraphQL.
   - No microservices.
   - No over-abstraction.
   - Simple REST + service layer.

4. **Plugin-ready, not plugin-heavy**
   - Core must function without plugins.
   - Plugins extend behavior via events.

5. **SQLite first, Postgres ready**
   - SQLite for dev & simple deployments.
   - Postgres for production.
   - MongoDB is out of MVP scope.

---

# 2. High-Level Architecture

Vue 3 Frontend → Fastify API → Prisma → SQLite/Postgres
↓
Event Bus
↓
Plugins

- The API is the source of truth.
- The event bus emits domain events.
- Plugins subscribe to events.
- Plugins cannot bypass ACL.

---

# 3. Core Data Model

## Project

Container for locales, namespaces, and keys.

For EE deployments, an Organization may own multiple projects. In CE, the project is the top-level workspace.

## Locale

- Unique per project.
- Example: `en`, `pt-PT`, `de`.

## Namespace

Logical grouping (e.g. `dashboard`, `auth`, `marketing`).
Used for permissions and organization.

## Key

- Stored as a name inside one namespace.
- Unique per namespace.
- Exposed canonically as `namespace.key`.
- Example:
  - `app.menu.file`
  - `alerts.low_wind.title`

## Translation

Represents one key in one locale.

Fields:

- text
- status
- version
- updatedBy

Unique constraint:
(keyId, localeId)

## 3.6 Workflow Status

TODO → IN_PROGRESS → SUBMITTED → APPROVED

**Rules:**

- Only ADMIN or MAINTAINER can approve.
- Invalid transitions are rejected.
- Version increments when text changes.

## 3.7 Membership & Roles

**Roles:**

- ADMIN
- MAINTAINER
- TRANSLATOR
- READER

**Permissions:**

- ACL enforced server-side.
- Namespace-scoped write permissions supported.

## 3.8 Authentication Modes

- **CE default:** local OTP authentication
- **Optional local mode:** password login for transitional/self-managed installs
- **EE direction:** Nubisco Platform delegated authentication and authorization

Platform-backed EE must still enforce Verba project and namespace authorization locally.

---

# 4. Workflow Engine

The workflow is deterministic.

## 4.1 Allowed Transitions

- TODO → IN_PROGRESS
- IN_PROGRESS → SUBMITTED
- SUBMITTED → APPROVED

## 4.2 Rules

- APPROVED can only be set by ADMIN/MAINTAINER.
- Status change emits events.
- All transitions logged in AuditLog.

---

# 5. Import System

## 5.1 Supported Formats

- CSV
- XLSX

## 5.2 Flow

1. Upload file.
2. Map columns:
   - key column
   - namespace (optional)
   - locale columns
3. Preview diff.
4. Apply import.

## 5.3 ImportRun Tracking

ImportRun tracks:

- mapping
- stats
- errors

Colors or formatting from spreadsheets are ignored by default.

---

# 6. Export System

## 6.1 Primary Export

- Flat JSON per locale.

### Example:

```json
{
  "app.menu.file": "File",
  "app.menu.edit": "Edit"
}
```

## 6.2 Rules

- Only APPROVED translations exported by default.
- Deterministic ordering.

---

# 7. Event System

Verba emits internal domain events.

## 7.1 Examples

- translation.updated_text
- translation.status_changed
- translation.approved
- key.created
- import.applied

## 7.2 Event Structure

Each event contains:

- projectId
- actorUserId
- timestamp
- payload data

Events are emitted after successful domain operations.

# 8. Plugin Architecture

## 8.1 Plugin Overview

Plugins:

- Loaded from /plugins directory.
- Registered via register(context) function.
- Subscribe to events.
- Cannot bypass ACL.
- Cannot directly mutate DB (must use services).

Plugin context exposes:

- events.on(...)
- logger
- limited service layer
- config

## 8.2 Plugin Failures

Plugin failures must:

- Not crash the server.
- Be logged safely.

# 9. Service Layer

All business logic must pass through a service layer.

## 9.1 Example Services

- translationService
- projectService
- importService
- auditService

## 9.2 Service Responsibilities

- enforce ACL
- validate workflow transitions
- emit events
- write audit logs

Controllers must not directly call Prisma.

# 10. MVP Boundary

## 10.1 Included

- Projects
- Namespaces
- Flat keys
- Locales
- Workflow
- ACL
- Comments
- Audit log
- CSV/XLSX import
- JSON export
- Docker deployment

## 10.2 Excluded

- AI features
- MT integrations
- SSO
- Glossary enforcement
- Branching/versioning
- Webhooks
- Marketplace
- Real-time collaboration

# 11. Future Extension Points

## 11.1 Planned Extensions

- Webhook plugin
- AI suggestion plugin
- Translation memory plugin
- SSO plugin
- Analytics plugin

Core must remain stable and minimal.
