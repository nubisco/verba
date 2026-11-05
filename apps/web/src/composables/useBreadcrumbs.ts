import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { IBreadcrumbItem } from '@nubisco/ui'
import type { BreadcrumbSegment } from '../router/router.d'
import { useProjectStore } from '../stores/project'
import { useKeyNameStore } from '../stores/keyName'
import { useAccountsStore } from '../stores/accounts'
import { useProjectListStore } from '../stores/projectList'
import { buildTrail } from '../utils/trail'

/**
 * The breadcrumb trail for the current route, reactively.
 *
 * Each route declares its full trail in `meta.breadcrumb` (Vue Router merges
 * meta, so the leaf route's trail wins), and utils/trail.ts turns it into
 * NbBreadcrumbs `items`: the account for someone with several, the project
 * (a switcher to the same page of another project of its account), the page,
 * and a key, drawn as a key. This composable only feeds it: the project from
 * useProjectStore (loaded by DefaultLayout), its siblings from
 * useProjectListStore, and key names from useKeyNameStore, fetched on demand.
 */
export function useBreadcrumbs() {
  const route = useRoute()
  const { t } = useI18n()
  const projectStore = useProjectStore()
  const keyNameStore = useKeyNameStore()
  const accountsStore = useAccountsStore()
  const projectList = useProjectListStore()

  // Side effects outside the computed: a key's name, and the project's siblings.
  watchEffect(() => {
    const keyId = route.params.keyId as string | undefined
    const projectId = route.params.id as string | undefined
    if (keyId && projectId) void keyNameStore.resolve(projectId, keyId)
  })
  watchEffect(() => {
    if (route.params.id) void projectList.ensure(projectStore.project?.accountId)
  })

  const crumbs = computed<IBreadcrumbItem[]>(() => {
    const segments = route.meta.breadcrumb as BreadcrumbSegment[] | undefined
    if (!segments?.length) return []
    const project = projectStore.project
    return buildTrail({
      segments,
      name: String(route.name ?? ''),
      params: route.params,
      query: route.query ?? {},
      t,
      accounts: accountsStore.accounts,
      account: accountsStore.current,
      project,
      projects: projectList.forAccount(project?.accountId),
      keyName: (keyId) => keyNameStore.getName(keyId),
    })
  })

  return { crumbs }
}
