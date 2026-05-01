import type { FastifyInstance } from 'fastify'
import { CreateOrgSchema } from '../schemas/org.schema.js'
import * as svc from '../services/org.service.js'

export async function orgRoutes(app: FastifyInstance) {
  app.post('/organizations', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = CreateOrgSchema.parse(req.body)
    const org = await svc.createOrg(req.user.userId, body)
    return reply.status(201).send(org)
  })

  app.get('/organizations', { preHandler: [app.authenticate] }, async (req) => {
    return svc.listOrgs(req.user.userId)
  })

  app.get<{ Params: { orgId: string } }>('/organizations/:orgId', { preHandler: [app.authenticate] }, async (req) => {
    return svc.getOrg(req.params.orgId, req.user.userId)
  })
}
