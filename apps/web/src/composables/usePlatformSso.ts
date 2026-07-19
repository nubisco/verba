import { useInstanceConfigStore } from '../stores/instanceConfig'

// Nubisco Platform multi-account SSO helpers.
// See platform docs: guide/multi-account.md. The platform keeps one browser
// session holding several identities, with a per-app "pin" deciding which
// identity this app resolves. Switching accounts is always a full SSO
// round-trip with login_hint; only that re-pins the app on the platform side.

export const PLATFORM_STATE_KEY = 'verba.platform.sso.state'
export const PLATFORM_REDIRECT_KEY = 'verba.platform.sso.redirect'

export interface PlatformIdentity {
  sub: string
  email: string
  name?: string | null
  auth_time: number
  platform_active?: boolean
}

export interface PlatformLoginOptions {
  /** Resume or switch to a specific account (email). */
  loginHint?: string
  /**
   * 'login' forces a fresh OTP (add another account),
   * 'select_account' shows the platform account chooser.
   * Omit to let the app's pin resolve the identity.
   */
  prompt?: 'login' | 'select_account'
  /** In-app path to return to after the callback (default /projects). */
  redirectTarget?: string
}

export function usePlatformSso() {
  const instanceConfig = useInstanceConfigStore()

  function issuer(): string | null {
    return instanceConfig.auth.platformIssuer
  }

  const enabled = () => instanceConfig.auth.platformEnabled && Boolean(issuer())

  /** Redirect the browser through the platform SSO flow. */
  function startPlatformLogin(options: PlatformLoginOptions = {}) {
    const iss = issuer()
    if (!iss) return

    const state = crypto.randomUUID()
    const callbackUrl = new URL(`${window.location.origin}${import.meta.env.BASE_URL}login`)

    sessionStorage.setItem(PLATFORM_STATE_KEY, state)
    sessionStorage.setItem(PLATFORM_REDIRECT_KEY, options.redirectTarget || '/projects')

    const ssoUrl = new URL('/api/auth/sso', iss)
    ssoUrl.searchParams.set('app_id', instanceConfig.auth.platformAppId || 'verba')
    ssoUrl.searchParams.set('redirect_uri', callbackUrl.toString())
    ssoUrl.searchParams.set('state', state)
    if (options.loginHint) ssoUrl.searchParams.set('login_hint', options.loginHint)
    if (options.prompt) ssoUrl.searchParams.set('prompt', options.prompt)

    window.location.href = ssoUrl.toString()
  }

  /**
   * List the identities signed in on this browser (cross-origin, cookie-based:
   * requires the platform to allow this origin with CORS credentials).
   * Returns [] when unavailable so callers can degrade gracefully.
   */
  async function fetchIdentities(): Promise<PlatformIdentity[]> {
    const iss = issuer()
    if (!iss) return []
    try {
      const res = await fetch(new URL('/api/auth/identities', iss), { credentials: 'include' })
      if (!res.ok) return []
      const data = (await res.json()) as { identities?: PlatformIdentity[] }
      return data.identities ?? []
    } catch {
      return []
    }
  }

  /** Sign one account out of the browser without touching the others. */
  async function removeIdentity(sub: string): Promise<boolean> {
    const iss = issuer()
    if (!iss) return false
    try {
      const res = await fetch(new URL('/api/auth/identities/remove', iss), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: sub }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  return { enabled, startPlatformLogin, fetchIdentities, removeIdentity }
}
