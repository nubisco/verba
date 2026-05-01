import type { RouteRecordRaw } from 'vue-router'
import ProfileView from '../../views/ProfileView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'profile',
    name: 'profile',
    component: ProfileView,
    meta: {
      nav: {
        section: 'bottom',
        icon: 'user',
        label: 'nav.profile',
        order: 0,
        routeName: 'profile',
      },
      breadcrumb: [{ type: 'static', label: 'nav.profile' }],
    },
  },
]
