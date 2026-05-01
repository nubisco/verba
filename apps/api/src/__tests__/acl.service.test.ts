import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    membership: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import { canTransitionStatus, requireProjectRole, canWriteNamespace } from '../services/acl.service.js'
import { Role } from '../types.js'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: not a global admin: tests that need global admin override this
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    isGlobalAdmin: false,
  } as never)
})

describe('canTransitionStatus', () => {
  it('TRANSLATOR: TODO → IN_PROGRESS', () => {
    expect(canTransitionStatus(Role.TRANSLATOR, 'TODO', 'IN_PROGRESS')).toBe(true)
  })

  it('TRANSLATOR: IN_PROGRESS → SUBMITTED', () => {
    expect(canTransitionStatus(Role.TRANSLATOR, 'IN_PROGRESS', 'SUBMITTED')).toBe(true)
  })

  it('TRANSLATOR cannot: SUBMITTED → APPROVED', () => {
    expect(canTransitionStatus(Role.TRANSLATOR, 'SUBMITTED', 'APPROVED')).toBe(false)
  })

  it('MAINTAINER: SUBMITTED → APPROVED', () => {
    expect(canTransitionStatus(Role.MAINTAINER, 'SUBMITTED', 'APPROVED')).toBe(true)
  })

  it('ADMIN: SUBMITTED → APPROVED', () => {
    expect(canTransitionStatus(Role.ADMIN, 'SUBMITTED', 'APPROVED')).toBe(true)
  })

  it('ADMIN: TODO → IN_PROGRESS (inherits TRANSLATOR transitions)', () => {
    expect(canTransitionStatus(Role.ADMIN, 'TODO', 'IN_PROGRESS')).toBe(true)
  })

  it('ADMIN: IN_PROGRESS → SUBMITTED (inherits TRANSLATOR transitions)', () => {
    expect(canTransitionStatus(Role.ADMIN, 'IN_PROGRESS', 'SUBMITTED')).toBe(true)
  })

  it('MAINTAINER: APPROVED → IN_PROGRESS (reject)', () => {
    expect(canTransitionStatus(Role.MAINTAINER, 'APPROVED', 'IN_PROGRESS')).toBe(true)
  })

  it('READER cannot perform any transition', () => {
    expect(canTransitionStatus(Role.READER, 'TODO', 'IN_PROGRESS')).toBe(false)
  })

  it('TRANSLATOR cannot: TODO → APPROVED', () => {
    expect(canTransitionStatus(Role.TRANSLATOR, 'TODO', 'APPROVED')).toBe(false)
  })
})

describe('requireProjectRole', () => {
  it('throws 403 when membership not found', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null)
    await expect(requireProjectRole('user1', 'proj1', Role.READER)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('throws 403 when role is insufficient (READER requires MAINTAINER)', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: 'm1',
      userId: 'user1',
      projectId: 'proj1',
      role: Role.READER,
      namespaces: '[]',
      assignedLocales: '[]',
      createdAt: new Date(),
    })
    await expect(requireProjectRole('user1', 'proj1', Role.MAINTAINER)).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('passes when role meets minimum (ADMIN requires READER)', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: 'm1',
      userId: 'user1',
      projectId: 'proj1',
      role: Role.ADMIN,
      namespaces: '[]',
      assignedLocales: '[]',
      createdAt: new Date(),
    })
    const m = await requireProjectRole('user1', 'proj1', Role.READER)
    expect(m.role).toBe(Role.ADMIN)
  })

  it('passes when role exactly meets minimum', async () => {
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: 'm1',
      userId: 'user1',
      projectId: 'proj1',
      role: Role.TRANSLATOR,
      namespaces: '[]',
      assignedLocales: '[]',
      createdAt: new Date(),
    })
    const m = await requireProjectRole('user1', 'proj1', Role.TRANSLATOR)
    expect(m.role).toBe(Role.TRANSLATOR)
  })

  it('global admin bypasses membership check and gets ADMIN role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isGlobalAdmin: true,
    } as never)
    const m = await requireProjectRole('admin1', 'any-project', Role.MAINTAINER)
    expect(m.role).toBe(Role.ADMIN)
    expect(prisma.membership.findUnique).not.toHaveBeenCalled()
  })
})

describe('canWriteNamespace', () => {
  it('READER is always blocked', () => {
    expect(canWriteNamespace({ role: Role.READER, namespaces: [] }, 'ns1')).toBe(false)
  })

  it('ADMIN is always allowed', () => {
    expect(canWriteNamespace({ role: Role.ADMIN, namespaces: ['ns2'] }, 'ns1')).toBe(true)
  })

  it('MAINTAINER is always allowed', () => {
    expect(canWriteNamespace({ role: Role.MAINTAINER, namespaces: [] }, 'ns1')).toBe(true)
  })

  it('TRANSLATOR allowed when namespaces list is empty (all namespaces)', () => {
    expect(canWriteNamespace({ role: Role.TRANSLATOR, namespaces: [] }, 'ns1')).toBe(true)
  })

  it('TRANSLATOR allowed when namespace is in list', () => {
    expect(canWriteNamespace({ role: Role.TRANSLATOR, namespaces: ['ns1', 'ns2'] }, 'ns1')).toBe(true)
  })

  it('TRANSLATOR blocked when namespace not in list', () => {
    expect(canWriteNamespace({ role: Role.TRANSLATOR, namespaces: ['ns2', 'ns3'] }, 'ns1')).toBe(false)
  })
})
