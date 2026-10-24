import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
  },
}))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'

function closed(ws: { once: (event: 'close', cb: (code: number) => void) => void }): Promise<number> {
  return new Promise((resolve) => ws.once('close', (code: number) => resolve(code)))
}

describe('project rooms on the WebSocket', () => {
  let app: ReturnType<typeof buildApp>
  let token: string

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
    // injectWS hands Fastify a socket with no remote address, which the
    // proxy-address resolver cannot read. Production sockets have one.
    vi.stubEnv('TRUST_PROXY', 'false')
    app = buildApp()
    await app.ready()
    token = app.jwt.sign({ userId: 'u1', email: 'u1@example.com' })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isGlobalAdmin: false } as never)
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  it('closes the socket of a signed-in user who is not a member of the project', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null)
    const ws = await app.injectWS('/ws/projects/p-other', { headers: { cookie: `token=${token}` } })
    expect(await closed(ws)).toBe(1008)
    expect(prisma.membership.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_projectId: { userId: 'u1', projectId: 'p-other' } } }),
    )
  })

  it('closes a socket with no session', async () => {
    const ws = await app.injectWS('/ws/projects/p1')
    expect(await closed(ws)).toBe(1008)
    expect(prisma.membership.findUnique).not.toHaveBeenCalled()
  })

  it('keeps a member connected', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: 'm',
      userId: 'u1',
      projectId: 'p1',
      role: 'READER',
      namespaces: '[]',
      assignedLocales: '[]',
    } as never)
    const ws = await app.injectWS('/ws/projects/p1', { headers: { cookie: `token=${token}` } })
    await new Promise((r) => setTimeout(r, 50))
    expect(ws.readyState).toBe(ws.OPEN)
    ws.terminate()
  })
})
