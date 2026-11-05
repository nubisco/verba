import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import type { RouteModule } from '../router.d'

// The same discovery as router/index.ts, under one parent, without the guards.
const modules = import.meta.glob<RouteModule>(['../modules/*.routes.ts', '../modules/**/index.ts'], { eager: true })
const children: RouteRecordRaw[] = Object.values(modules).flatMap((m) => m.protectedRoutes ?? [])
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { template: '<RouterView />' }, children }],
})

describe('settings routes', () => {
  // A project's Settings has its own tab strip, so it is a page of its own
  // rather than a tab of the project page (which would put two strips on
  // screen). The address is the one it always had.
  it('opens project settings as its own page, outside the project page', () => {
    const to = router.resolve('/projects/p1/settings')
    expect(to.name).toBe('project-settings')
    expect(to.params.id).toBe('p1')
    expect(to.matched.map((r) => r.name)).not.toContain('project')
  })

  it('keeps the project page tabs under the project page', () => {
    for (const path of ['/projects/p1', '/projects/p1/import', '/projects/p1/export', '/projects/p1/history']) {
      expect(router.resolve(path).matched.map((r) => r.name)).toContain('project')
    }
  })

  it('sends the old Plan and Entitlements address to its tab of the account settings', async () => {
    await router.push('/admin/entitlements')
    expect(router.currentRoute.value.name).toBe('account-settings')
    expect(router.currentRoute.value.query).toEqual({ tab: 'plan' })
  })

  it('keeps the old Organizations address landing on the account settings', async () => {
    await router.push('/organizations')
    expect(router.currentRoute.value.name).toBe('account-settings')
  })
})
