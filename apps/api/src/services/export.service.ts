import { prisma } from '../prisma.js'
import ExcelJS from 'exceljs'
import archiver from 'archiver'
import { buildFullKey } from './key-identity.service.js'

function notFound(): never {
  throw Object.assign(new Error('Locale not found'), { statusCode: 404 })
}

export async function exportLocale(projectId: string, localeCode: string): Promise<Record<string, string>> {
  const locale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: localeCode } },
  })
  if (!locale) notFound()

  const translations = await prisma.translation.findMany({
    where: {
      localeId: locale.id,
      status: 'APPROVED',
      key: { projectId },
    },
    include: { key: { include: { namespace: { select: { slug: true } } } } },
  })

  const result: Record<string, string> = {}
  for (const t of translations) {
    result[buildFullKey(t.key.name, t.key.namespace?.slug)] = t.text
  }

  // Sort alphabetically by key
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)))
}

export async function exportTranslations(
  projectId: string,
  opts: {
    locale?: string
    status?: string
    format: 'json' | 'csv' | 'xlsx'
    resolve?: boolean
    splitByNamespace?: boolean
  },
): Promise<{ data: string | Buffer; contentType: string; filename: string }> {
  const rows = await prisma.translation.findMany({
    where: {
      deletedAt: null,
      key: { projectId },
      ...(opts.locale ? { locale: { code: opts.locale } } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    include: {
      key: {
        select: {
          name: true,
          namespace: { select: { slug: true } },
        },
      },
      locale: { select: { code: true } },
    },
  })

  const flat = rows.map((t) => ({
    namespace: t.key.namespace?.slug ?? '',
    key: t.key.name,
    locale: t.locale.code,
    text: t.text,
    status: t.status,
  }))

  if (opts.format === 'json' && opts.splitByNamespace) {
    // Group by locale -> namespace -> key (nested objects)
    const tree: Record<string, Record<string, Record<string, string>>> = {}
    for (const row of flat) {
      const ns = row.namespace || '_default'
      if (!tree[row.locale]) tree[row.locale] = {}
      if (!tree[row.locale][ns]) tree[row.locale][ns] = {}
      tree[row.locale][ns][row.key] = row.text
    }

    // Build a ZIP: locale/namespace.json for each combination
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []
    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    const done = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    for (const [locale, namespaces] of Object.entries(tree)) {
      for (const [ns, keys] of Object.entries(namespaces)) {
        const sorted = Object.fromEntries(Object.entries(keys).sort(([a], [b]) => a.localeCompare(b)))
        archive.append(JSON.stringify(sorted, null, 2), { name: `${locale}/${ns}.json` })
      }
    }
    await archive.finalize()
    await done

    return {
      data: Buffer.concat(chunks),
      contentType: 'application/zip',
      filename: 'translations.zip',
    }
  }

  if (opts.format === 'json') {
    const grouped: Record<string, Record<string, string>> = {}
    for (const row of flat) {
      const localeKey = row.locale
      const keyName = row.namespace ? `${row.namespace}.${row.key}` : row.key
      if (!grouped[localeKey]) grouped[localeKey] = {}
      grouped[localeKey][keyName] = row.text
    }
    return {
      data: JSON.stringify(grouped, null, 2),
      contentType: 'application/json; charset=utf-8',
      filename: `translations.json`,
    }
  }

  if (opts.format === 'csv') {
    const header = 'namespace,key,locale,text,status'
    const csvRows = flat.map((r) =>
      [r.namespace, r.key, r.locale, `"${r.text.replace(/"/g, '""')}"`, r.status].join(','),
    )
    return {
      data: [header, ...csvRows].join('\n'),
      contentType: 'text/csv; charset=utf-8',
      filename: 'translations.csv',
    }
  }

  // XLSX
  const workbook = new ExcelJS.Workbook()
  const locales = Array.from(new Set(flat.map((r: { locale: string }) => String(r.locale))))
  for (const locale of locales) {
    const sheet = workbook.addWorksheet(locale)
    sheet.addRow(['namespace', 'key', 'text', 'status'])
    for (const row of flat.filter((r) => r.locale === locale)) {
      sheet.addRow([row.namespace, row.key, row.text, row.status])
    }
  }
  const buffer = await workbook.xlsx.writeBuffer()
  return {
    data: Buffer.from(buffer),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: 'translations.xlsx',
  }
}
