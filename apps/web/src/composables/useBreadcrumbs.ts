import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { IBreadcrumbItem } from '@nubisco/ui'
import type { BreadcrumbSegment } from '../router/router.d'
import { useProjectStore } from '../stores/project'
import { useKeyNameStore } from '../stores/keyName'
import { useAccountsStore } from '../stores/accounts'

/**
 * Builds the breadcrumb trail for the current route reactively.
 *
 * Each route declares its full trail via `meta.breadcrumb: BreadcrumbSegment[]`.
 * Vue Router merges meta from matched routes (child wins), so the leaf route's
 * breadcrumb is what `route.meta.breadcrumb` reflects.
 *
 * Dynamic segments:
 *  - `account` → the current account's name from useAccountsStore, which
 *                follows the open project. Shown only to a person with more
 *                than one account: with one, there is nothing to tell apart
 *                and the crumb is noise. Left out until it is known.
 *  - `project` → reads project name from useProjectStore (must be loaded by DefaultLayout)
 *  - `key`     → lazily fetched by useKeyNameStore; shows raw keyId until resolved
 *
 * The result is NbBreadcrumbs `items`: each parent carries a `to`, so it
 * renders as a real link, and the last crumb is the current page, as text.
 */
export function useBreadcrumbs() {
  const route = useRoute()
  const { t } = useI18n()
  const projectStore = useProjectStore()
  const keyNameStore = useKeyNameStore()
  const accountsStore = useAccountsStore()

  // Trigger key name resolution whenever keyId changes: side effect outside computed
  watchEffect(() => {
    const keyId = route.params.keyId as string | undefined
    const projectId = route.params.id as string | undefined
    if (keyId && projectId) {
      keyNameStore.resolve(projectId, keyId)
    }
  })

  const crumbs = computed<IBreadcrumbItem[]>(() => {
    const segments = route.meta.breadcrumb as BreadcrumbSegment[] | undefined
    if (!segments?.length) return []

    // Every crumb of a project trail shares the route's project id.
    const projectId = route.params.id as string | undefined

    return segments.flatMap((seg): IBreadcrumbItem[] => {
      if (seg.type === 'static') {
        const to = seg.to && projectId ? { name: seg.to, params: { id: projectId } } : undefined
        return [{ label: t(seg.label), to }]
      }
      if (seg.type === 'account') {
        if (accountsStore.accounts.length < 2) return []
        const name = accountsStore.current?.name
        return name ? [{ label: name, to: { name: 'dashboard' } }] : []
      }
      if (seg.type === 'project') {
        return [
          {
            label: projectStore.project?.name ?? '…',
            to: projectId ? { name: 'project-overview', params: { id: projectId } } : undefined,
          },
        ]
      }
      // seg.type === 'key'
      const keyId = route.params.keyId as string | undefined
      return [{ label: keyId ? keyNameStore.getName(keyId) : '…' }]
    })
  })

  return { crumbs }
}
