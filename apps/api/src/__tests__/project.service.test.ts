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
    membership: { findMany: vi.fn() },
  },
}))

import { prisma } from '../prisma.js'
import { listProjects, getProject, createProject, updateProject, deleteProject } from '../services/project.service.js'

const mockProject = {
  id: 'cuid1',
  name: 'Test Project',
  slug: 'test-project',
  avatar: null,
  aiProvider: null,
  aiApiKey: null,
  aiModel: null,
  aiEnabled: false,
  organizationId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listProjects', () => {
  it('returns only projects the user is a member of', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isGlobalAdmin: false,
    } as never)
    vi.mocked(prisma.membership.findMany).mockResolvedValue([{ projectId: mockProject.id }] as never)
    vi.mocked(prisma.project.findMany).mockResolvedValue([mockProject])
    const result = await listProjects('u1')
    expect(result).toEqual([mockProject])
  })

  it('global admin sees all projects', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      isGlobalAdmin: true,
    } as never)
    vi.mocked(prisma.project.findMany).mockResolvedValue([mockProject])
    const result = await listProjects('admin1')
    expect(result).toEqual([mockProject])
    expect(prisma.membership.findMany).not.toHaveBeenCalled()
  })
})

describe('getProject', () => {
  it('returns project when found', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject)
    const result = await getProject('cuid1')
    expect(result).toEqual(mockProject)
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
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.project.create).mockResolvedValue(mockProject)
    const result = await createProject({
      name: 'Test Project',
      slug: 'test-project',
    })
    expect(result).toEqual(mockProject)
  })

  it('throws 409 when slug is taken', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject)
    await expect(createProject({ name: 'Other', slug: 'test-project' })).rejects.toMatchObject({
      statusCode: 409,
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
