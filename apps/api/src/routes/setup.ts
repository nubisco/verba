// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024 Nubisco
import { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { createOtpOnlyUser, register } from '../services/auth.service.js'
import { getAuthConfig } from '../services/instance-config.service.js'
import { startSession } from '../session.js'
import { isOperatorEmail } from '../services/operator.service.js'
import { createOwnedAccount } from '../services/account.service.js'
import { z } from 'zod'

const setupSchema = z.object({
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).optional(),
  instanceName: z.string().min(1).max(100).optional(),
})

export async function setupRoutes(app: FastifyInstance) {
  /** Returns whether the instance still needs first-time setup */
  app.get('/setup/status', async (_req, reply) => {
    const count = await prisma.user.count()
    return reply.send({ needsSetup: count === 0 })
  })

  /** First-time setup: creates the admin user. Only works when no users exist. */
  app.post('/setup', async (req, reply) => {
    const count = await prisma.user.count()
    if (count > 0) {
      return reply.status(409).send({ error: 'Instance is already set up' })
    }

    const body = setupSchema.safeParse(req.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues[0]?.message ?? 'Invalid input' })
    }

    const { adminEmail, adminPassword } = body.data
    // The first account is no longer the operator by arriving first. Setup
    // creates the operator's account, so the address must already be named
    // in the configuration, which only whoever runs the server can change.
    if (!isOperatorEmail(adminEmail)) {
      return reply.status(403).send({
        error: 'Add this address to VERBA_OPERATORS in the server configuration, restart, then run setup again',
      })
    }
    const authConfig = getAuthConfig()
    if (authConfig.localPasswordEnabled && !adminPassword) {
      return reply.status(400).send({ error: 'adminPassword is required when password auth is enabled' })
    }
    const user = authConfig.localPasswordEnabled
      ? await register(adminEmail, adminPassword ?? '')
      : await createOtpOnlyUser(adminEmail)

    // The instance's first account, owned by the operator, so the first
    // project has somewhere to live. Named after the instance when setup was
    // given a name.
    await createOwnedAccount(user.id, { name: body.data.instanceName?.trim() || 'My account' })

    // Sign the user in straight away
    await startSession(app, reply, { userId: user.id, email: user.email })

    return reply.status(201).send({ id: user.id, email: user.email })
  })
}
