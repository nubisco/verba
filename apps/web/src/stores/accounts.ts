import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '../api'
import { useAuthStore } from './auth'

// The accounts (tenants) this person belongs to, and the one they are working
// in. Not to be confused with usePlatformAccounts, which is the Platform
// sign-in identities in this browser.
//
// The account being worked in follows the project: opening a project makes
// its account current. Otherwise it is the last one chosen, remembered per
// browser, or the person's first account.

export type AccountRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface AccountSummary {
  id: string
  name: string
  slug: string
  role: AccountRole
  projectCount: number
}

const STORAGE_KEY = 'verba.account'

function readRemembered(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function remember(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* private window or blocked storage: the choice lasts this visit only */
  }
}

export const useAccountsStore = defineStore('accounts', () => {
  const auth = useAuthStore()

  const accounts = ref<AccountSummary[]>([])
  const loaded = ref(false)
  const chosenId = ref<string | null>(readRemembered())

  const current = computed<AccountSummary | null>(
    () => accounts.value.find((a) => a.id === chosenId.value) ?? accounts.value[0] ?? null,
  )
  /** Owners and admins manage the account's people. */
  const canManage = computed(() => current.value?.role === 'OWNER' || current.value?.role === 'ADMIN')
  /** Platform admins of this app and instance operators create accounts. */
  const canCreate = computed(() => Boolean(auth.user?.canCreateAccounts))

  async function load(): Promise<void> {
    try {
      accounts.value = await apiFetch<AccountSummary[]>('/accounts')
    } catch {
      accounts.value = []
    } finally {
      loaded.value = true
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded.value) await load()
  }

  function select(id: string | null | undefined): void {
    if (!id || id === chosenId.value) return
    chosenId.value = id
    remember(id)
  }

  async function create(name: string): Promise<AccountSummary> {
    const account = await apiFetch<AccountSummary>('/accounts', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
    await load()
    select(account.id)
    return account
  }

  return { accounts, loaded, current, canManage, canCreate, load, ensureLoaded, select, create }
})
