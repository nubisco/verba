import type { RouteRecordRaw } from 'vue-router'
import OrganizationsView from '../../views/OrganizationsView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'organizations',
    name: 'organizations',
    component: OrganizationsView,
    meta: {
      nav: {
        section: 'global',
        icon: 'building',
        label: 'nav.organizations',
        order: 1,
        routeName: 'organizations',
        featureFlag: 'organizations',
      },
      breadcrumb: [{ type: 'static', label: 'nav.organizations' }],
    },
  },
]
