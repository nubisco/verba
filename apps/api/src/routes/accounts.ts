import type { FastifyInstance } from 'fastify'
import {
  AddAccountMemberSchema,
  CreateAccountSchema,
  UpdateAccountMemberSchema,
  UpdateAccountSchema,
} from '../schemas/account.schema.js'
import * as svc from '../services/account.service.js'

// Accounts and their people. Every check is in account.service.ts: the routes
// only parse and delegate.
export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', { preHandler: [app.authenticate] }, async (req) => {
    return svc.listAccounts(req.user.userId)
  })

  app.post('/accounts', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = CreateAccountSchema.parse(req.body)
    return reply.status(201).send(await svc.createAccount(req.user.userId, body))
  })

  app.get<{ Params: { accountId: string } }>('/accounts/:accountId', { preHandler: [app.authenticate] }, async (req) =>
    svc.getAccount(req.user.userId, req.params.accountId),
  )

  app.patch<{ Params: { accountId: string } }>(
    '/accounts/:accountId',
    { preHandler: [app.authenticate] },
    async (req) => svc.updateAccount(req.user.userId, req.params.accountId, UpdateAccountSchema.parse(req.body)),
  )

  app.get<{ Params: { accountId: string } }>(
    '/accounts/:accountId/members',
    { preHandler: [app.authenticate] },
    async (req) => svc.listMembers(req.user.userId, req.params.accountId),
  )

  app.post<{ Params: { accountId: string } }>(
    '/accounts/:accountId/members',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = AddAccountMemberSchema.parse(req.body)
      return reply.status(201).send(await svc.addMember(req.user.userId, req.params.accountId, body))
    },
  )

  app.patch<{ Params: { accountId: string; userId: string } }>(
    '/accounts/:accountId/members/:userId',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { role } = UpdateAccountMemberSchema.parse(req.body)
      return svc.updateMemberRole(req.user.userId, req.params.accountId, req.params.userId, role)
    },
  )

  app.delete<{ Params: { accountId: string; userId: string } }>(
    '/accounts/:accountId/members/:userId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await svc.removeMember(req.user.userId, req.params.accountId, req.params.userId)
      return reply.status(204).send()
    },
  )
}
