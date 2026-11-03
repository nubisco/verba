// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * The signature on licenses' webhooks, the same as the platform webhooks:
 * `X-Nubisco-Signature: sha256=<hex HMAC-SHA256(secret, raw body)>`.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export function hmacSha256Hex(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

/** Whether `header` signs `rawBody` with `secret`, compared in constant time. */
export function signatureMatches(secret: string, rawBody: string, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false
  const given = header.slice('sha256='.length)
  // A sha256 in hex is 64 characters. Checking the shape first rejects a
  // malformed header on its length and keeps the compare over equal lengths.
  if (!/^[0-9a-f]{64}$/i.test(given)) return false
  const expected = hmacSha256Hex(secret, rawBody)
  return timingSafeEqual(Buffer.from(given.toLowerCase(), 'utf8'), Buffer.from(expected, 'utf8'))
}
