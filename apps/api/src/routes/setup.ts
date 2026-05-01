// SPDX-License-Identifier: MIT
// Copyright (c) 2024 Nubisco
import { FastifyInstance } from 'fastify'
import { prisma } from '../prisma.js'
import { createOtpOnlyUser, register } from '../services/auth.service.js'
import { getAuthConfig } from '../services/instance-config.service.js'
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
    const authConfig = getAuthConfig()
    if (authConfig.localPasswordEnabled && !adminPassword) {
      return reply.status(400).send({ error: 'adminPassword is required when password auth is enabled' })
    }
    const user = authConfig.localPasswordEnabled
      ? await register(adminEmail, adminPassword ?? '')
      : await createOtpOnlyUser(adminEmail)

    // Sign JWT and set cookie so the user is immediately logged in
    const token = app.jwt.sign({ userId: user.id, email: user.email })
    reply.setCookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })

    return reply.status(201).send({ id: user.id, email: user.email })
  })
}
