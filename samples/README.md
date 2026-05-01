# Sample Files

Test data for Verba's import and export features.

## Files

| File                 | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `sample-import.csv`  | Import via CSV. Use this to test the import flow          |
| `sample-import.xlsx` | Import via XLSX. Same data as the CSV, spreadsheet format |
| `sample-export.json` | Example of what the JSON export looks like (English only) |

## Column structure (CSV / XLSX)

| Column      | Description                                      |
| ----------- | ------------------------------------------------ |
| `Key`       | Flat key name (e.g. `app.menu.file`)             |
| `Namespace` | Namespace slug (e.g. `app`, `auth`, `dashboard`) |
| `en`        | English translation                              |
| `pt-PT`     | Portuguese translation                           |
| `de`        | German translation                               |

## How to test the import

1. Run `pnpm dev` and log in at http://localhost:5173
2. Create a project and add locales: `en`, `pt-PT`, `de`
3. Go to the project → **Import Translations**
4. Upload `sample-import.csv` or `sample-import.xlsx`
5. Fill in the column mapping:
   - **Key column**: `Key`
   - **Namespace column**: `Namespace`
   - For each locale, enter the matching column name (e.g. locale `en` → column `en`)
6. Click **Preview** to see the diff, then **Apply Import**

## How to test the export

After approving some translations, visit:

```
GET http://localhost:4000/projects/:projectId/export/en.json
```

or click the **Export JSON** button next to a locale in the project dashboard.
