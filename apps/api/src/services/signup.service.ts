// Who may create an account on this instance, and which terms they accept.
//
// The same shape as Acta's signup switch (LA-402), with one difference in the
// default: a self-hosted Verba has always let anyone with a working address
// sign in, so sign-up is open unless VERBA_SIGNUP_OPEN is "false". Hosted
// Verba sets it to "false" until its terms are published (apps/api/wrangler.toml).
//
// Closed means no new users, by any door: an email code, a password
// registration, or a federated sign-in that would provision someone. People
// who already have an account sign in as before. Addresses named in
// VERBA_OPERATORS are always let through, so whoever runs the instance can
// still get in (first-run setup only accepts them anyway).
//
// Terms: when VERBA_TERMS_VERSION is set, a new account accepts that version,
// and the version and time are stored on the user. A different version asks
// everyone again, and the API refuses everything but the /auth routes until
// they accept (session.ts). Unset, there is no terms step at all.
//
// Every acceptance, at sign-up and again after a new version, is also an
// event (`terms.accepted`) in the instance audit record, the way Acta records
// the terms a workspace was created under. The user row only holds the
// latest. The instance audit record is never pruned (maintenance.service.ts
// only applies retention to project audit logs), so the history stays.

import { prisma } from '../prisma.js'
import { isOperatorEmail, recordInstanceAudit } from './operator.service.js'

/** Whether strangers may create an account here. Open unless VERBA_SIGNUP_OPEN is "false". */
export function signupOpen(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERBA_SIGNUP_OPEN?.trim().toLowerCase() !== 'false'
}

/** The legal documents a person accepts, when the deployment names a version. */
export interface TermsConfig {
  version: string
  termsUrl: string | null
  privacyUrl: string | null
}

export function termsConfig(env: Record<string, string | undefined> = process.env): TermsConfig | null {
  const version = env.VERBA_TERMS_VERSION?.trim()
  if (!version) return null
  return {
    version,
    termsUrl: env.VERBA_TERMS_URL?.trim() || null,
    privacyUrl: env.VERBA_PRIVACY_URL?.trim() || null,
  }
}

/** The words a person sees when sign-up is closed. One sentence for every door. */
export const SIGNUP_CLOSED_MESSAGE =
  'This Verba instance is not open for new accounts yet. If you already have an account, sign in with the address it uses.'

export function signupClosedError(): Error {
  return Object.assign(new Error(SIGNUP_CLOSED_MESSAGE), {
    statusCode: 403,
    details: { code: 'signup_closed' },
  })
}

/** Throws 403 `signup_closed` unless a new account may be created for this address. */
export function assertSignupAllowed(email: string): void {
  if (signupOpen() || isOperatorEmail(email)) return
  throw signupClosedError()
}

export function termsRequiredError(terms: TermsConfig): Error {
  return Object.assign(new Error('Accept the terms of service and the privacy notice to continue'), {
    statusCode: 409,
    details: { code: 'terms_required', terms },
  })
}

/**
 * What a new account stores about the terms, given the version the person
 * ticked. Nothing when the instance has no terms. Throws 409 `terms_required`
 * when it has some and the person did not accept this version.
 */
export function termsForNewAccount(
  accepted: string | undefined | null,
  now: Date = new Date(),
): { termsVersion: string; termsAcceptedAt: Date } | Record<string, never> {
  const terms = termsConfig()
  if (!terms) return {}
  if (accepted !== terms.version) throw termsRequiredError(terms)
  return { termsVersion: terms.version, termsAcceptedAt: now }
}

/** Whether this person has accepted the current terms. Always true without terms. */
export function hasAcceptedTerms(termsVersion: string | null | undefined): boolean {
  const terms = termsConfig()
  return !terms || termsVersion === terms.version
}

/** The terms state /auth/me reports: null on an instance without terms. */
export function termsStatus(termsVersion: string | null | undefined) {
  const terms = termsConfig()
  if (!terms) return null
  return { ...terms, accepted: termsVersion === terms.version }
}

/** The version a user has accepted, for the session claim. */
export async function acceptedTermsVersion(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { termsVersion: true } })
  return user?.termsVersion ?? null
}

/** One `terms.accepted` event: who, which version, and when. */
export async function recordTermsAcceptance(userId: string, version: string, at: Date): Promise<void> {
  await recordInstanceAudit({
    actorId: userId,
    action: 'terms.accepted',
    targetUserId: userId,
    detail: { version, acceptedAt: at.toISOString() },
  })
}

/**
 * Record that a signed-in person accepted the current terms. The version they
 * ticked must be the current one, so a page left open across a change of
 * terms cannot accept the old ones.
 */
export async function acceptTerms(userId: string, version: string, now: Date = new Date()): Promise<string> {
  const terms = termsConfig()
  if (!terms) throw Object.assign(new Error('This instance has no terms to accept'), { statusCode: 404 })
  if (version !== terms.version) throw termsRequiredError(terms)
  await prisma.user.update({ where: { id: userId }, data: { termsVersion: terms.version, termsAcceptedAt: now } })
  await recordTermsAcceptance(userId, terms.version, now)
  return terms.version
}
