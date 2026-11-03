import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SqlDriverAdapterFactory } from '@prisma/client/runtime/client'
import { PrismaClient } from './generated/prisma/client.js'

// The database client for the Node server (Docker, development, `verba`).
//
// Prisma 7 talks to the database through a driver adapter. The schema's
// provider is sqlite in the repository (local development) and is switched to
// postgresql by the Docker build, so the adapter follows DATABASE_URL.
//
// The SQLite adapter is a dev dependency and is only imported when the URL
// asks for it, so the production image needs nothing but `pg`.

// Prisma 6 resolved a relative SQLite path against the schema's folder
// (apps/api/prisma), the driver adapter resolves it against the working
// directory. Keep the Prisma 6 location so existing databases are found.
// prisma.config.ts applies the same rule for the CLI.
const prismaDir = fileURLToPath(new URL('../prisma/', import.meta.url))

function sqliteFile(url: string): string {
  const path = url.slice('file:'.length)
  return isAbsolute(path) ? path : resolve(prismaDir, path)
}

async function createAdapter(url: string): Promise<SqlDriverAdapterFactory> {
  if (url.startsWith('file:')) {
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3')
    // Prisma 6 wrote SQLite DateTime values as epoch milliseconds. Reading and
    // writing the same format keeps existing development databases valid.
    return new PrismaBetterSqlite3({ url: sqliteFile(url) }, { timestampFormat: 'unixepoch-ms' })
  }
  const { PrismaPg } = await import('@prisma/adapter-pg')
  // `pg` waits forever for a connection by default. Prisma 6 gave up after
  // five seconds, so keep that.
  const schema = new URL(url).searchParams.get('schema') ?? undefined
  return new PrismaPg({ connectionString: url, connectionTimeoutMillis: 5_000 }, { schema })
}

/** The client for DATABASE_URL, or the development SQLite file when it is unset. */
export async function createNodePrisma(
  databaseUrl = process.env.DATABASE_URL ?? 'file:./dev.db',
): Promise<PrismaClient> {
  return new PrismaClient({ adapter: await createAdapter(databaseUrl) })
}
