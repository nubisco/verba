# Core Concepts

Understanding Verba's data model and workflow makes the rest of the application immediately familiar. This glossary explains every core concept and how they relate to each other.

---

## Project

A **Project** is the top-level container for everything in Verba. It holds:

- A list of **locales** (languages) used by the project.
- A set of **namespaces** for organising keys.
- All **translation keys** and their **translations**.
- **Members** with their assigned roles and locale assignments.

Every resource in Verba belongs to exactly one project. Access control is scoped per project.

Projects display a **2-letter avatar** generated from the project name initials.

---

## Locale

A **Locale** is a language tag for one of the languages used by the project. Verba uses BCP-47 tags:

```
en        → English
pt-PT     → Portuguese (Portugal)
de        → German
zh-Hans   → Chinese (Simplified)
```

Locales are added in **Settings → Locales**. There is no built-in concept of a "source" language. All locales are peers in the data model.

---

## Namespace

A **Namespace** is a logical grouping of keys within a project, typically corresponding to a module or area of your application:

```
common      → Shared UI strings
auth        → Authentication screens
dashboard   → Dashboard-specific strings
emails      → Email templates
```

Namespaces serve two purposes:

1. **Organisation:** keep related keys together and easy to filter.
2. **Scoped assignment:** translators can be assigned to work on specific namespaces.

---

## Key

A **Key** is a flat string identifier for one piece of translatable text:

```
common.save_button
auth.login_title
errors.not_found_description
```

Keys are always stored as flat strings internally. The dot-notation is a convention, not a hierarchy. Nesting is applied at export time when producing JSON files for your application.

Keys are unique within a project.

---

## Translation

A **Translation** represents the value of one key in one locale. Every key × locale combination has its own translation record, which holds:

- The translated **text**.
- A **workflow status** (see below).
- The **assignee** (which user is responsible for this translation).
- The **user** who last updated it, and when.

A key with three locales (`en`, `pt-PT`, `de`) has three separate translation records.

---

## Translation States

Each translation moves through a defined workflow before it can be exported:

```
TODO → IN_PROGRESS → SUBMITTED → APPROVED
                  ↑               ↓
                  └───────────────┘  (rejected back to IN_PROGRESS)
```

| Status        | Meaning                       | Who can set it                        |
| ------------- | ----------------------------- | ------------------------------------- |
| `TODO`        | Not yet translated (default)  | System (initial state)                |
| `IN_PROGRESS` | Actively being worked on      | TRANSLATOR+ (automatic on first save) |
| `SUBMITTED`   | Ready for review              | TRANSLATOR+                           |
| `APPROVED`    | Accepted, eligible for export | MAINTAINER+                           |

**Automatic transition:** Saving a translation when its status is `TODO` automatically advances it to `IN_PROGRESS`. No manual status change is needed.

**Rejection:** A MAINTAINER can move `SUBMITTED` back to `IN_PROGRESS` to request revisions.

**Reopen:** A MAINTAINER can move `APPROVED` back to `IN_PROGRESS` if the approved string needs updating.

Only `APPROVED` translations are included in exports by default.

---

## Roles and Permissions

Verba uses role-based access control (RBAC) enforced on the server. Roles are assigned per project.

| Role         | Permissions                                                                     |
| ------------ | ------------------------------------------------------------------------------- |
| `READER`     | View translations, keys, comments, history                                      |
| `TRANSLATOR` | Edit translations, submit for review; READER permissions                        |
| `MAINTAINER` | Approve/reject translations, manage keys and namespaces; TRANSLATOR permissions |
| `ADMIN`      | Full project management (members, locales, settings); MAINTAINER permissions    |

**Global admin:** A user with `isGlobalAdmin: true` bypasses all project-level membership checks and has full access to every project.

---

## Locale Assignments

Within a project, each TRANSLATOR can be assigned a **subset of locales** they are responsible for. For example:

- Alice → `pt-PT`, `pt-BR`
- Bob → `de`, `at-DE`
- Carol → `fr`, `fr-CA`

Locale assignments affect:

- The **"My Languages"** tab in the translation editor, which shows only the translator's locales.
- The **Board**, where assigned tasks appear in the translator's swim lane.
- The **Dashboard**, where "My Active Tasks" shows tasks matching their assigned locales.

A translator can still view other locales under the **"Other Languages"** tab, but their personal workflow is focused on their assignments.

---

## Key References (`@:`)

Verba supports vue-i18n-style key references. A translation can embed another key's value:

```
@:common.app_name Settings
```

At runtime, `@:common.app_name` is replaced by the value of `common.app_name`. This avoids duplicating the app name across dozens of keys.

The translation editor highlights `@:key.name` syntax and provides **autocomplete** when you type `@:`. A **Preview panel** shows the resolved output with status indicators:

| Icon | Meaning                                        |
| ---- | ---------------------------------------------- |
| ✓    | Reference resolved successfully                |
| ⚠️   | Referenced key exists but translation is empty |
| ❌   | Referenced key does not exist                  |

When exporting, you can choose to **keep references raw** (let the i18n library resolve at runtime) or **resolve them** at export time (inline the referenced values).

---

## Placeholders (`{var}`)

Placeholders represent dynamic values injected into a string at runtime:

```
Hello, {name}! You have {count} unread messages.
```

The editor highlights `{variable}` syntax in a distinct colour. You can use the **Variable Test Values** panel at the bottom of the editor to enter test values and preview the rendered string. These test values are never exported.

---

## Plural Forms

Verba supports vue-i18n-style plural syntax using the `|` pipe character:

```
No items | One item | {count} items
```

Enable the **Plural Preview** toggle in the editor to render each variant side by side and verify all plural forms are correct.

---

## Comments

Every key has a **Comments** tab. Comments are **threaded** (unlimited nesting) so you can reply directly to a specific comment. Comments update in real time via WebSocket.

Use comments to:

- Provide context or clarifications for translators.
- Flag issues before rejecting a submission.
- Discuss alternative phrasings.

---

## History

Every key has a **History** tab showing a full, append-only timeline of all changes:

- Key created
- Translation text edited (before/after diff)
- Status transitions (who changed it, when)
- Assignments added or changed
- Comments posted

The history cannot be modified.

---

## Board

The **Board** visualises all translation tasks as cards:

- **Columns** represent workflow statuses (`TODO`, `IN_PROGRESS`, `SUBMITTED`, `APPROVED`).
- **Swim lanes** (rows) represent assignees: one lane per user, plus a Backlog lane for unassigned tasks.

Cards can be dragged:

- **Horizontally** to change status.
- **Vertically** to reassign to a different user.

The board supports filtering by user (avatar buttons) and by namespace (dropdown).

---

## Dashboard

The personal **Dashboard** is the landing page after login. It shows:

- **My Active Tasks**: translation tasks assigned to you, grouped by project.
- Quick links to jump to a specific board position.

---

## CLI (`verba`)

Verba ships with a command-line tool in `packages/cli/`:

| Command         | Description                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `verba setup`   | Interactive wizard: configure database, create admin user, generate `.env` |
| `verba migrate` | Run pending database migrations (for upgrades)                             |

The CLI is used during initial setup and when upgrading Verba to a new version.
