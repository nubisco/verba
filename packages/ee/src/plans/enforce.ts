// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * The limits the API enforces when it creates something, for an account on a
 * hosted plan. Null when there is nothing to enforce: plans are off, or a
 * self-hosted licence key decides the plan instead of the licenses service.
 */

import { resolveEntitlements, type EntitlementsDb } from '../entitlements/entitlement.service.js'
import { plansConfig } from './config.js'

export type EnforcedResource = 'projects' | 'members' | 'keys'

export async function accountLimits(
  db: EntitlementsDb,
  accountId: string,
): Promise<Record<EnforcedResource, number | null> | null> {
  if (!plansConfig()) return null
  const ctx = await resolveEntitlements(db, accountId)
  if (!ctx.billing) return null
  return {
    projects: ctx.entitlements.maxProjects,
    members: ctx.entitlements.maxMembers,
    keys: ctx.entitlements.maxKeys,
  }
}
