import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    project: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    membership: { findMany: vi.fn() },
  },
}))

import { prisma } from '../prisma.js'
import { aiEncryptionConfigured, decrypt, encrypt } from '../services/encryption.service.js'
import { getProjectAiConfig } from '../services/ai.service.js'
import { listProjects, updateProject } from '../services/project.service.js'

const aiProject = (aiApiKey: string) => ({ aiEnabled: true, aiProvider: 'openai', aiModel: null, aiApiKey })

describe('AI key encryption secret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('AI_ENCRYPTION_KEY', '')
    vi.stubEnv('ENCRYPTION_KEY', '')
    vi.stubEnv('AI_DEV_SECRET', '')
    vi.stubEnv('JWT_SECRET', 'the-session-secret')
    vi.stubEnv('NODE_ENV', 'development')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('refuses to encrypt with no dedicated secret, and never borrows JWT_SECRET or a built-in one', () => {
    expect(aiEncryptionConfigured()).toBe(false)
    expect(() => encrypt('sk-live')).toThrow(/AI_ENCRYPTION_KEY/)
  })

  it('uses a development secret only when AI_DEV_SECRET=true says so', () => {
    vi.stubEnv('AI_DEV_SECRET', 'true')
    expect(decrypt(encrypt('sk-dev'))).toBe('sk-dev')
  })

  it('round-trips with AI_ENCRYPTION_KEY, and a different secret cannot read it', () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'secret-one')
    const sealed = encrypt('sk-live')
    expect(decrypt(sealed)).toBe('sk-live')
    vi.stubEnv('AI_ENCRYPTION_KEY', 'secret-two')
    expect(() => decrypt(sealed)).toThrow()
  })

  it('refuses to save a key on a server with no secret', async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', aiApiKey: null } as never)
    await expect(updateProject('p1', { aiApiKey: 'sk-live' })).rejects.toMatchObject({ statusCode: 422 })
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it('encrypts whatever the client sends, even a value shaped like ciphertext', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'secret-one')
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: 'p1', aiApiKey: null } as never)
    vi.mocked(prisma.project.update).mockImplementation((async (args: { data: { aiApiKey: string } }) => ({
      id: 'p1',
      aiApiKey: args.data.aiApiKey,
    })) as never)
    const planted = 'AAAA:BBBB:CCCC'
    const saved = await updateProject('p1', { aiApiKey: planted })
    const stored = vi.mocked(prisma.project.update).mock.calls[0][0].data.aiApiKey as string
    expect(stored).not.toBe(planted)
    expect(decrypt(stored)).toBe(planted)
    // And the response carries only whether there is a key.
    expect(saved.aiApiKey).toBe('***')
  })

  it('never lists a project with its stored key', async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([{ projectId: 'p1' }] as never)
    vi.mocked(prisma.project.findMany).mockResolvedValue([{ id: 'p1', aiApiKey: 'iv:tag:data' }] as never)
    const [project] = await listProjects('u1')
    expect(project.aiApiKey).toBe('***')
  })

  it('refuses a legacy plain-text key rather than using it', () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'secret-one')
    expect(() => getProjectAiConfig(aiProject('sk-plaintext-from-before'))).toThrow(/entered again/)
  })

  it('asks for the key again when it was sealed with another secret', () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'old-secret')
    const sealed = encrypt('sk-live')
    vi.stubEnv('AI_ENCRYPTION_KEY', 'new-secret')
    expect(() => getProjectAiConfig(aiProject(sealed))).toThrow(/entered again/)
  })

  it('decrypts a key sealed with the configured secret', () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'secret-one')
    expect(getProjectAiConfig(aiProject(encrypt('sk-live'))).apiKey).toBe('sk-live')
  })
})
