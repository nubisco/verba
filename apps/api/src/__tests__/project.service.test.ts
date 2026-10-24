import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma module
vi.mock('../prisma.js', () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn() },
    membership: { findMany: vi.fn(), count: vi.fn() },
  },
}))

import { prisma } from '../prisma.js'
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  toClientProject,
} from '../services/project.service.js'

const mockProject = {
  id: 'cuid1',
  name: 'Test Project',
  slug: 'test-project',
  avatar: null,
  aiProvider: null,
  aiApiKey: null,
  aiModel: null,
  aiEnabled: false,
  aiUpdatedAt: null,
  accountId: 'acc1',
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('toClientProject', () => {
  it('never sends the stored AI key, only whether there is one', () => {
    const client = toClientProject({ ...mockProject, aiApiKey: 'v1:aaaa:bbbb' })
    expect(client).not.toHaveProperty('aiApiKey')
    expect(client.aiHasKey).toBe(true)
    expect(toClientProject(mockProject).aiHasKey).toBe(false)
  })
})

describe('listProjects', () => {
  it("returns only the account's projects the user is a member of", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([mockProject])
    const result = await listProjects('u1', 'acc1')
    expect(result).toEqual([toClientProject(mockProject)])
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc1', memberships: { some: { userId: 'u1' } } } }),
    )
  })

  it('never lists the projects of another account, even ones the person is a member of', async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([])
    await listProjects('u1', 'acc2')
    const where = vi.mocked(prisma.project.findMany).mock.calls[0]![0]!.where
    expect(where).toMatchObject({ accountId: 'acc2' })
  })
})

describe('getProject', () => {
  it('returns project when found', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject)
    const result = await getProject('cuid1')
    expect(result).toEqual(toClientProject(mockProject))
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
    await expect(getProject('nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('createProject', () => {
  it('creates and returns project', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isGlobalAdmin: true } as never)
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.project.create).mockResolvedValue(mockProject)
    const result = await createProject('user1', 'pro', 'acc1', {
      name: 'Test Project',
      slug: 'test-project',
    })
    expect(result).toEqual(toClientProject(mockProject))
  })

  it('auto-suffixes slug when taken', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isGlobalAdmin: true } as never)
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce(mockProject).mockResolvedValueOnce(null)
    vi.mocked(prisma.project.create).mockResolvedValue(mockProject)
    await createProject('user1', 'pro', 'acc1', { name: 'Other', slug: 'test-project' })
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { name: 'Other', slug: 'test-project-2', accountId: 'acc1' },
    })
  })

  it('throws 402 when free-plan user is at the project cap', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isGlobalAdmin: false } as never)
    vi.mocked(prisma.membership.count).mockResolvedValue(3)
    await expect(createProject('user1', 'free', 'acc1', { name: 'X', slug: 'x' })).rejects.toMatchObject({
      statusCode: 402,
    })
  })
})

describe('updateProject', () => {
  it('updates and returns project', async () => {
    const updated = { ...mockProject, name: 'Updated' }
    vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject)
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.project.update).mockResolvedValue(updated)
    const result = await updateProject('cuid1', { name: 'Updated' })
    expect(result.name).toBe('Updated')
  })
})

describe('deleteProject', () => {
  it('deletes project', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject)
    vi.mocked(prisma.project.delete).mockResolvedValue(mockProject)
    await expect(deleteProject('cuid1')).resolves.toBeUndefined()
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
    await expect(deleteProject('nonexistent')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
