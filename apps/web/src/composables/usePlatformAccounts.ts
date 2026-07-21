import { ref } from 'vue'
import type { IUserMenuAccount } from '@nubisco/ui'
import { useAuthStore } from '../stores/auth'
import { useInstanceConfigStore } from '../stores/instanceConfig'
import { startPlatformSso } from './usePlatformIdentities'

// Feeds NbUserMenu with the browser's signed-in platform identities, straight
// from the platform's own session (multi-account guide). Cross-origin with
// credentials: when the call fails (e.g. CORS not allowed for this origin),
// `accountsUnknown` flips on and the menu falls back to a generic
// "Switch account" action instead of an inline list.

interface PlatformSessionIdentity {
  sub: string
  email: string
  name?: string | null
  auth_time: number
  platform_active?: boolean
}

const accounts = ref<IUserMenuAccount[]>([])
const accountsUnknown = ref(false)

export function usePlatformAccounts() {
  const auth = useAuthStore()
  const instanceConfig = useInstanceConfigStore()

  // Current = the identity THIS app's session was issued for, matched by the
  // session's own subject (email fallback for pre-platformSub sessions).
  // Never platform_active: that refers to the platform admin console.
  function isCurrent(identity: PlatformSessionIdentity): boolean {
    if (auth.user?.platformSub) return identity.sub === auth.user.platformSub
    return identity.email.toLowerCase() === auth.user?.email?.toLowerCase()
  }

  async function load(): Promise<void> {
    const issuer = instanceConfig.auth.platformIssuer
    if (!instanceConfig.auth.platformEnabled || !issuer) {
      accounts.value = []
      accountsUnknown.value = true
      return
    }
    try {
      const res = await fetch(new URL('/api/auth/identities', issuer), { credentials: 'include' })
      if (!res.ok) throw new Error(`identities request failed: ${res.status}`)
      const data = (await res.json()) as { identities?: PlatformSessionIdentity[] }
      accounts.value = (data.identities ?? []).map((i) => ({
        id: i.sub,
        email: i.email,
        name: i.name ?? undefined,
        current: isCurrent(i),
        removable: !isCurrent(i),
      }))
      accountsUnknown.value = false
    } catch {
      accounts.value = []
      accountsUnknown.value = true
    }
  }

  function switchTo(account: IUserMenuAccount): void {
    startPlatformSso({ loginHint: account.email })
  }

  function selectAccount(): void {
    startPlatformSso({ prompt: 'select_account' })
  }

  function addAccount(): void {
    startPlatformSso({ prompt: 'login' })
  }

  async function remove(account: IUserMenuAccount): Promise<void> {
    const issuer = instanceConfig.auth.platformIssuer
    if (!issuer) return
    await fetch(new URL('/api/auth/identities/remove', issuer), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: account.id }),
    }).catch(() => {})
    await load()
  }

  return { accounts, accountsUnknown, load, switchTo, selectAccount, addAccount, remove }
}
