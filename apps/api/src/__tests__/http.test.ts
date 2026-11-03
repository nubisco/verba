import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// What the HTTP layer does on its own, apart from any route's logic: the
// answers Fastify gave for bodies, unknown routes and uploads, which the move
// to Hono had to reproduce by hand. The services are mocked.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    membership: { findFirst: vi.fn() },
  },
}))

vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))

vi.mock('../services/export.service.js', () => ({
  exportLocale: vi.fn(async () => ({ 'app.title': 'Hello' })),
  exportTranslations: vi.fn(),
}))

vi.mock('../services/import.service.js', () => ({
  parseFile: vi.fn(() => []),
  previewImport: vi.fn(async () => ({ created: 0, updated: 0, skipped: 0, rows: [] })),
  applyImport: vi.fn(),
}))

import { BODY_LIMIT_BYTES, buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import { exportLocale } from '../services/export.service.js'
import { previewImport } from '../services/import.service.js'
import { UPLOAD_LIMIT_BYTES } from '../routes/import.js'
import { inject, signToken } from './inject.js'

let app: Awaited<ReturnType<typeof buildApp>>
let cookies: Record<string, string>

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('JWT_SECRET', 'test-secret')
  app = await buildApp()
  cookies = { token: await signToken({ userId: 'u1', email: 'u1@example.com' }) }
  vi.mocked(prisma.membership.findFirst).mockResolvedValue({
    role: 'ADMIN',
    namespaces: '[]',
    assignedLocales: '[]',
  } as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/** A multipart body with a mapping field and one file. */
function upload(content: string): { body: FormData } {
  const form = new FormData()
  form.append('mapping', JSON.stringify({ keyColumn: 'key', localeColumns: { en: 'en' } }))
  form.append('file', new Blob([content], { type: 'text/csv' }), 'strings.csv')
  return { body: form }
}

describe('the HTTP layer', () => {
  it('answers an unknown route as Fastify did', async () => {
    const res = await inject(app, { method: 'GET', url: '/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ message: 'Route GET:/nope not found', error: 'Not Found', statusCode: 404 })
  })

  it('refuses malformed JSON with 400', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/projects',
      cookies,
      payload: '{"name":',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/not valid JSON/)
  })

  it('refuses a body over 1 MiB with 413', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/auth/otp/request',
      payload: JSON.stringify({ email: 'a@example.com', pad: 'x'.repeat(BODY_LIMIT_BYTES) }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode).toBe(413)
  })

  it('serves /export/<locale>.json with the locale taken from the file name', async () => {
    const res = await inject(app, { method: 'GET', url: '/projects/p1/export/pt-PT.json', cookies })
    expect(res.statusCode).toBe(200)
    expect(vi.mocked(exportLocale)).toHaveBeenCalledWith('p1', 'pt-PT')
    expect(res.headers['content-disposition']).toBe('attachment; filename="pt-PT.json"')
    expect(res.json()).toEqual({ 'app.title': 'Hello' })
  })

  it('takes an import file with its mapping field', async () => {
    const res = await app.request('/projects/p1/import/preview', {
      method: 'POST',
      headers: { cookie: `token=${cookies.token}` },
      ...upload('key,en\napp.title,Hello\n'),
    })
    expect(res.status).toBe(200)
    expect(vi.mocked(previewImport)).toHaveBeenCalledOnce()
  })

  // Fastify cut such a file at the limit without saying so and imported the rest.
  it('refuses an import file over the limit with 413 instead of cutting it', async () => {
    const res = await app.request('/projects/p1/import/preview', {
      method: 'POST',
      headers: { cookie: `token=${cookies.token}` },
      ...upload('x'.repeat(UPLOAD_LIMIT_BYTES + 1)),
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: 'request file too large' })
    expect(vi.mocked(previewImport)).not.toHaveBeenCalled()
  })
})
