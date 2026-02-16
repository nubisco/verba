import Papa from 'papaparse';
import { prismaService } from './prisma.service.js';

export interface ImportRow {
  namespace: string;
  key: string;
  locale: string;
  value: string;
  description?: string;
}

export async function importCSV(csvContent: string, projectId: string): Promise<number> {
  const result = Papa.parse<ImportRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
  });

  let imported = 0;
  const namespaceCache = new Map<string, string>();
  const localeCache = new Map<string, string>();
  const keyCache = new Map<string, string>();

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i];
    try {
      // Validate row data
      if (!row.namespace || !row.key || !row.locale || !row.value) {
        console.error(`Row ${i + 2} (including header) missing required fields:`, JSON.stringify(row));
        continue;
      }

      // Get or create namespace
      let namespaceId = namespaceCache.get(row.namespace);
      if (!namespaceId) {
        const namespace = await prismaService.createNamespace({
          projectId,
          name: row.namespace,
        });
        namespaceId = namespace.id;
        namespaceCache.set(row.namespace, namespaceId);
      }

      // Get or create locale
      let localeId = localeCache.get(row.locale);
      if (!localeId) {
        const locale = await prismaService.createLocale({
          projectId,
          code: row.locale,
          name: row.locale,
        });
        localeId = locale.id;
        localeCache.set(row.locale, localeId);
      }

      // Get or create key
      const keyLookup = `${namespaceId}:${row.key}`;
      let keyId = keyCache.get(keyLookup);
      if (!keyId) {
        const key = await prismaService.createKey({
          namespaceId,
          key: row.key,
          description: row.description,
        });
        keyId = key.id;
        keyCache.set(keyLookup, keyId);
      }

      // Create translation
      await prismaService.createTranslation({
        keyId,
        localeId,
        value: row.value,
      });

      imported++;
    } catch (error) {
      console.error(`Failed to import row ${i + 2} (including header):`, JSON.stringify(row), `Error: ${error}`);
    }
  }

  return imported;
}

export async function exportApprovedJSON(projectId: string): Promise<Record<string, any>> {
  const translations = await prismaService.listApprovedTranslations(projectId);

  const result: Record<string, any> = {};

  for (const translation of translations) {
    const namespace = translation.key.namespace.name;
    const key = translation.key.key;
    const locale = translation.locale.code;
    const value = translation.value;

    if (!result[locale]) {
      result[locale] = {};
    }

    if (!result[locale][namespace]) {
      result[locale][namespace] = {};
    }

    result[locale][namespace][key] = value;
  }

  return result;
}
