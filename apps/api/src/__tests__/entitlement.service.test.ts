import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Ctx } from '../http.js'

// Mock prisma (entitlement.service imports it)
vi.mock('../prisma.js', () => ({
  prisma: {},
}))

// Mock the EE package: controls what entitlements are returned
const mockResolveEntitlements = vi.fn()
const mockHasFeature = vi.fn()

vi.mock('@nubisco/verba-ee', () => ({
  resolveEntitlements: mockResolveEntitlements,
  hasFeature: mockHasFeature,
}))

import { requireEntitlement, requireWithinLimit, orgHasFeature } from '../services/entitlement.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// A request context that records what was answered, and the `next` a guard
// calls to let the request through. Status 0 means nothing was answered.
function makeReply(params: Record<string, string> = {}) {
  const reply = {
    _status: 0,
    _body: undefined as unknown,
    req: { param: (name: string) => params[name] },
    json(body: unknown, status: number) {
      this._status = status
      this._body = body
      return new Response(JSON.stringify(body), { status })
    },
  }
  return reply as unknown as Ctx & { _status: number; _body: unknown }
}

const next = vi.fn(async () => {})

// ---------------------------------------------------------------------------
// orgHasFeature
// ---------------------------------------------------------------------------

describe('orgHasFeature', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when EE says feature is entitled', async () => {
    mockHasFeature.mockResolvedValue(true)
    expect(await orgHasFeature('org_1', 'sso')).toBe(true)
  })

  it('returns false when EE says feature is not entitled', async () => {
    mockHasFeature.mockResolvedValue(false)
    expect(await orgHasFeature('org_1', 'sso')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// requireEntitlement middleware
// ---------------------------------------------------------------------------

describe('requireEntitlement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not send a reply when feature is entitled', async () => {
    mockHasFeature.mockResolvedValue(true)
    const reply = makeReply()
    const guard = requireEntitlement('sso')
    await guard(reply, next)
    expect(reply._status).toBe(0) // not called
  })

  it('returns 402 when feature is not entitled', async () => {
    mockHasFeature.mockResolvedValue(false)
    const reply = makeReply()
    const guard = requireEntitlement('sso')
    await guard(reply, next)
    expect(reply._status).toBe(402)
    expect((reply._body as { feature: string }).feature).toBe('sso')
  })

  it('uses custom orgId resolver', async () => {
    mockHasFeature.mockResolvedValue(false)
    const reply = makeReply({ orgId: 'org_custom' })
    const guard = requireEntitlement('webhooks', (c) => c.req.param('orgId') as string)
    await guard(reply, next)
    // hasFeature should have been called with 'org_custom'
    expect(mockHasFeature).toHaveBeenCalledWith(expect.anything(), 'org_custom', 'webhooks')
  })
})

// ---------------------------------------------------------------------------
// requireWithinLimit middleware
// ---------------------------------------------------------------------------

describe('requireWithinLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  const makeCtx = (maxProjects: number | null) => ({
    entitlements: {
      maxProjects,
      maxSeatsPerProject: null,
      maxKeysPerProject: null,
      maxLocalesPerProject: null,
      maxMonthlyApiCalls: null,
    },
  })

  it('passes through when limit is null (unlimited)', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(null))
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 999)
    await guard(reply, next)
    expect(reply._status).toBe(0)
  })

  it('passes through when current count is below limit', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(10))
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 5)
    await guard(reply, next)
    expect(reply._status).toBe(0)
  })

  it('returns 402 when current count meets the limit', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(3))
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 3)
    await guard(reply, next)
    expect(reply._status).toBe(402)
    const body = reply._body as { limitKey: string; limit: number; current: number }
    expect(body.limitKey).toBe('maxProjects')
    expect(body.limit).toBe(3)
    expect(body.current).toBe(3)
  })

  it('returns 402 when current count exceeds the limit', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(3))
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 5)
    await guard(reply, next)
    expect(reply._status).toBe(402)
  })
})
