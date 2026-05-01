import { type RouteRecordRaw } from 'vue-router'

/**
 * One segment in a breadcrumb trail.
 *
 * - `static` : translated string, e.g. "History"
 * - `project`: current project's display name, resolved from useProjectStore
 * - `key`    : key name, resolved lazily from useKeyNameStore; set code:true for <code> styling
 */
export type BreadcrumbSegment =
  | { type: 'static'; label: string }
  | { type: 'project' }
  | { type: 'key'; code?: boolean }

export type NavSection = 'global' | 'project' | 'bottom'

export interface NavMeta {
  /** Section of the sidebar this item belongs to */
  section: NavSection
  /** NbIcon name */
  icon: string
  /** i18n key for tooltip / label */
  label: string
  /** Sort order within the section */
  order?: number
  /**
   * Route name used to resolve the navigation link.
   * For project-scoped routes (section: 'project'), the store automatically
   * injects the current project id param.
   */
  routeName: string
  /**
   * Additional route names that should also mark this nav item as active.
   * Useful for parent/child relationships (e.g. key-detail activates the key-list item).
   */
  activeFor?: string[]
  /**
   * EE entitlement key. When set, the item is only shown if the user's current
   * plan includes this feature. Checked against /admin/entitlements.
   */
  entitlement?: string
  /**
   * Instance feature flag key. When set, the item is only shown if this flag
   * is enabled on the deployment. Checked against /config (public endpoint).
   * Example: 'organizations' is toggled via ENABLE_ORGANIZATIONS env var.
   */
  featureFlag?: string
}

// Augment Vue Router's RouteMeta so meta.nav is fully typed everywhere
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    nav?: NavMeta
    /**
     * Full breadcrumb trail for this route. The last matched route that
     * declares breadcrumb wins (Vue Router merges meta, child overrides parent).
     *
     * Each segment is resolved reactively: project name from useProjectStore,
     * key name from useKeyNameStore (lazy-fetched on demand).
     */
    breadcrumb?: BreadcrumbSegment[]
  }
}

type RouteModule = {
  publicRoutes?: RouteRecordRaw[]
  protectedRoutes?: RouteRecordRaw[]
}

export { RouteModule }
