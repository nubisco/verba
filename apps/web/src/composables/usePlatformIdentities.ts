import { ref } from 'vue'
import { apiFetch } from '../api'
import { useInstanceConfigStore } from '../stores/instanceConfig'

export interface PlatformIdentity {
  platform_sub: string
  email: string
  name: string | null
  is_active: boolean
  last_used_at: string
}

// Module-level singletons so every component shares the same list. The state
// only changes via the action functions below, which all reload from the API.
const identities = ref<PlatformIdentity[]>([])
const switching = ref(false)
const loaded = ref(false)

// These keys must match LoginView.vue's PLATFORM_STATE_KEY / PLATFORM_REDIRECT_KEY
// so the CSRF state set here is found by the same callback handler over there.
const PLATFORM_STATE_KEY = 'verba.platform.sso.state'
const PLATFORM_REDIRECT_KEY = 'verba.platform.sso.redirect'

function buildSsoUrl(opts: { loginHint?: string; promptLogin?: boolean; redirect?: string }): string {
  const instanceConfig = useInstanceConfigStore()
  const issuer = instanceConfig.auth.platformIssuer
  const appId = instanceConfig.auth.platformAppId || 'verba'
  if (!issuer) throw new Error('Platform issuer not configured')
  const state = crypto.randomUUID()
  sessionStorage.setItem(PLATFORM_STATE_KEY, state)
  sessionStorage.setItem(PLATFORM_REDIRECT_KEY, opts.redirect ?? window.location.pathname)
  const callbackUrl = new URL(`${window.location.origin}${import.meta.env.BASE_URL}login`)
  const url = new URL('/api/auth/sso', issuer)
  url.searchParams.set('app_id', appId)
  url.searchParams.set('redirect_uri', callbackUrl.toString())
  url.searchParams.set('state', state)
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint)
  if (opts.promptLogin) url.searchParams.set('prompt', 'login')
  return url.toString()
}

export function usePlatformIdentities() {
  async function load() {
    const instanceConfig = useInstanceConfigStore()
    if (!instanceConfig.auth.platformEnabled) {
      identities.value = []
      loaded.value = true
      return
    }
    try {
      const res = await apiFetch<{ identities: PlatformIdentity[] }>('/auth/identities')
      identities.value = res.identities ?? []
    } catch {
      identities.value = []
    } finally {
      loaded.value = true
    }
  }

  async function switchTo(identity: PlatformIdentity) {
    if (identity.is_active) return
    switching.value = true
    try {
      // Confirm the identity belongs to the bundle and grab the canonical email.
      const res = await apiFetch<{ email: string }>('/auth/switch', {
        method: 'POST',
        body: JSON.stringify({ platform_sub: identity.platform_sub }),
      })
      window.location.href = buildSsoUrl({ loginHint: res.email })
    } catch (e) {
      switching.value = false
      throw e
    }
  }

  function addAnother() {
    window.location.href = buildSsoUrl({ promptLogin: true })
  }

  async function remove(identity: PlatformIdentity): Promise<{ activeRemoved: boolean }> {
    await apiFetch('/auth/identities/remove', {
      method: 'POST',
      body: JSON.stringify({ platform_sub: identity.platform_sub }),
    })
    if (identity.is_active) return { activeRemoved: true }
    await load()
    return { activeRemoved: false }
  }

  return { identities, switching, loaded, load, switchTo, addAnother, remove }
}
