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

import type { Api } from '../http.js'
import { prisma } from '../prisma.js'
import { authenticate } from '../session.js'
import { AccountRole } from '../types.js'
import { accountUsage, requireAccountRole } from './account.service.js'
import { eeEnabled, loadEE } from './edition.service.js'

export { eeEnabled }

/** Mounts the EE billing routes when this instance sells hosted plans. */
export async function registerHostedBilling(app: Api): Promise<void> {
  if (!eeEnabled()) return
  const ee = await loadEE()
  if (typeof ee?.plansPlugin !== 'function') return
  ee.plansPlugin(app, {
    db: prisma,
    authenticate,
    requireAccountAdmin: (userId: string, accountId: string) =>
      requireAccountRole(userId, accountId, AccountRole.ADMIN),
    accountUsage,
  })
  if (ee.plansConfig?.()) console.log('[boot] Hosted billing: plans come from the licenses service')
}

/** Whether hosted billing is on, for the web app's /config. */
export async function hostedBillingEnabled(): Promise<boolean> {
  if (!eeEnabled()) return false
  const ee = await loadEE()
  return Boolean(typeof ee?.plansConfig === 'function' && ee.plansConfig())
}
