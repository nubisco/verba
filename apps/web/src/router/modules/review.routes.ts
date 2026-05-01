import type { RouteRecordRaw } from 'vue-router'
import ReviewView from '../../views/ReviewView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'review/:id',
    name: 'review',
    component: ReviewView,
    meta: {
      nav: {
        section: 'project',
        icon: 'check-circle',
        label: 'nav.review',
        order: 3,
        routeName: 'review',
      },
      breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.review' }],
    },
  },
]
