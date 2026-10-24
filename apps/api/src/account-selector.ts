import type { FastifyRequest } from 'fastify'

/**
 * The account a request names, by id or slug: the X-Verba-Account header, or
 * an `account` query parameter where a header cannot be set. Undefined when it
 * names none, and account.service resolveAccount then picks the person's only
 * account.
 */
export function accountSelector(req: FastifyRequest): string | undefined {
  const header = req.headers['x-verba-account']
  const fromHeader = Array.isArray(header) ? header[0] : header
  if (fromHeader?.trim()) return fromHeader.trim()
  const query = (req.query as { account?: unknown } | undefined)?.account
  return typeof query === 'string' && query.trim() ? query.trim() : undefined
}
