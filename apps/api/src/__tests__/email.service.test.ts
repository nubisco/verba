import { describe, expect, it, vi } from 'vitest'
import { escapeHtml, sendEmail } from '../services/email.service.js'

// Email is one POST to Resend (AGENTS.md, "Transactional email: Resend over
// fetch"): no SMTP, no default sender, and everything interpolated is escaped.

const email = { to: 'a@example.com', subject: 'Code', text: 'Your code', html: '<p>Your code</p>' }

describe('sendEmail', () => {
  it('sends nothing without a key, so the caller can log instead', async () => {
    const fetchImpl = vi.fn()
    await expect(sendEmail(email, {}, fetchImpl as never)).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses to guess a sender when MAIL_FROM is missing, and names example.com', async () => {
    const fetchImpl = vi.fn()
    await expect(sendEmail(email, { RESEND_API_KEY: 'k' }, fetchImpl as never)).rejects.toThrow(
      /MAIL_FROM.*example\.com/,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts the text and html parts to Resend from MAIL_FROM', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    await expect(
      sendEmail(email, { RESEND_API_KEY: 'k', MAIL_FROM: 'Verba <auth@example.com>' }, fetchImpl as never),
    ).resolves.toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect(JSON.parse(String(init.body))).toEqual({ from: 'Verba <auth@example.com>', ...email })
  })

  it('fails loudly when Resend refuses', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 422, statusText: 'Unprocessable' }))
    await expect(
      sendEmail(email, { RESEND_API_KEY: 'k', MAIL_FROM: 'Verba <auth@example.com>' }, fetchImpl as never),
    ).rejects.toThrow(/422/)
  })
})

describe('escapeHtml', () => {
  it('escapes what could break out of the markup', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})
