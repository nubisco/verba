import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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

  for (const row of result.data) {
    try {
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
      console.error(`Failed to import row:`, row, error);
    }
  }

  return imported;
}

export async function importXLSX(buffer: Buffer, projectId: string): Promise<number> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<ImportRow>(worksheet);

  let imported = 0;
  const namespaceCache = new Map<string, string>();
  const localeCache = new Map<string, string>();
  const keyCache = new Map<string, string>();

  for (const row of data) {
    try {
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
      console.error(`Failed to import row:`, row, error);
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
