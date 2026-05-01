import type { RouteRecordRaw } from 'vue-router'
import SetupView from '../../views/SetupView.vue'

export const publicRoutes: RouteRecordRaw[] = [
  {
    path: '/setup',
    name: 'setup',
    component: SetupView,
  },
]
