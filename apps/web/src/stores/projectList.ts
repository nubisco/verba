import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../api'

export interface ProjectSummary {
  id: string
  name: string
  slug: string
  avatar?: string | null
  accountId?: string
}

/**
 * The projects of each account the person has opened, for the trail's project
 * switcher: the project crumb lists the other projects of the same account.
 * Fetched once per account, and fetched again after this tab creates, renames
 * or deletes a project (`invalidate`). A change made in another tab shows on
 * the next load, which is all a list of names to jump between needs.
 */
export const useProjectListStore = defineStore('projectList', () => {
  const byAccount = ref<Record<string, ProjectSummary[]>>({})
  const pending = new Set<string>()

  async function ensure(accountId: string | null | undefined): Promise<void> {
    if (!accountId || byAccount.value[accountId] || pending.has(accountId)) return
    pending.add(accountId)
    try {
      const list = await apiFetch<ProjectSummary[]>(`/projects?account=${encodeURIComponent(accountId)}`)
      byAccount.value = { ...byAccount.value, [accountId]: list }
    } catch {
      // No switcher, the crumb still names and links the project.
    } finally {
      pending.delete(accountId)
    }
  }

  /** Forget an account's list, and fetch it again if the trail is showing it. */
  function invalidate(accountId: string | null | undefined): void {
    if (!accountId || !byAccount.value[accountId]) return
    const next = { ...byAccount.value }
    delete next[accountId]
    byAccount.value = next
  }

  function forAccount(accountId: string | null | undefined): ProjectSummary[] {
    return accountId ? (byAccount.value[accountId] ?? []) : []
  }

  return { byAccount, ensure, invalidate, forAccount }
})
