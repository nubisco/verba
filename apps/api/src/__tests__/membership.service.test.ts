import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    membership: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import {
  listMembers,
  addMember,
  updateMember,
  removeMember,
  getMembership,
  parseNamespaces,
} from '../services/membership.service.js'
import { Role } from '../types.js'

const mockMembership = {
  id: 'm1',
  userId: 'u1',
  projectId: 'p1',
  role: Role.TRANSLATOR,
  namespaces: '["ns1"]',
  assignedLocales: '[]',
  createdAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

describe('parseNamespaces', () => {
  it('parses valid JSON array', () => {
    expect(parseNamespaces('["ns1","ns2"]')).toEqual(['ns1', 'ns2'])
  })

  it('returns empty array on invalid JSON', () => {
    expect(parseNamespaces('not-json')).toEqual([])
  })
})

describe('listMembers', () => {
  it('returns members with parsed namespaces', async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      { ...mockMembership, user: { id: 'u1', email: 'a@b.com' } } as never,
    ])
    const members = await listMembers('p1')
    expect(members[0].namespaces).toEqual(['ns1'])
  })
})

describe('addMember', () => {
  it('upserts membership and returns parsed namespaces', async () => {
    vi.mocked(prisma.membership.upsert).mockResolvedValue(mockMembership)
    const result = await addMember('p1', {
      userId: 'u1',
      role: Role.TRANSLATOR,
      namespaceIds: ['ns1'],
    })
    expect(result.namespaces).toEqual(['ns1'])
  })
})

describe('updateMember', () => {
  it('updates role', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(mockMembership)
    vi.mocked(prisma.membership.update).mockResolvedValue({
      ...mockMembership,
      role: Role.MAINTAINER,
    })
    const result = await updateMember('p1', 'u1', { role: Role.MAINTAINER })
    expect(result.role).toBe(Role.MAINTAINER)
  })

  it('throws 404 when membership not found', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null)
    await expect(updateMember('p1', 'u1', { role: Role.READER })).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('removeMember', () => {
  it('removes membership', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(mockMembership)
    vi.mocked(prisma.membership.delete).mockResolvedValue(mockMembership)
    await expect(removeMember('p1', 'u1')).resolves.toBeUndefined()
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null)
    await expect(removeMember('p1', 'u1')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('getMembership', () => {
  it('returns null when no membership', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null)
    expect(await getMembership('u1', 'p1')).toBeNull()
  })

  it('returns membership with parsed namespaces', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(mockMembership)
    const result = await getMembership('u1', 'p1')
    expect(result?.namespaces).toEqual(['ns1'])
  })
})
