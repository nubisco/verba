import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed'),
    compare: vi.fn(),
  },
}))

import { prisma } from '../prisma.js'
import bcrypt from 'bcryptjs'
import { register, login, getMe } from '../services/auth.service.js'

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  name: null,
  passwordHash: 'hashed',
  isGlobalAdmin: false,
  createdAt: new Date(),
  deactivatedAt: null,
  preferredLocales: '[]',
  notificationOpenMode: 'inspector',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.user.count).mockResolvedValue(1)
})

describe('register', () => {
  it('creates a new user and returns public fields', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.count).mockResolvedValue(1)
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser)
    const result = await register('test@example.com', 'password')
    expect(result).toMatchObject({ email: 'test@example.com' })
    expect(bcrypt.hash).toHaveBeenCalledWith('password', 10)
  })

  it('sets isGlobalAdmin for first registered user', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.count).mockResolvedValue(0)
    vi.mocked(prisma.user.create).mockResolvedValue({
      ...mockUser,
      isGlobalAdmin: true,
    })
    await register('admin@example.com', 'password')
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isGlobalAdmin: true }),
      }),
    )
  })

  it('throws 409 when email already in use', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    await expect(register('test@example.com', 'password')).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('login', () => {
  it('returns userId and email on valid credentials', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    const result = await login('test@example.com', 'password')
    expect(result).toMatchObject({ userId: 'u1', email: 'test@example.com' })
  })

  it('throws 401 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await expect(login('nope@example.com', 'pw')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  it('throws 401 when password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    await expect(login('test@example.com', 'wrongpw')).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})

describe('getMe', () => {
  it('returns public user fields', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser)
    const result = await getMe('u1')
    expect(result).toMatchObject({ id: 'u1', email: 'test@example.com' })
  })

  it('throws 404 when user not found', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await expect(getMe('missing')).rejects.toMatchObject({ statusCode: 404 })
  })
})
