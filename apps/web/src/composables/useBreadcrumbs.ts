import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { BreadcrumbSegment } from '../router/router.d'
import { useProjectStore } from '../stores/project'
import { useKeyNameStore } from '../stores/keyName'

export interface ResolvedCrumb {
  label: string
  isCode: boolean
}

/**
 * Builds the breadcrumb trail for the current route reactively.
 *
 * Each route declares its full trail via `meta.breadcrumb: BreadcrumbSegment[]`.
 * Vue Router merges meta from matched routes (child wins), so the leaf route's
 * breadcrumb is what `route.meta.breadcrumb` reflects.
 *
 * Dynamic segments:
 *  - `project` → reads project name from useProjectStore (must be loaded by DefaultLayout)
 *  - `key`     → lazily fetched by useKeyNameStore; shows raw keyId until resolved
 */
export function useBreadcrumbs() {
  const route = useRoute()
  const { t } = useI18n()
  const projectStore = useProjectStore()
  const keyNameStore = useKeyNameStore()

  // Trigger key name resolution whenever keyId changes: side effect outside computed
  watchEffect(() => {
    const keyId = route.params.keyId as string | undefined
    const projectId = route.params.id as string | undefined
    if (keyId && projectId) {
      keyNameStore.resolve(projectId, keyId)
    }
  })

  const crumbs = computed<ResolvedCrumb[]>(() => {
    const segments = route.meta.breadcrumb as BreadcrumbSegment[] | undefined
    if (!segments?.length) return []

    return segments.map((seg): ResolvedCrumb => {
      if (seg.type === 'static') {
        return { label: t(seg.label), isCode: false }
      }
      if (seg.type === 'project') {
        return { label: projectStore.project?.name ?? '…', isCode: false }
      }
      // seg.type === 'key'
      const keyId = route.params.keyId as string | undefined
      return {
        label: keyId ? keyNameStore.getName(keyId) : '…',
        isCode: seg.code ?? false,
      }
    })
  })

  return { crumbs }
}
