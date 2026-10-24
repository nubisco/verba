// Prisma CLI configuration (Prisma 7). The CLI no longer reads .env files on
// its own, so dotenv loads apps/api/.env here, the same file the API reads.
import 'dotenv/config'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'prisma/config'

// Prisma 6 resolved a relative SQLite path such as `file:./dev.db` against the
// schema's folder, so existing databases live in apps/api/prisma. Prisma 7
// resolves it against this file instead. Keep the old location (src/prisma.ts
// does the same at runtime).
const prismaDir = fileURLToPath(new URL('./prisma/', import.meta.url))

function databaseUrl(): string {
  // Read lazily rather than with env(), which throws when the variable is
  // unset: `prisma generate` needs no database, and CI and the Docker build
  // run it without one.
  const url = process.env.DATABASE_URL ?? ''
  if (!url.startsWith('file:')) return url
  const path = url.slice('file:'.length)
  return isAbsolute(path) ? url : `file:${resolve(prismaDir, path)}`
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl(),
    // Only `scripts/migrations.mjs` needs one: diffing the migration history
    // against the schema replays the history into a scratch PostgreSQL.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
})
