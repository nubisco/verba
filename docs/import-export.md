# Import & Export

Verba provides structured pipelines for bringing existing translations in and for exporting production-ready translations out.

---

## Import

### Supported Format

Verba imports **JSON files** organised by namespace. Each top-level key in the JSON becomes (or matches) a namespace; nested keys become translation keys.

```json
{
  "common": {
    "save_button": "Save",
    "cancel_button": "Cancel",
    "welcome_message": "Hello, {name}!"
  },
  "auth": {
    "login_title": "Sign in to your account",
    "logout_button": "Sign out"
  }
}
```

Each nested key is flattened to `namespace.key` internally:

| JSON path            | Stored key           |
| -------------------- | -------------------- |
| `common.save_button` | `common.save_button` |
| `auth.login_title`   | `auth.login_title`   |

### How to Import

1. Go to your project and click **Import** in the sidebar.
2. Select the **locale** you are importing for (e.g. `en`).
3. Upload the JSON file.
4. Click **Apply** to confirm.

> **Note:** Existing translations for the same key + locale are updated, not duplicated. Imported translations start at `IN_PROGRESS` status. They must go through the normal review workflow before they are eligible for export.

### Namespace Creation

Namespaces referenced in the import file are created automatically if they do not already exist in the project.

---

## Export

Verba can export translations in three formats. Only **`APPROVED`** translations are included by default.

### Export Formats

| Format | Extension | Best for                                           |
| ------ | --------- | -------------------------------------------------- |
| JSON   | `.json`   | Direct use in JavaScript/TypeScript apps           |
| CSV    | `.csv`    | Sharing with non-technical stakeholders            |
| XLSX   | `.xlsx`   | Review in spreadsheet tools (Excel, Google Sheets) |

### JSON Export

The JSON export produces one file per locale with flat key → value pairs:

```json
{
  "common.save_button": "Save",
  "common.cancel_button": "Cancel",
  "auth.login_title": "Sign in to your account"
}
```

Keys are exported in a deterministic order (consistent diffs when committed to version control).

If your application expects **nested JSON**, convert flat keys at build time. Most i18n libraries (vue-i18n, i18next, react-intl) accept either format, or you can use a small utility:

```js
// Flatten → nested conversion utility example
function nestKeys(flat) {
  return Object.entries(flat).reduce((acc, [key, value]) => {
    key.split('.').reduce((node, part, i, parts) => {
      if (i === parts.length - 1) node[part] = value
      else node[part] ??= {}
      return node[part]
    }, acc)
    return acc
  }, {})
}
```

### CSV Export

The CSV export has one row per key, with a column for each locale:

```
key,en,pt-PT,de
common.save_button,Save,Guardar,Speichern
auth.login_title,Sign in to your account,Entrar na sua conta,Bei Ihrem Konto anmelden
```

### XLSX Export

Same structure as CSV, but in Excel format with proper column widths. Useful for handing off to translation agencies or non-technical reviewers.

### How to Export

1. Go to your project and click **Export** in the sidebar.
2. Select the **locale(s)** to export (or all locales).
3. Choose the **format**: JSON, CSV, or XLSX.
4. Optionally enable **Resolve `@:key` references** (see below).
5. Click **Download**.

---

## Resolving `@:key` References

Verba supports vue-i18n-style key references in translation values:

```
@:common.app_name Settings
```

At runtime, `@:common.app_name` is replaced by the value of the `common.app_name` key.

When exporting, you have two options:

| Option                 | Output                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| **Keep raw** (default) | `"@:common.app_name Settings"`, your i18n library resolves at runtime |
| **Resolve references** | `"Verba Settings"`, references are inlined at export time             |

Use **Resolve references** when your target i18n library does not support the `@:` syntax natively.

---

## Namespace Structure in Exports

When exporting a single namespace, only keys from that namespace are included. When exporting all namespaces, all keys across all namespaces are merged into one flat file per locale.

For projects with many namespaces it is common to split exports by namespace and load them lazily in the application:

```bash
# Export per namespace, per locale
curl -H "Authorization: Bearer $VERBA_TOKEN" \
  "https://verba.example.com/api/projects/my-app/export/en?namespace=common" \
  -o src/i18n/en/common.json

curl -H "Authorization: Bearer $VERBA_TOKEN" \
  "https://verba.example.com/api/projects/my-app/export/en?namespace=auth" \
  -o src/i18n/en/auth.json
```

---

## Integrating with Your CI Pipeline

A common pattern is to export from Verba as part of your CI/CD pipeline so that builds always include the latest approved translations.

```bash
#!/bin/bash
# Example: export all locales from Verba into the app's i18n directory

LOCALES=(en pt-PT de fr)
PROJECT_ID="my-app"
VERBA_URL="https://verba.example.com"

for LOCALE in "${LOCALES[@]}"; do
  curl -s \
    -H "Authorization: Bearer $VERBA_TOKEN" \
    "$VERBA_URL/api/projects/$PROJECT_ID/export/$LOCALE" \
    -o "src/i18n/$LOCALE.json"
  echo "Exported $LOCALE"
done
```

Add `VERBA_TOKEN` as a CI secret. The token can be generated from your user profile in the Verba UI.

> **Only approved translations are exported.** This means your application will never receive draft or unreviewed strings from Verba.
