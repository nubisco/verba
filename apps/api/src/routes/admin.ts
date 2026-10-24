import type { FastifyInstance } from 'fastify'
import * as authService from '../services/auth.service.js'
import { isOperator, listInstanceAudit } from '../services/operator.service.js'
import { serializeEntitlementContext } from '../services/entitlement.service.js'

export async function adminRoutes(app: FastifyInstance) {
  // Every admin route: a session, and an operator named in VERBA_OPERATORS.
  const requireAdmin = async (
    req: Parameters<typeof app.authenticate>[0],
    reply: Parameters<typeof app.authenticate>[1],
  ) => {
    await app.authenticate(req, reply)
    if (reply.sent) return
    if (!(await isOperator(req.user.userId))) {
      return reply.status(403).send({ error: 'Forbidden: instance operator required' })
    }
  }

  app.get('/admin/users', { preHandler: [requireAdmin] }, async () => {
    return authService.listAllUsers()
  })

  app.delete<{
    Params: { userId: string }
    Body: { reassignToUserId?: string }
  }>('/admin/users/:userId', { preHandler: [requireAdmin] }, async (req, reply) => {
    const { reassignToUserId } = (req.body as { reassignToUserId?: string }) ?? {}
    await authService.deleteUser(req.params.userId, req.user.userId, reassignToUserId)
    return reply.status(204).send()
  })

  app.post<{ Params: { userId: string } }>(
    '/admin/users/:userId/reactivate',
    { preHandler: [requireAdmin] },
    async (req) => {
      return authService.reactivateUser(req.params.userId, req.user.userId)
    },
  )

  // Operator grants and operator actions on accounts, newest first.
  app.get<{ Querystring: { limit?: string } }>('/admin/audit', { preHandler: [requireAdmin] }, async (req) => {
    return listInstanceAudit(Number(req.query.limit) || 200)
  })

  // GET /admin/entitlements: inspect the current plan and effective entitlements.
  // ?accountId names the account (the EE tables key it as orgId, which is
  // still accepted). Returns the resolved plan, entitlement set, license state,
  // and whether an override is active. Operators only: it is shown under an
  // account's Settings, but only to an operator.
  app.get<{ Querystring: { accountId?: string; orgId?: string } }>(
    '/admin/entitlements',
    { preHandler: [requireAdmin] },
    async (req) => {
      const accountId = req.query.accountId ?? req.query.orgId ?? null
      return serializeEntitlementContext(accountId)
    },
  )
}
