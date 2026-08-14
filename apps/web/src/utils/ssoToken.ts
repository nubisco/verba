/**
 * Consumes the platform SSO token out of the callback URL before anything else
 * can observe it.
 *
 * The platform hands off by redirecting to our registered redirect_uri with the
 * access token in the query string (`/login?token=<JWT>&state=<uuid>`). That
 * token is a live credential, so every millisecond it stays in the address bar
 * it is exposed to: browser history, the Referer header of any third-party
 * request the page makes, server access logs, and analytics or error trackers
 * that read `location.href` when they boot. We already saw the real damage:
 * nubisco/analytics stored full callback URLs, tokens included.
 *
 * The fix is ordering. `consumeSsoTokenFromUrl()` runs as the very first
 * statement in `main.ts`, before Sentry and the analytics script initialise and
 * before the router parses the URL. It moves the token into module memory and
 * rewrites the address bar with `history.replaceState` (replace, not push, so
 * the tokenised URL never becomes a history entry). `takeSsoToken()` then hands
 * it to the login view exactly once.
 *
 * Only `token` is removed. `state`, `redirect` and `error` are not credentials
 * and stay in the query so the existing callback handling is untouched.
 */

const TOKEN_PARAM = 'token'

let pendingToken: string | null = null

/**
 * Strip the SSO token from the current URL and hold it in memory.
 *
 * Safe to call more than once (HMR, tests): a second call with no token in the
 * URL leaves any already-captured token alone.
 */
export function consumeSsoTokenFromUrl(): void {
  if (typeof window === 'undefined' || !window.location) return

  const url = new URL(window.location.href)
  const token = url.searchParams.get(TOKEN_PARAM)
  if (!token) return

  pendingToken = token
  url.searchParams.delete(TOKEN_PARAM)
  // Keep the rest of the URL byte-identical, including a bare "?" free path
  // when the token was the only parameter.
  const cleaned = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', cleaned)
}

/**
 * Return the captured token and forget it, so a later visit to /login in the
 * same SPA session cannot replay a stale token.
 */
export function takeSsoToken(): string | null {
  const token = pendingToken
  pendingToken = null
  return token
}

/** Test-only helper: drop any captured token between cases. */
export function resetSsoTokenForTests(): void {
  pendingToken = null
}
