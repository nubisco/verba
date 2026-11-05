import { describe, it, expect, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: { notification: { findMany: vi.fn() } },
}))

import { prisma } from '../prisma.js'
import { listNotifications } from '../services/notification.service.js'

describe('listNotifications', () => {
  // The bell shows the person who acted by their face (fleet standard, "A
  // person is an avatar"), so each notification carries the actor's picture.
  it("carries the actor's name, email and picture", async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([])
    await listNotifications('u1')
    const args = vi.mocked(prisma.notification.findMany).mock.calls[0][0]
    expect(args?.include?.actor).toEqual({ select: { id: true, name: true, email: true, avatarUrl: true } })
  })
})
