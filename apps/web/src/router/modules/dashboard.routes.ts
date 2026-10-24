import type { RouteRecordRaw } from 'vue-router'
import DashboardView from '../../views/DashboardView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'dashboard',
    name: 'dashboard',
    component: DashboardView,
    meta: {
      // The first entry of every Nubisco rail, with the icon `buildings`
      // (fleet standard, "Every rail has the same anatomy"). It is "Home"
      // because this page is also where the person chooses the project, and
      // with it the account, to work in.
      nav: {
        section: 'global',
        icon: 'buildings',
        label: 'nav.home',
        order: 0,
        routeName: 'dashboard',
      },
      breadcrumb: [{ type: 'static', label: 'nav.home' }],
    },
  },
]
