import type { Ctx } from './http.js'

/**
 * The account a request names, by id or slug: the X-Verba-Account header, or
 * an `account` query parameter where a header cannot be set. Undefined when it
 * names none, and account.service resolveAccount then picks the person's only
 * account.
 */
export function accountSelector(c: Ctx): string | undefined {
  const fromHeader = c.req.header('x-verba-account')
  if (fromHeader?.trim()) return fromHeader.trim()
  const query = c.req.query('account')
  return typeof query === 'string' && query.trim() ? query.trim() : undefined
}
