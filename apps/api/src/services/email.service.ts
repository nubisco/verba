// Outgoing email: one POST to Resend, and nothing else (AGENTS.md,
// "Transactional email: Resend over fetch"). The same code runs on Node and
// on a Cloudflare Worker, where an SMTP client cannot run.
//
// - No RESEND_API_KEY: nothing is sent and the caller decides what to do (a
//   sign-in code is written to the server log, as in development).
// - A key without MAIL_FROM is a misconfiguration: it says so and sends
//   nothing, rather than guess a sender. There is no default address.

export interface Email {
  to: string | string[]
  subject: string
  text: string
  html: string
}

/** Escape text for HTML. Everything interpolated into an email goes through this. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function emailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY)
}

/** Send through Resend. False when no key is set, so nothing was sent. */
export async function sendEmail(
  email: Email,
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false
  const from = env.MAIL_FROM?.trim()
  if (!from) {
    throw new Error(
      'RESEND_API_KEY is set but MAIL_FROM is not. Set it, for example MAIL_FROM="Verba <auth@example.com>".',
    )
  }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text, html: email.html }),
  })
  if (!res.ok) throw new Error(`Resend refused the email: ${res.status} ${res.statusText}`)
  return true
}
