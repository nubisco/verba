import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { NavMeta, NavSection } from '../router/router.d'
import { useEntitlementsStore } from './entitlements'
import { useInstanceConfigStore } from './instanceConfig'
import router from '../router'

export interface NavItem {
  icon: string
  label: string
  order: number
  routeName: string
  href: string
  isActive: boolean
  entitlement?: string
  featureFlag?: string
}

function resolveHref(routeName: string, params?: Record<string, string>): string {
  try {
    return router.resolve({ name: routeName, params }).href
  } catch {
    return '#'
  }
}

function checkActive(routeName: string, activeFor?: string[]): boolean {
  const current = router.currentRoute.value
  const currentName = current.name as string | undefined
  if (currentName === routeName) return true
  if (activeFor?.includes(currentName ?? '')) return true
  // Check if routeName matches any ancestor in the matched chain (nested routes)
  if (current.matched.some((r) => r.name === routeName)) return true
  return false
}

function buildItem(nav: NavMeta, params?: Record<string, string>): NavItem {
  return {
    icon: nav.icon,
    label: nav.label,
    order: nav.order ?? 99,
    routeName: nav.routeName,
    href: resolveHref(nav.routeName, params),
    isActive: checkActive(nav.routeName, nav.activeFor),
    entitlement: nav.entitlement,
    featureFlag: nav.featureFlag,
  }
}

function itemsForSection(section: NavSection, params?: Record<string, string>): NavItem[] {
  return router
    .getRoutes()
    .filter((r) => r.meta?.nav?.section === section)
    .sort((a, b) => (a.meta.nav!.order ?? 99) - (b.meta.nav!.order ?? 99))
    .map((r) => buildItem(r.meta.nav!, params))
}

export const useNavigationStore = defineStore('navigation', () => {
  const entitlements = useEntitlementsStore()
  const instanceConfig = useInstanceConfigStore()

  // Reactive reference to the current route (no useRoute() needed in the store)
  const currentRoute = router.currentRoute

  const projectId = computed(() => currentRoute.value.params.id as string | undefined)

  function withVisibilityFilter(items: NavItem[]): NavItem[] {
    return items.filter((item) => {
      if (item.entitlement && !entitlements.hasFeature(item.entitlement)) return false
      if (item.featureFlag && !instanceConfig.hasFeature(item.featureFlag)) return false
      return true
    })
  }

  const globalItems = computed(() => withVisibilityFilter(itemsForSection('global')))

  const projectItems = computed(() => {
    if (!projectId.value) return []
    return withVisibilityFilter(itemsForSection('project', { id: projectId.value }))
  })

  const bottomItems = computed(() => withVisibilityFilter(itemsForSection('bottom')))

  return { globalItems, projectItems, bottomItems, projectId }
})
