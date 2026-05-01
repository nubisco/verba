import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import DefaultLayout from '../layouts/DefaultLayout.vue'
import { type RouteModule } from './router.d'

// Auto-discover all route modules: flat *.routes.ts files and folder index.ts aggregators
const modules = import.meta.glob<RouteModule>(['./modules/*.routes.ts', './modules/**/index.ts'], { eager: true })

const publicRoutes: RouteRecordRaw[] = []
const regularProtected: RouteRecordRaw[] = []
const catchAllRoutes: RouteRecordRaw[] = []

for (const mod of Object.values(modules)) {
  for (const route of mod.publicRoutes ?? []) {
    publicRoutes.push(route)
  }
  for (const route of mod.protectedRoutes ?? []) {
    // Keep catch-all routes last
    if (String(route.path).includes('*')) {
      catchAllRoutes.push(route)
    } else {
      regularProtected.push(route)
    }
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    ...publicRoutes,
    {
      path: '/',
      component: DefaultLayout,
      meta: { requiresAuth: true },
      children: [...regularProtected, ...catchAllRoutes],
    },
  ],
})

router.beforeEach(async (to) => {
  // Always allow the setup wizard and login pages
  if (to.name === 'setup' || to.name === 'login') return true

  // Check if first-run setup is needed
  try {
    const status = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/setup/status`).then(
      (r) => r.json() as Promise<{ needsSetup: boolean }>,
    )
    if (status.needsSetup) return { path: '/setup' }
  } catch {
    // If the API is unreachable, proceed normally (avoids redirect loop in dev)
  }

  if (!to.meta.requiresAuth) return true

  const auth = useAuthStore()
  if (!auth.user) {
    await auth.fetchMe()
  }
  if (!auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
