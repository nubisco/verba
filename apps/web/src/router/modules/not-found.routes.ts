import type { RouteRecordRaw } from 'vue-router'
import NotFoundView from '../../views/404.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: ':pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
  },
]
