import { prisma } from '../prisma.js'

// Whole-project reads, in a fixed number of flat queries.
//
// Prisma loads an `include` or a nested `select` with separate queries, one
// IN (...) list per 100 parent rows on D1. Over a whole project that is
// hundreds of queries: a 60,000-translation export with includes ran 1,049
// in one request, past D1's limit of about 1,000 per Worker invocation
// (docs/hosting-on-cloudflare.md). So reads that cover a whole project select
// scalar columns only, and the names are joined here, in memory.

/** The project's keys, namespaces and locales, by id. Three queries. */
export async function projectCatalog(projectId: string) {
  const [keys, namespaces, locales] = await Promise.all([
    prisma.key.findMany({ where: { projectId }, select: { id: true, name: true, namespaceId: true } }),
    prisma.namespace.findMany({ where: { projectId }, select: { id: true, slug: true } }),
    prisma.locale.findMany({ where: { projectId }, select: { id: true, code: true } }),
  ])
  const namespaceSlug = new Map(namespaces.map((n) => [n.id, n.slug]))
  return {
    keys: new Map(keys.map((k) => [k.id, { ...k, namespaceSlug: namespaceSlug.get(k.namespaceId) ?? null }])),
    namespaceSlug,
    localeCode: new Map(locales.map((l) => [l.id, l.code])),
  }
}

/**
 * Every key of a project by namespace slug and name. Previews and plan checks
 * read this rather than one query per row. The key is `${slug}\0${name}`.
 */
export async function projectKeyIndex(projectId: string): Promise<Map<string, string>> {
  const [keys, namespaces] = await Promise.all([
    prisma.key.findMany({ where: { projectId }, select: { id: true, name: true, namespaceId: true } }),
    prisma.namespace.findMany({ where: { projectId }, select: { id: true, slug: true } }),
  ])
  const slug = new Map(namespaces.map((n) => [n.id, n.slug]))
  return new Map(keys.map((k) => [`${slug.get(k.namespaceId)}\u0000${k.name}`, k.id]))
}
