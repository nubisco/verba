import type { MiddlewareHandler } from 'hono'
import type { Api, AppEnv } from '../http.js'
import { readBody } from '../http.js'
import { authenticate } from '../session.js'
import * as authService from '../services/auth.service.js'
import { isOperator, listInstanceAudit } from '../services/operator.service.js'
import { serializeEntitlementContext } from '../services/entitlement.service.js'

export function adminRoutes(app: Api) {
  // Every admin route: a session, and an operator named in VERBA_OPERATORS.
  const operatorOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
    if (!(await isOperator(c.var.user.userId))) {
      return c.json({ error: 'Forbidden: instance operator required' }, 403)
    }
    await next()
  }

  app.get('/admin/users', authenticate, operatorOnly, async (c) => {
    return c.json(await authService.listAllUsers())
  })

  app.delete('/admin/users/:userId', authenticate, operatorOnly, async (c) => {
    const { reassignToUserId } = ((await readBody(c)) as { reassignToUserId?: string }) ?? {}
    await authService.deleteUser(c.req.param('userId'), c.var.user.userId, reassignToUserId)
    return c.body(null, 204)
  })

  app.post('/admin/users/:userId/reactivate', authenticate, operatorOnly, async (c) => {
    return c.json(await authService.reactivateUser(c.req.param('userId'), c.var.user.userId))
  })

  // Operator grants and operator actions on accounts, newest first.
  app.get('/admin/audit', authenticate, operatorOnly, async (c) => {
    return c.json(await listInstanceAudit(Number(c.req.query('limit')) || 200))
  })

  // GET /admin/entitlements: inspect the current plan and effective entitlements.
  // ?accountId names the account (the EE tables key it as orgId, which is
  // still accepted). Returns the resolved plan, entitlement set, license state,
  // and whether an override is active. Operators only: it is shown under an
  // account's Settings, but only to an operator.
  app.get('/admin/entitlements', authenticate, operatorOnly, async (c) => {
    const accountId = c.req.query('accountId') ?? c.req.query('orgId') ?? null
    return c.json(await serializeEntitlementContext(accountId))
  })
}
