// Hosted plans and billing, wired to this API.
//
// The billing code is Enterprise Edition (`@nubisco/verba-ee`, packages/ee/src/
// plans): it talks to Nubisco's licenses service, which owns the Paddle
// subscriptions. This file only decides whether to mount it and hands it the
// API's database and account checks. Nothing here knows about plans, prices or
// Paddle.
//
// It mounts only when all of these hold, and otherwise the API behaves exactly
// as it did without it:
//   - EE is enabled (ENABLE_EE=true and not OSS_ONLY=true),
//   - the EE package is installed and exports the plans plugin (the Community
//     image compiles against a stub that does not),
//   - VERBA_LICENSES_URL and VERBA_LICENSES_SERVICE_TOKEN are set (checked by
//     the plugin itself).

import type { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { AccountRole } from '../types.js'
import { accountUsage, requireAccountRole } from './account.service.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EeModule = any

export function eeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OSS_ONLY !== 'true' && env.ENABLE_EE === 'true'
}

async function loadEE(): Promise<EeModule | null> {
  try {
    return (await import('@nubisco/verba-ee')) as EeModule
  } catch {
    return null
  }
}

/** Mounts the EE billing routes when this instance sells hosted plans. */
export async function registerHostedBilling(app: FastifyInstance): Promise<void> {
  if (!eeEnabled()) return
  const ee = await loadEE()
  if (typeof ee?.plansPlugin !== 'function') return
  await app.register(ee.plansPlugin, {
    db: prisma,
    authenticate: app.authenticate,
    requireAccountAdmin: (userId: string, accountId: string) =>
      requireAccountRole(userId, accountId, AccountRole.ADMIN),
    accountUsage,
  })
  if (ee.plansConfig?.()) app.log.info('[boot] Hosted billing: plans come from the licenses service')
}

/** Whether hosted billing is on, for the web app's /config. */
export async function hostedBillingEnabled(): Promise<boolean> {
  if (!eeEnabled()) return false
  const ee = await loadEE()
  return Boolean(typeof ee?.plansConfig === 'function' && ee.plansConfig())
}
