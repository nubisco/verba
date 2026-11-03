// The write guard for accounts over their hosted plan (plan-limits.service.ts).
//
// Added to every route as it is registered (guardEveryWrite in app.ts), after
// the route's own middleware, so the session is checked first. It only acts
// on writes (POST, PUT, PATCH) inside an account: a project's routes, an
// account's routes, and creating a project. DELETE always passes, because
// deleting and removing people is how an account gets back under its limits.
// Billing passes, because upgrading is the other way. Previewing an import
// writes nothing, so it passes too.
//
// Without hosted plans it returns before it reads anything, so a Community or
// self-hosted instance never notices it.

import type { MiddlewareHandler } from 'hono'
import type { Api, AppEnv, Ctx } from './http.js'
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
async function accountOf(c: Ctx, url: string): Promise<string | null> {
  const user = c.get('user') as { userId: string } | undefined
  if (!user) return null
  const params = c.req.param() as Record<string, string | undefined>
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
      return (await resolveAccount(user.userId, accountSelector(c))).id
    } catch {
      // The route itself answers a request that names no account it can use.
      return null
    }
  }
  return null
}

/**
 * The write guard for one route, or null when the route needs none: it is
 * not a write, not inside an account, or one of the writes that stay open.
 */
export function readOnlyGuardFor(method: string, url: string): MiddlewareHandler<AppEnv> | null {
  if (!WRITES.has(method.toUpperCase())) return null
  if (!inAccount(url) || ALWAYS_OPEN.some((r) => r.test(url))) return null
  return async (c, next) => {
    if (eeEnabled()) {
      const accountId = await accountOf(c, url)
      if (accountId) await assertWritable(accountId)
    }
    await next()
  }
}

type Register = (path: string, ...handlers: MiddlewareHandler<AppEnv>[]) => Api

/**
 * Put the guard on every POST, PUT and PATCH route registered on `app` from
 * now on, just before its handler. Call it before any route is registered:
 * a route cannot forget the guard, which is the point.
 */
export function guardEveryWrite(app: Api): void {
  for (const method of ['post', 'put', 'patch'] as const) {
    const register = app[method].bind(app) as unknown as Register
    const guarded: Register = (path, ...handlers) => {
      const guard = readOnlyGuardFor(method, path)
      if (guard && handlers.length > 0) handlers.splice(handlers.length - 1, 0, guard)
      return register(path, ...handlers)
    }
    ;(app as unknown as Record<string, Register>)[method] = guarded
  }
}
