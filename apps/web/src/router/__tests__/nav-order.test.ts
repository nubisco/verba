import { describe, it, expect } from 'vitest'
import type { RouteRecordRaw } from 'vue-router'
import type { NavMeta, NavSection } from '../router.d'

/**
 * Route modules can export routes in several shapes:
 *  - protectedRoutes / publicRoutes  (arrays, used by flat modules and index aggregators)
 *  - route                           (single record, used by detail/list modules)
 */
interface RouteModule {
  publicRoutes?: RouteRecordRaw[]
  protectedRoutes?: RouteRecordRaw[]
  route?: RouteRecordRaw
}

interface NavEntry {
  nav: NavMeta
  /** human-readable source for error messages */
  routeId: string
}

function collectNavEntries(routes: RouteRecordRaw[]): NavEntry[] {
  const entries: NavEntry[] = []
  for (const route of routes) {
    if (route.meta?.nav) {
      entries.push({
        nav: route.meta.nav as NavMeta,
        routeId: (route.name as string | undefined) ?? route.path,
      })
    }
    if (route.children?.length) {
      entries.push(...collectNavEntries(route.children))
    }
  }
  return entries
}

const modules = import.meta.glob<RouteModule>(['../modules/*.routes.ts', '../modules/**/index.ts'], { eager: true })

describe('sidebar nav metadata', () => {
  const allEntries: NavEntry[] = []

  for (const [, mod] of Object.entries(modules)) {
    const routes: RouteRecordRaw[] = [
      ...(mod.publicRoutes ?? []),
      ...(mod.protectedRoutes ?? []),
      ...(mod.route ? [mod.route] : []),
    ]
    allEntries.push(...collectNavEntries(routes))
  }

  it('has no duplicate order values within the same section', () => {
    const bySection = new Map<NavSection, NavEntry[]>()

    for (const entry of allEntries) {
      const { section } = entry.nav
      if (!bySection.has(section)) bySection.set(section, [])
      bySection.get(section)!.push(entry)
    }

    const conflicts: string[] = []

    for (const [section, entries] of bySection) {
      const orderMap = new Map<number, string[]>()
      for (const entry of entries) {
        const order = entry.nav.order ?? 99
        if (!orderMap.has(order)) orderMap.set(order, [])
        orderMap.get(order)!.push(entry.routeId)
      }
      for (const [order, names] of orderMap) {
        if (names.length > 1) {
          conflicts.push(`  section "${section}", order ${order}: ${names.join(', ')}`)
        }
      }
    }

    expect(
      conflicts,
      [
        'Duplicate nav order values detected.',
        'Each route in the same section must have a unique order.',
        "If a CE route and an EE route clash, adjust the EE route's order",
        "or remove the CE route's nav metadata for that slot.",
        '',
        conflicts.join('\n'),
      ].join('\n'),
    ).toHaveLength(0)
  })

  it('every nav entry has a routeName that matches its own route name', () => {
    const mismatches: string[] = []

    for (const entry of allEntries) {
      if (entry.nav.routeName !== entry.routeId) {
        mismatches.push(`  route "${entry.routeId}" declares routeName "${entry.nav.routeName}"`)
      }
    }

    expect(
      mismatches,
      [
        "nav.routeName must match the route's own name.",
        'A mismatch means the sidebar link will resolve to the wrong URL.',
        '',
        mismatches.join('\n'),
      ].join('\n'),
    ).toHaveLength(0)
  })
})
