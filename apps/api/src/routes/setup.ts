// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024 Nubisco
import { readBody, type Api } from '../http.js'
import { prisma } from '../prisma.js'
import { createOtpOnlyUser, register } from '../services/auth.service.js'
import { getAuthConfig, platformOnlyAuth } from '../services/instance-config.service.js'
import { startSession } from '../session.js'
import { isOperatorEmail } from '../services/operator.service.js'
import { createOwnedAccount, firstAccountName } from '../services/account.service.js'
import { z } from 'zod'

const setupSchema = z.object({
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).optional(),
  instanceName: z.string().min(1).max(100).optional(),
})

export function setupRoutes(app: Api) {
  /** Returns whether the instance still needs first-time setup */
  app.get('/setup/status', async (c) => {
    // An instance that signs in through its identity provider only has no
    // wizard, even with an empty database: the operator's first sign-in
    // provisions them (VERBA_AUTH_MODE=platform), so the web app goes to sign-in.
    if (platformOnlyAuth()) return c.json({ needsSetup: false })
    const count = await prisma.user.count()
    return c.json({ needsSetup: count === 0 })
  })

  /** First-time setup: creates the admin user. Only works when no users exist. */
  app.post('/setup', async (c) => {
    if (platformOnlyAuth()) {
      return c.json({ error: 'This instance has no setup wizard. Sign in with its identity provider instead' }, 404)
    }
    const count = await prisma.user.count()
    if (count > 0) {
      return c.json({ error: 'Instance is already set up' }, 409)
    }

    const body = setupSchema.safeParse(await readBody(c))
    if (!body.success) {
      return c.json({ error: body.error.issues[0]?.message ?? 'Invalid input' }, 400)
    }

    const { adminEmail, adminPassword } = body.data
    // The first account is no longer the operator by arriving first. Setup
    // creates the operator's account, so the address must already be named
    // in the configuration, which only whoever runs the server can change.
    if (!isOperatorEmail(adminEmail)) {
      return c.json(
        {
          error: 'Add this address to VERBA_OPERATORS in the server configuration, restart, then run setup again',
        },
        403,
      )
    }
    const authConfig = getAuthConfig()
    if (authConfig.localPasswordEnabled && !adminPassword) {
      return c.json({ error: 'adminPassword is required when password auth is enabled' }, 400)
    }
    const user = authConfig.localPasswordEnabled
      ? await register(adminEmail, adminPassword ?? '', { skipTerms: true })
      : await createOtpOnlyUser(adminEmail, { skipTerms: true })

    // The instance's first account, owned by the operator, so the first
    // project has somewhere to live. Named after the instance when setup was
    // given a name, else VERBA_FIRST_ACCOUNT_NAME, else "My account".
    await createOwnedAccount(user.id, { name: body.data.instanceName?.trim() || firstAccountName() })

    // Sign the user in straight away
    await startSession(c, { userId: user.id, email: user.email })

    return c.json({ id: user.id, email: user.email }, 201)
  })
}
