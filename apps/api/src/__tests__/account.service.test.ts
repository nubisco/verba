import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    account: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    accountMember: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    membership: { deleteMany: vi.fn() },
    project: { findUnique: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

import { prisma } from '../prisma.js'
import {
  addMember,
  canCreateAccounts,
  createAccount,
  removeMember,
  requireAccountRole,
  resolveAccount,
  updateMemberRole,
} from '../services/account.service.js'

const ACCOUNT_A = { id: 'acc-a', name: 'A', slug: 'a', createdAt: new Date() }
const ACCOUNT_B = { id: 'acc-b', name: 'B', slug: 'b', createdAt: new Date() }

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('canCreateAccounts', () => {
  it('lets a person Platform marks as admin of this app create accounts', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ platformRole: 'admin', deactivatedAt: null } as never)
    expect(await canCreateAccounts('u1')).toBe(true)
  })

  it('refuses an ordinary member, whatever their project roles', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      platformRole: 'user',
      deactivatedAt: null,
      email: 'someone@example.com',
    } as never)
    expect(await canCreateAccounts('u1')).toBe(false)
  })

  it('lets an instance operator create accounts on an instance without Platform', async () => {
    vi.stubEnv('VERBA_OPERATORS', 'op@example.com')
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ platformRole: null, deactivatedAt: null } as never)
      .mockResolvedValueOnce({ email: 'op@example.com', deactivatedAt: null } as never)
    expect(await canCreateAccounts('op')).toBe(true)
  })

  it('refuses a deactivated person even with the admin role', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ platformRole: 'admin', deactivatedAt: new Date() } as never)
    expect(await canCreateAccounts('u1')).toBe(false)
  })
})

describe('createAccount', () => {
  it('refuses someone who may not create accounts, and writes nothing', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ platformRole: null, deactivatedAt: null } as never)
    await expect(createAccount('u1', { name: 'Acme' })).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('makes the creator the owner, with a slug from the name', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ platformRole: 'admin', deactivatedAt: null } as never)
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.account.create).mockResolvedValue({ id: 'acc1', name: 'Acme Ltd', slug: 'acme-ltd' } as never)
    const account = await createAccount('u1', { name: 'Acme Ltd' })
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { name: 'Acme Ltd', slug: 'acme-ltd', members: { create: { userId: 'u1', role: 'OWNER' } } },
    })
    expect(account.role).toBe('OWNER')
  })
})

describe('requireAccountRole', () => {
  it('answers 404 for an account the person is not in, the same as one that does not exist', async () => {
    vi.mocked(prisma.accountMember.findUnique).mockResolvedValue(null)
    await expect(requireAccountRole('u1', 'acc-b', 'MEMBER')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('answers 403 to a member below the role', async () => {
    vi.mocked(prisma.accountMember.findUnique).mockResolvedValue({ role: 'MEMBER' } as never)
    await expect(requireAccountRole('u1', 'acc-a', 'ADMIN')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('resolveAccount', () => {
  it('uses the named account when the person is in it, by id or slug', async () => {
    vi.mocked(prisma.accountMember.findFirst).mockResolvedValue({ role: 'ADMIN', account: ACCOUNT_A } as never)
    const account = await resolveAccount('u1', 'a')
    expect(account).toMatchObject({ id: 'acc-a', role: 'ADMIN' })
    expect(prisma.accountMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', account: { OR: [{ id: 'a' }, { slug: 'a' }] } } }),
    )
  })

  it('refuses to work in another account named on purpose: 404', async () => {
    vi.mocked(prisma.accountMember.findFirst).mockResolvedValue(null)
    await expect(resolveAccount('u1', 'acc-b')).rejects.toMatchObject({ statusCode: 404 })
  })

  it("defaults to the person's only account, so older clients keep working", async () => {
    vi.mocked(prisma.accountMember.findMany).mockResolvedValue([{ role: 'MEMBER', account: ACCOUNT_A }] as never)
    expect(await resolveAccount('u1')).toMatchObject({ id: 'acc-a' })
  })

  it('asks a person in several accounts to name one, and lists them', async () => {
    vi.mocked(prisma.accountMember.findMany).mockResolvedValue([
      { role: 'MEMBER', account: ACCOUNT_A },
      { role: 'OWNER', account: ACCOUNT_B },
    ] as never)
    await expect(resolveAccount('u1')).rejects.toMatchObject({
      statusCode: 400,
      details: { accounts: [expect.objectContaining({ id: 'acc-a' }), expect.objectContaining({ id: 'acc-b' })] },
    })
  })

  it('tells someone in no account that they are not in one yet', async () => {
    vi.mocked(prisma.accountMember.findMany).mockResolvedValue([])
    await expect(resolveAccount('u1')).rejects.toMatchObject({
      statusCode: 404,
      message: 'You are not in any account yet',
    })
  })
})

describe('account members', () => {
  it('lets an admin add a member, by an address that has signed in once', async () => {
    vi.mocked(prisma.accountMember.findUnique)
      .mockResolvedValueOnce({ role: 'ADMIN' } as never) // the actor
      .mockResolvedValueOnce(null) // not yet a member
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u9', deactivatedAt: null } as never)
    vi.mocked(prisma.accountMember.create).mockResolvedValue({ userId: 'u9', role: 'MEMBER' } as never)
    await addMember('admin', 'acc-a', { email: 'Bob@Example.com', role: 'MEMBER' })
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'bob@example.com' } }),
    )
    expect(prisma.accountMember.create).toHaveBeenCalledWith({
      data: { userId: 'u9', accountId: 'acc-a', role: 'MEMBER' },
    })
  })

  it('refuses a plain member adding people', async () => {
    vi.mocked(prisma.accountMember.findUnique).mockResolvedValue({ role: 'MEMBER' } as never)
    await expect(addMember('m', 'acc-a', { email: 'x@example.com', role: 'MEMBER' })).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('lets only an owner add an owner', async () => {
    vi.mocked(prisma.accountMember.findUnique).mockResolvedValue({ role: 'ADMIN' } as never)
    await expect(addMember('admin', 'acc-a', { email: 'x@example.com', role: 'OWNER' })).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('keeps the last owner', async () => {
    vi.mocked(prisma.accountMember.findUnique)
      .mockResolvedValueOnce({ role: 'OWNER' } as never)
      .mockResolvedValueOnce({ role: 'OWNER' } as never)
    vi.mocked(prisma.accountMember.count).mockResolvedValue(1)
    await expect(updateMemberRole('owner', 'acc-a', 'owner', 'ADMIN')).rejects.toMatchObject({ statusCode: 409 })
    expect(prisma.accountMember.update).not.toHaveBeenCalled()
  })

  it('does not let an admin demote an owner', async () => {
    vi.mocked(prisma.accountMember.findUnique)
      .mockResolvedValueOnce({ role: 'ADMIN' } as never)
      .mockResolvedValueOnce({ role: 'OWNER' } as never)
    await expect(updateMemberRole('admin', 'acc-a', 'owner', 'MEMBER')).rejects.toMatchObject({ statusCode: 403 })
  })

  it("ends someone's project memberships in the account when they are removed from it", async () => {
    vi.mocked(prisma.accountMember.findUnique)
      .mockResolvedValueOnce({ role: 'ADMIN' } as never)
      .mockResolvedValueOnce({ role: 'MEMBER' } as never)
    await removeMember('admin', 'acc-a', 'u9')
    expect(prisma.membership.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u9', project: { accountId: 'acc-a' } },
    })
    expect(prisma.accountMember.delete).toHaveBeenCalledWith({
      where: { userId_accountId: { userId: 'u9', accountId: 'acc-a' } },
    })
  })

  it('lets anyone leave, except the last owner', async () => {
    vi.mocked(prisma.accountMember.findUnique).mockResolvedValueOnce({ role: 'OWNER' } as never)
    vi.mocked(prisma.accountMember.count).mockResolvedValue(1)
    await expect(removeMember('owner', 'acc-a', 'owner')).rejects.toMatchObject({ statusCode: 409 })
  })
})
