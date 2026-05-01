import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'

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

function makeReply() {
  const reply = {
    _status: 0,
    _body: undefined as unknown,
    status(code: number) {
      this._status = code
      return this
    },
    send(body: unknown) {
      this._body = body
      return this
    },
  }
  return reply as unknown as FastifyReply & { _status: number; _body: unknown }
}

function makeRequest(extras: Partial<FastifyRequest> = {}) {
  return extras as FastifyRequest
}

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
// requireEntitlement preHandler
// ---------------------------------------------------------------------------

describe('requireEntitlement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not send a reply when feature is entitled', async () => {
    mockHasFeature.mockResolvedValue(true)
    const req = makeRequest()
    const reply = makeReply()
    const guard = requireEntitlement('sso')
    await guard(req, reply)
    expect(reply._status).toBe(0) // not called
  })

  it('returns 402 when feature is not entitled', async () => {
    mockHasFeature.mockResolvedValue(false)
    const req = makeRequest()
    const reply = makeReply()
    const guard = requireEntitlement('sso')
    await guard(req, reply)
    expect(reply._status).toBe(402)
    expect((reply._body as { feature: string }).feature).toBe('sso')
  })

  it('uses custom orgId resolver', async () => {
    mockHasFeature.mockResolvedValue(false)
    const req = makeRequest({ params: { orgId: 'org_custom' } } as Partial<FastifyRequest>)
    const reply = makeReply()
    const guard = requireEntitlement('webhooks', (r) => (r.params as { orgId: string }).orgId)
    await guard(req, reply)
    // hasFeature should have been called with 'org_custom'
    expect(mockHasFeature).toHaveBeenCalledWith(expect.anything(), 'org_custom', 'webhooks')
  })
})

// ---------------------------------------------------------------------------
// requireWithinLimit preHandler
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
    const req = makeRequest()
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 999)
    await guard(req, reply)
    expect(reply._status).toBe(0)
  })

  it('passes through when current count is below limit', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(10))
    const req = makeRequest()
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 5)
    await guard(req, reply)
    expect(reply._status).toBe(0)
  })

  it('returns 402 when current count meets the limit', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(3))
    const req = makeRequest()
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 3)
    await guard(req, reply)
    expect(reply._status).toBe(402)
    const body = reply._body as { limitKey: string; limit: number; current: number }
    expect(body.limitKey).toBe('maxProjects')
    expect(body.limit).toBe(3)
    expect(body.current).toBe(3)
  })

  it('returns 402 when current count exceeds the limit', async () => {
    mockResolveEntitlements.mockResolvedValue(makeCtx(3))
    const req = makeRequest()
    const reply = makeReply()
    const guard = requireWithinLimit('maxProjects', () => 5)
    await guard(req, reply)
    expect(reply._status).toBe(402)
  })
})
