/**
 * Where the first-run check sends a navigation.
 *
 * `needsSetup` is what the API's `/setup/status` answered, or null when it
 * could not be reached. The API answers false on an instance that signs in
 * through its identity provider only (VERBA_AUTH_MODE=platform), even with an
 * empty database, so nobody there is ever sent to the wizard: they go to
 * sign-in, and the operator's first sign-in provisions them.
 *
 * - `allow`: let the navigation through without the other checks.
 * - `continue`: carry on with the sign-in and terms checks.
 * - a path: redirect there.
 */
export type FirstRunDecision = 'allow' | 'continue' | { path: string }

export function firstRunRedirect(to: string | symbol | null | undefined, needsSetup: boolean | null): FirstRunDecision {
  if (to === 'login') return 'allow'
  if (to === 'setup') {
    // A wizard with nothing to set up only ends in a refusal, so a link or a
    // bookmark to it lands on sign-in instead. Unknown (API unreachable): let
    // it open, as before.
    return needsSetup === false ? { path: '/login' } : 'allow'
  }
  return needsSetup === true ? { path: '/setup' } : 'continue'
}
