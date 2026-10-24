import type { FastifyInstance } from 'fastify'
import { AddMemberRequestSchema, UpdateMemberSchema, UpdateMemberLocalesSchema } from '../schemas/member.schema.js'
import * as membershipService from '../services/membership.service.js'
import { findActiveUserByEmail } from '../services/auth.service.js'
import * as analytics from '../services/analytics.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { ensureMemberForProject } from '../services/account.service.js'
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
      const body = AddMemberRequestSchema.parse(req.body)
      const user = await findActiveUserByEmail(body.email)
      if (!user) {
        // Invitations for people without an account come with workspaces (VE-78).
        return reply
          .status(404)
          .send({ error: 'Nobody with that email has signed in to Verba yet. Ask them to sign in once first.' })
      }
      // A project's people are its account's people: someone from outside
      // joins the account first, which only an account admin may do.
      await ensureMemberForProject(req.user.userId, req.params.projectId, user.id)
      const member = await membershipService.addMember(req.params.projectId, {
        userId: user.id,
        role: body.role,
        namespaceIds: body.namespaceIds,
      })
      // Verba has no email-invite flow: adding a member is the act of granting
      // access to an existing platform user, so this collapses with "invite_sent".
      analytics.track('collaborator_added', {
        userId: req.user.userId,
        props: { project_id: req.params.projectId, role: body.role },
      })
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
