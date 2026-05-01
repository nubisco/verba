import type { FastifyInstance } from 'fastify'
import { AddMemberSchema, UpdateMemberSchema, UpdateMemberLocalesSchema } from '../schemas/member.schema.js'
import * as membershipService from '../services/membership.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export async function memberRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/members',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return membershipService.listMembers(req.params.projectId)
    },
  )

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/members',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      const body = AddMemberSchema.parse(req.body)
      const member = await membershipService.addMember(req.params.projectId, body)
      return reply.status(201).send(member)
    },
  )

  app.patch<{ Params: { projectId: string; userId: string } }>(
    '/projects/:projectId/members/:userId',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      const body = UpdateMemberSchema.parse(req.body)
      return membershipService.updateMember(req.params.projectId, req.params.userId, body)
    },
  )

  app.delete<{ Params: { projectId: string; userId: string } }>(
    '/projects/:projectId/members/:userId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      await membershipService.removeMember(req.params.projectId, req.params.userId)
      return reply.status(204).send()
    },
  )

  app.put<{ Params: { projectId: string; userId: string } }>(
    '/projects/:projectId/members/:userId/locales',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      const body = UpdateMemberLocalesSchema.parse(req.body)
      return membershipService.updateMemberLocales(req.params.projectId, req.params.userId, body.localeIds)
    },
  )
}
