import type { PrismaClient } from './generated/prisma/client.js'

// The one Prisma client every service uses, chosen by the entry point.
//
// The Node server creates it from DATABASE_URL (prisma-node.ts, called by
// index.ts). A Worker creates it from its D1 binding. Services import `prisma`
// from here and never know which, and nothing here imports a driver, so a
// Worker bundle carries no PostgreSQL or native SQLite code.
//
// `prisma` is a live binding: setPrisma replaces it for every importer.

const notReady = new Proxy({} as PrismaClient, {
  get(_target, property) {
    throw new Error(`The database client is not set up yet (prisma.${String(property)}). Call setPrisma first.`)
  },
})

export let prisma: PrismaClient = notReady

/** Make `client` the database client for the whole API. Called once by the entry point. */
export function setPrisma(client: PrismaClient): void {
  prisma = client
}
