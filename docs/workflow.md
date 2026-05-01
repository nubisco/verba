# User Workflow Guide

This guide covers the day-to-day translation workflow for all roles, from creating keys to approving and exporting translations.

## Roles at a Glance

| Role           | What they can do                                                         |
| -------------- | ------------------------------------------------------------------------ |
| **READER**     | View translations and history                                            |
| **TRANSLATOR** | Edit translations and submit for review; work on assigned locales        |
| **MAINTAINER** | Everything a Translator can do + approve/reject submissions, manage keys |
| **ADMIN**      | Full project management: members, locales, namespaces, keys, approvals   |

---

## Translation Lifecycle

Every translation for a key + locale pair goes through a defined pipeline:

```
TODO → IN_PROGRESS → SUBMITTED → APPROVED
                  ↑               ↓
                  └───────────────┘  (MAINTAINER rejects → back to IN_PROGRESS)
                                     (MAINTAINER reopens APPROVED → IN_PROGRESS)
```

| Status        | Meaning                                         |
| ------------- | ----------------------------------------------- |
| `TODO`        | Not yet translated (default state for new keys) |
| `IN_PROGRESS` | A translator is actively working on it          |
| `SUBMITTED`   | Ready for review, awaiting approval             |
| `APPROVED`    | Reviewed and accepted, eligible for export      |

> **Automatic transitions:** Saving a translation when its status is `TODO` automatically advances it to `IN_PROGRESS`. You do not need to manually change the status first.

---

## Creating Keys

Keys represent individual pieces of translatable text.

1. Go to **Translation Keys** in the left sidebar.
2. Click **New Key**.
3. Enter a flat key name and select a namespace:
   ```
   common.save_button
   auth.login_title
   errors.not_found
   ```
4. Optionally add a description or context note to help translators understand the string.

Keys are stored as flat strings internally. The dot-notation is a convention for organisation, not a hierarchical structure.

### Namespaces

Namespaces group related keys. Create namespaces in **Settings → Namespaces**. Common examples:

| Namespace   | Usage                                         |
| ----------- | --------------------------------------------- |
| `common`    | Shared UI strings (buttons, labels, tooltips) |
| `auth`      | Login, registration, password reset           |
| `dashboard` | Dashboard-specific strings                    |
| `errors`    | Error messages                                |
| `emails`    | Email templates                               |

---

## Assigning Keys to Translators

Translation tasks (also called **tickets**) can be assigned to specific users per locale.

1. Open a key from the key list.
2. In the key detail view, find the locale you want to assign.
3. Use the **Assignee** dropdown to select a team member.

Assigned translators will see their tasks on the **Board** in their own swim lane and in the **My Active Tasks** section of their dashboard.

> **Locale assignments:** A user's locale assignment (set in project settings) determines which locales they see in the **"My Languages"** tab. The "Other Languages" tab shows all remaining locales.

---

## Using the Translation Editor

Click any key in the key list to open the full editor view.

### Layout Options

Toggle between **side-by-side** (locales shown in columns) and **stacked** (locales shown vertically) using the layout button in the top-right of the editor.

### Entering Translations

1. Select the locale tab (or use **My Languages** to filter to your assignments).
2. Type or paste your translation in the editor.
3. **Auto-save** kicks in after ~1.5 seconds of inactivity. No save button needed.
4. Starting to type on a `TODO` translation **automatically moves it to `IN_PROGRESS`**.
5. Click **Submit for Review** when you are satisfied. Status moves to `SUBMITTED`.

### Placeholders `{var}`

The editor highlights `{variable}` placeholders in a distinct colour. These represent dynamic values injected at runtime (e.g. `{name}`, `{count}`).

```
Hello, {name}! You have {count} unread messages.
```

Use the **Variable Test Values** panel (bottom of the editor) to enter test values and preview the rendered output without affecting the exported translation.

### Key References `@:key`

Verba supports vue-i18n-style key references, strings that reuse another key's value:

```
@:common.app_name Settings
```

The editor highlights `@:key.name` syntax and provides **autocomplete**. Start typing `@:` and a dropdown lists all keys in the project.

The **Preview** panel shows the resolved output with a status indicator:

| Icon | Meaning                                            |
| ---- | -------------------------------------------------- |
| ✓    | Reference resolved successfully                    |
| ⚠️   | Referenced key exists but the translation is empty |
| ❌   | Referenced key does not exist                      |

### Plural Forms

For strings with plural variations (vue-i18n `|` pipe syntax), enable the **Plural Preview** toggle to see each form rendered separately:

```
No items | One item | {count} items
```

The preview renders each variant so you can verify all plural forms look correct.

---

## Using the Board

The **Board** gives a visual overview of all translation tasks in the project.

### Board Layout

- **Columns (horizontal):** Translation statuses (`TODO`, `IN_PROGRESS`, `SUBMITTED`, `APPROVED`)
- **Rows (swim lanes, vertical):** One lane per assignee + a **Backlog** lane for unassigned tasks

### Drag and Drop

- **Drag a card horizontally** to change its status.
- **Drag a card vertically** (to a different swim lane) to reassign it to another user.

### Filtering

- **User filter avatars** (top bar): click a user's avatar to show only their cards.
- **Namespace dropdown**: filter cards to a specific namespace.

### Card Actions

- **Single click** a card → opens the **Inspector panel** on the right side (quick details without leaving the board).
- **Double click** a card → opens the full **key detail modal** with the complete editor.
- Selected cards are highlighted on the board.

---

## Reviewing and Approving Translations

> **Required role:** MAINTAINER or ADMIN

### Review Queue

Navigate to **Review Queue** from the project sidebar. It shows all translations in `SUBMITTED` status, including who submitted them.

### Approving

Click **✓ Approve** to accept the translation. Status moves to `APPROVED`.  
Optionally click **💬 Add note** to leave a comment (visible in the key's Comments tab) before approving.

### Rejecting (Sending Back)

Click **↩ Send back** to return the translation to `IN_PROGRESS`.  
Click **💬 Add note** first to explain what needs to change. The translator will receive a notification and see your comment in the key detail view.

### Reviewing from the Board

You can also review from the Board:

1. Look at the `SUBMITTED` column.
2. Click a card to open the Inspector panel, or double-click for the full modal.
3. Use the Approve/Send back buttons directly in the inspector/modal.

### Reopening an Approved Translation

Open the key detail and click **Reopen**. It moves back to `IN_PROGRESS`.

---

## Comments and History

### Comments

Every key has a **Comments** tab. Comments are threaded (unlimited nesting), so you can reply directly to a specific comment.

Use comments to:

- Clarify the meaning or context of a string for translators.
- Flag issues with a translation before rejecting it.
- Discuss alternatives.

Comments update in **real time** via WebSocket. All team members viewing the same key see new comments immediately.

### History

Every key has a **History** tab showing a full timeline of all changes:

- Key created
- Translation text edited (with before/after)
- Status transitions (who changed it, when)
- Assignments added or changed
- Comments posted

The history is append-only and cannot be modified.

---

## Dashboard

The personal **Dashboard** shows:

- **My Active Tasks**: translation tasks assigned to you, grouped by project.
- Quick links to jump directly to a specific position on the Board.

This gives translators a clear view of what needs their attention without having to navigate through projects manually.

---

## Exporting for Production

Once translations are approved, export them from the project:

1. Go to **Export** in the project sidebar.
2. Choose the format: **JSON**, **CSV**, or **XLSX**.
3. Optionally enable **Resolve `@:key` references** to inline referenced values.
4. Download the file(s).

See [Import & Export](./import-export) for full details on formats and CI integration.

---

## Profile & Password

Click your email address in the top navigation to open your profile page. From there you can:

- Change your email address.
- Set a new password (requires your current password).

## OTP / Passwordless Login

If you prefer not to use a password:

1. On the login page click **Magic link**.
2. Enter your email and click **Send code**.
3. Enter the 6-digit code from your email (valid for 15 minutes).

> **Development mode:** When SMTP is not configured, the OTP code is printed to the API server's stdout log.
