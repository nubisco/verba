import type { RouteRecordRaw } from 'vue-router'
import DashboardView from '../../views/DashboardView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'dashboard',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      nav: {
        section: 'global',
        icon: 'house',
        label: 'nav.home',
        order: 0,
        routeName: 'dashboard',
      },
      breadcrumb: [{ type: 'static', label: 'nav.home' }],
    },
  },
]
