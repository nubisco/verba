import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import {
  AddAccountMemberSchema,
  CreateAccountSchema,
  UpdateAccountMemberSchema,
  UpdateAccountSchema,
} from '../schemas/account.schema.js'
import * as svc from '../services/account.service.js'

// Accounts and their people. Every check is in account.service.ts: the routes
// only parse and delegate.
export function accountRoutes(app: Api) {
  app.get('/accounts', authenticate, async (c) => {
    return c.json(await svc.listAccounts(c.var.user.userId))
  })

  app.post('/accounts', authenticate, async (c) => {
    const body = CreateAccountSchema.parse(await readBody(c))
    return c.json(await svc.createAccount(c.var.user.userId, body), 201)
  })

  app.get('/accounts/:accountId', authenticate, async (c) =>
    c.json(await svc.getAccount(c.var.user.userId, c.req.param('accountId'))),
  )

  // Read-only because the account is over its hosted plan? Any member may ask.
  app.get('/accounts/:accountId/plan-status', authenticate, async (c) =>
    c.json(await svc.accountPlanStatus(c.var.user.userId, c.req.param('accountId'))),
  )

  app.patch('/accounts/:accountId', authenticate, async (c) => {
    const body = UpdateAccountSchema.parse(await readBody(c))
    return c.json(await svc.updateAccount(c.var.user.userId, c.req.param('accountId'), body))
  })

  app.get('/accounts/:accountId/members', authenticate, async (c) =>
    c.json(await svc.listMembers(c.var.user.userId, c.req.param('accountId'))),
  )

  app.post('/accounts/:accountId/members', authenticate, async (c) => {
    const body = AddAccountMemberSchema.parse(await readBody(c))
    return c.json(await svc.addMember(c.var.user.userId, c.req.param('accountId'), body), 201)
  })

  app.patch('/accounts/:accountId/members/:userId', authenticate, async (c) => {
    const { role } = UpdateAccountMemberSchema.parse(await readBody(c))
    return c.json(await svc.updateMemberRole(c.var.user.userId, c.req.param('accountId'), c.req.param('userId'), role))
  })

  app.delete('/accounts/:accountId/members/:userId', authenticate, async (c) => {
    await svc.removeMember(c.var.user.userId, c.req.param('accountId'), c.req.param('userId'))
    return c.body(null, 204)
  })
}
