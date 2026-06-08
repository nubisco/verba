// Per-browser bag of platform identities the user has authenticated as.
//
// We never store platform refresh/access tokens here — we just remember each
// (email, platformSub) the browser has signed in as in the past. The actual
// "switch to identity X" flow re-runs OIDC authorize against platform with
// login_hint=<email>, which silently succeeds when platform's own multi-
// identity session has that identity active.
//
// One identity per bundle is `isActive` at any moment — the active row is
// what the local Fastify-issued JWT cookie represents.

import { randomBytes } from 'node:crypto'
import { prisma } from '../prisma.js'

export const BUNDLE_COOKIE = 'verba_bundle'
export const BUNDLE_TTL_DAYS = 30

export function newBundleKey(): string {
  return randomBytes(24).toString('base64url')
}

export interface BundleIdentity {
  platformSub: string
  email: string
  name: string | null
  isActive: boolean
  lastUsedAt: Date
}

export async function listIdentities(bundleKey: string): Promise<BundleIdentity[]> {
  const rows = await prisma.platformIdentity.findMany({
    where: { bundleKey },
    orderBy: [{ isActive: 'desc' }, { lastUsedAt: 'desc' }],
  })
  return rows.map((r) => ({
    platformSub: r.platformSub,
    email: r.email,
    name: r.name,
    isActive: r.isActive,
    lastUsedAt: r.lastUsedAt,
  }))
}

export async function upsertActiveIdentity(
  bundleKey: string,
  identity: { platformSub: string; email: string; name: string | null },
): Promise<void> {
  // Deactivate every other identity in this bundle, then upsert the new one
  // as active. Two queries instead of a single transaction keeps it simple
  // and avoids a Prisma interactive-tx dance.
  await prisma.platformIdentity.updateMany({
    where: { bundleKey, NOT: { platformSub: identity.platformSub } },
    data: { isActive: false },
  })
  await prisma.platformIdentity.upsert({
    where: {
      bundleKey_platformSub: { bundleKey, platformSub: identity.platformSub },
    },
    create: {
      bundleKey,
      platformSub: identity.platformSub,
      email: identity.email.toLowerCase().trim(),
      name: identity.name,
      isActive: true,
    },
    update: {
      email: identity.email.toLowerCase().trim(),
      name: identity.name,
      isActive: true,
      lastUsedAt: new Date(),
    },
  })
}

export async function removeIdentity(bundleKey: string, platformSub: string): Promise<{ remaining: BundleIdentity[] }> {
  await prisma.platformIdentity.deleteMany({ where: { bundleKey, platformSub } })
  const remaining = await listIdentities(bundleKey)
  return { remaining }
}

export async function findIdentity(bundleKey: string, platformSub: string): Promise<BundleIdentity | null> {
  const row = await prisma.platformIdentity.findUnique({
    where: { bundleKey_platformSub: { bundleKey, platformSub } },
  })
  if (!row) return null
  return {
    platformSub: row.platformSub,
    email: row.email,
    name: row.name,
    isActive: row.isActive,
    lastUsedAt: row.lastUsedAt,
  }
}
