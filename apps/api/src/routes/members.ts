import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { AddMemberRequestSchema, UpdateMemberSchema, UpdateMemberLocalesSchema } from '../schemas/member.schema.js'
import * as membershipService from '../services/membership.service.js'
import { findActiveUserByEmail } from '../services/auth.service.js'
import * as analytics from '../services/analytics.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { ensureMemberForProject } from '../services/account.service.js'
import { Role } from '../types.js'

export function memberRoutes(app: Api) {
  app.get('/projects/:projectId/members', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await membershipService.listMembers(c.req.param('projectId')))
  })

  app.post('/projects/:projectId/members', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    const body = AddMemberRequestSchema.parse(await readBody(c))
    const user = await findActiveUserByEmail(body.email)
    if (!user) {
      // Invitations for people without an account come with workspaces (VE-78).
      return c.json(
        { error: 'Nobody with that email has signed in to Verba yet. Ask them to sign in once first.' },
        404,
      )
    }
    // A project's people are its account's people: someone from outside
    // joins the account first, which only an account admin may do.
    await ensureMemberForProject(c.var.user.userId, c.req.param('projectId'), user.id)
    const member = await membershipService.addMember(c.req.param('projectId'), {
      userId: user.id,
      role: body.role,
      namespaceIds: body.namespaceIds,
    })
    // Verba has no email-invite flow: adding a member is the act of granting
    // access to an existing platform user, so this collapses with "invite_sent".
    analytics.track('collaborator_added', {
      userId: c.var.user.userId,
      props: { project_id: c.req.param('projectId'), role: body.role },
    })
    return c.json(member, 201)
  })

  app.patch('/projects/:projectId/members/:userId', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    const body = UpdateMemberSchema.parse(await readBody(c))
    return c.json(await membershipService.updateMember(c.req.param('projectId'), c.req.param('userId'), body))
  })

  app.delete('/projects/:projectId/members/:userId', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    await membershipService.removeMember(c.req.param('projectId'), c.req.param('userId'))
    return c.body(null, 204)
  })

  app.put('/projects/:projectId/members/:userId/locales', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    const body = UpdateMemberLocalesSchema.parse(await readBody(c))
    return c.json(
      await membershipService.updateMemberLocales(c.req.param('projectId'), c.req.param('userId'), body.localeIds),
    )
  })
}
