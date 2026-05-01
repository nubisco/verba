import type { FastifyInstance } from 'fastify'
import * as authService from '../services/auth.service.js'
import { serializeEntitlementContext } from '../services/entitlement.service.js'

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require authentication + global admin
  const requireAdmin = async (
    req: Parameters<typeof app.authenticate>[0],
    reply: Parameters<typeof app.authenticate>[1],
  ) => {
    await app.authenticate(req, reply)
    const user = await authService.getMe(req.user.userId).catch(() => null)
    if (!user?.isGlobalAdmin) {
      return reply.status(403).send({ error: 'Forbidden: global admin required' })
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

  // GET /admin/entitlements: inspect the current plan and effective entitlements.
  // Accepts an optional ?orgId query param for multi-tenant installs.
  // Returns the resolved plan, entitlement set, license state, and whether an
  // override is active. Restricted to ADMIN role.
  app.get<{ Querystring: { orgId?: string } }>('/admin/entitlements', { preHandler: [requireAdmin] }, async (req) => {
    const orgId = req.query.orgId ?? null
    return serializeEntitlementContext(orgId)
  })
}
