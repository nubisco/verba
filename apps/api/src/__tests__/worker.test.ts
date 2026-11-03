import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// The Cloudflare Worker's pieces that run without workerd: the account's live
// hub with a stand-in for the Durable Object state, and wrangler.toml checked
// against the code. The Worker as a whole is proved under `wrangler dev`
// (docs/hosting-on-cloudflare.md).

import { WORKER_RATE_LIMITS } from '../rate-limits.js'
import type { CfWebSocket } from '../worker/cloudflare.js'
import { LIVE_MAX_AGE_MS, LIVE_MEMBER_HEADER, LiveHub } from '../worker/live-hub.js'

class FakeSocket implements CfWebSocket {
  readyState = 1
  sent: unknown[] = []
  closedWith: [number?, string?] | null = null
  private attachment: unknown = null
  accept() {}
  send(message: string) {
    this.sent.push(JSON.parse(message))
  }
  close(code?: number, reason?: string) {
    this.closedWith = [code, reason]
    this.readyState = 3
  }
  serializeAttachment(value: unknown) {
    this.attachment = value
  }
  deserializeAttachment() {
    return this.attachment
  }
}

function hub(now: () => number = Date.now) {
  const sockets: { ws: FakeSocket; tags: string[] }[] = []
  const state = {
    acceptWebSocket: (ws: CfWebSocket, tags: string[] = []) => sockets.push({ ws: ws as FakeSocket, tags }),
    getWebSockets: (tag?: string) => sockets.filter((s) => !tag || s.tags.includes(tag)).map((s) => s.ws),
  }
  // The hub makes the pair itself, so hand it fake ones.
  vi.stubGlobal(
    'WebSocketPair',
    class {
      0 = new FakeSocket()
      1 = new FakeSocket()
    },
  )
  // A 101 is not a status Node's Response accepts, and only workerd sends it.
  vi.stubGlobal(
    'Response',
    class {
      constructor(
        public body: unknown,
        public init: { status: number },
      ) {}
      get status() {
        return this.init.status
      }
      get ok() {
        return this.init.status < 300
      }
    },
  )
  return { hub: new LiveHub(state, {}, now), sockets }
}

function connect(h: LiveHub, member: { projectId: string; userId: string; email: string }) {
  return h.fetch(new Request('https://live-hub/connect', { headers: { [LIVE_MEMBER_HEADER]: JSON.stringify(member) } }))
}

function post(h: LiveHub, path: string, body: unknown) {
  return h.fetch(new Request(`https://live-hub${path}`, { method: 'POST', body: JSON.stringify(body) }))
}

describe('the live hub', () => {
  it('announces a newcomer to the room, and relays who is editing what', async () => {
    const { hub: h, sockets } = hub()
    await connect(h, { projectId: 'p1', userId: 'u1', email: 'a@example.com' })
    await connect(h, { projectId: 'p1', userId: 'u2', email: 'b@example.com' })
    const [first, second] = sockets.map((s) => s.ws)
    expect(first.sent).toEqual([{ type: 'presence.joined', userId: 'u2', email: 'b@example.com' }])
    expect(second.sent).toEqual([])

    h.webSocketMessage(second, JSON.stringify({ type: 'presence.editing', keyId: 'k1' }))
    expect(first.sent.at(-1)).toEqual({ type: 'presence.editing', userId: 'u2', email: 'b@example.com', keyId: 'k1' })

    h.webSocketClose(second, 1000, 'bye')
    expect(first.sent.at(-1)).toEqual({ type: 'presence.left', userId: 'u2' })
    vi.unstubAllGlobals()
  })

  it('broadcasts to one project and notifies one person', async () => {
    const { hub: h, sockets } = hub()
    await connect(h, { projectId: 'p1', userId: 'u1', email: 'a@example.com' })
    await connect(h, { projectId: 'p2', userId: 'u2', email: 'b@example.com' })
    const [inP1, inP2] = sockets.map((s) => s.ws)
    await post(h, '/broadcast', { projectId: 'p1', payload: { type: 'translation.updated' } })
    await post(h, '/notify', { userId: 'u2', payload: { type: 'notification.new' } })
    expect(inP1.sent).toEqual([{ type: 'translation.updated' }])
    expect(inP2.sent).toEqual([{ type: 'notification.new' }])
    vi.unstubAllGlobals()
  })

  it('closes a socket older than 30 minutes with 4001 instead of sending to it', async () => {
    let now = 1_000_000
    const { hub: h, sockets } = hub(() => now)
    await connect(h, { projectId: 'p1', userId: 'u1', email: 'a@example.com' })
    now += LIVE_MAX_AGE_MS + 1
    await post(h, '/broadcast', { projectId: 'p1', payload: { type: 'translation.updated' } })
    expect(sockets[0].ws.sent).toEqual([])
    expect(sockets[0].ws.closedWith).toEqual([4001, 'Sign in again'])
    vi.unstubAllGlobals()
  })

  it('refuses a connection that does not say who it is', async () => {
    const { hub: h } = hub()
    const res = await h.fetch(new Request('https://live-hub/connect'))
    expect(res.status).toBe(400)
    vi.unstubAllGlobals()
  })
})

describe('wrangler.toml', () => {
  const toml = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')

  it('has a rate limiting binding for every check, with the numbers in WORKER_RATE_LIMITS', () => {
    const blocks = [
      ...toml.matchAll(
        /\[\[ratelimits\]\]\s*name = "(\w+)"\s*namespace_id = "(\d+)"\s*simple = \{ limit = (\d+), period = (\d+) \}/g,
      ),
    ]
    const found = Object.fromEntries(
      blocks.map((m) => [m[1], { namespaceId: m[2], limit: Number(m[3]), period: Number(m[4]) }]),
    )
    for (const { binding, namespaceId, limit } of Object.values(WORKER_RATE_LIMITS)) {
      expect(found[binding], binding).toEqual({ namespaceId, limit, period: 60 })
    }
    expect(blocks).toHaveLength(Object.keys(WORKER_RATE_LIMITS).length)
  })

  it('applies the D1 history CI checks, and runs the live hub', () => {
    expect(toml).toMatch(/migrations_dir = "prisma\/d1"/)
    expect(toml).toMatch(/class_name = "LiveHub"/)
    expect(toml).toMatch(/compatibility_flags = \["nodejs_compat"\]/)
  })

  it('names no secret', () => {
    for (const secret of ['JWT_SECRET', 'AI_ENCRYPTION_KEY', 'RESEND_API_KEY', 'VERBA_LICENSES_SERVICE_TOKEN']) {
      expect(toml).not.toMatch(new RegExp(`^${secret}\\s*=`, 'm'))
    }
  })
})
