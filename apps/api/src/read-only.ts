// The write guard for accounts over their hosted plan (plan-limits.service.ts).
//
// Added to every route as it is registered (an onRoute hook in app.ts), after
// the route's own preHandlers, so the session is checked first. It only acts
// on writes (POST, PUT, PATCH) inside an account: a project's routes, an
// account's routes, and creating a project. DELETE always passes, because
// deleting and removing people is how an account gets back under its limits.
// Billing passes, because upgrading is the other way. Previewing an import
// writes nothing, so it passes too.
//
// Without hosted plans it returns before it reads anything, so a Community or
// self-hosted instance never notices it.

import type { FastifyRequest, RouteOptions } from 'fastify'
import { accountSelector } from './account-selector.js'
import { AccountRole } from './types.js'
import { requireAccountRole, resolveAccount } from './services/account.service.js'
import { getMembership } from './services/membership.service.js'
import { eeEnabled } from './services/edition.service.js'
import { accountOfProject, assertWritable } from './services/plan-limits.service.js'

const WRITES = new Set(['POST', 'PUT', 'PATCH'])

/** Writes that stay open while an account is read-only. */
const ALWAYS_OPEN = [/\/billing(\/|$)/, /^\/projects\/:projectId\/import\/preview$/]

function inAccount(url: string): boolean {
  return url === '/projects' || url.startsWith('/projects/:') || url.startsWith('/accounts/:accountId')
}

/**
 * Which account a guarded write is in, or null when it names none or the
 * caller is not in it. Someone outside gets the route's own 403 or 404, so the
 * guard never tells them anything about an account they cannot see.
 */
async function accountOf(req: FastifyRequest, url: string): Promise<string | null> {
  const user = (req as { user?: { userId: string } }).user
  if (!user) return null
  const params = (req.params ?? {}) as Record<string, string | undefined>
  const projectId = params.projectId ?? (url.startsWith('/projects/:id') ? params.id : undefined)
  if (params.accountId) {
    try {
      await requireAccountRole(user.userId, params.accountId, AccountRole.MEMBER)
    } catch {
      return null
    }
    return params.accountId
  }
  if (projectId) {
    // getMembership requires membership of the project and of its account.
    if (!(await getMembership(user.userId, projectId))) return null
    return accountOfProject(projectId)
  }
  if (url === '/projects') {
    try {
      return (await resolveAccount(user.userId, accountSelector(req))).id
    } catch {
      // The route itself answers a request that names no account it can use.
      return null
    }
  }
  return null
}

export function guardReadOnlyWrites(route: RouteOptions): void {
  const methods = ([] as string[]).concat(route.method as string | string[])
  if (!methods.some((m) => WRITES.has(m))) return
  if (!inAccount(route.url) || ALWAYS_OPEN.some((r) => r.test(route.url))) return
  const url = route.url
  const guard = async (req: FastifyRequest) => {
    if (!WRITES.has(req.method) || !eeEnabled()) return
    const accountId = await accountOf(req, url)
    if (accountId) await assertWritable(accountId)
  }
  const existing = route.preHandler ? ([] as unknown[]).concat(route.preHandler) : []
  route.preHandler = [...existing, guard] as RouteOptions['preHandler']
}
