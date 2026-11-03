import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    membership: { findFirst: vi.fn() },
  },
}))

import type { AddressInfo } from 'node:net'
import { serve, type ServerType } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import WebSocket from 'ws'
import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import { signToken } from './inject.js'

function closed(ws: { once: (event: 'close', cb: (code: number) => void) => void }): Promise<number> {
  return new Promise((resolve) => ws.once('close', (code: number) => resolve(code)))
}

describe('project rooms on the WebSocket', () => {
  let server: ServerType
  let base: string
  let token: string

  // The app on a real Node server, with Node's WebSockets, as index.ts runs it.
  async function injectWS(path: string, options: { headers?: Record<string, string> } = {}) {
    const ws = new WebSocket(`${base}${path}`, { headers: options.headers })
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    return ws
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
    let injectWebSocket: ReturnType<typeof createNodeWebSocket>['injectWebSocket'] | undefined
    const app = await buildApp({
      websocket: (api) => {
        const nodeWs = createNodeWebSocket({ app: api })
        injectWebSocket = nodeWs.injectWebSocket
        return nodeWs.upgradeWebSocket
      },
    })
    server = await new Promise<ServerType>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s))
    })
    injectWebSocket!(server)
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
    token = await signToken({ userId: 'u1', email: 'u1@example.com' })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isGlobalAdmin: false } as never)
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    vi.unstubAllEnvs()
  })

  it('closes the socket of a signed-in user who is not a member of the project', async () => {
    vi.mocked(prisma.membership.findFirst).mockResolvedValue(null)
    const ws = await injectWS('/ws/projects/p-other', { headers: { cookie: `token=${token}` } })
    expect(await closed(ws)).toBe(1008)
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', projectId: 'p-other' }) }),
    )
  })

  it('closes a socket with no session', async () => {
    const ws = await injectWS('/ws/projects/p1')
    expect(await closed(ws)).toBe(1008)
    expect(prisma.membership.findFirst).not.toHaveBeenCalled()
  })

  it('keeps a member connected', async () => {
    vi.mocked(prisma.membership.findFirst).mockResolvedValue({
      id: 'm',
      userId: 'u1',
      projectId: 'p1',
      role: 'READER',
      namespaces: '[]',
      assignedLocales: '[]',
    } as never)
    const ws = await injectWS('/ws/projects/p1', { headers: { cookie: `token=${token}` } })
    await new Promise((r) => setTimeout(r, 50))
    expect(ws.readyState).toBe(ws.OPEN)
    ws.terminate()
  })
})
