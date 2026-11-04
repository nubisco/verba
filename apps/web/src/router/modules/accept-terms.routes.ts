import type { RouteRecordRaw } from 'vue-router'
import AcceptTermsView from '../../views/AcceptTermsView.vue'

// Outside the app shell: someone who has not accepted the current terms can
// reach nothing else (session.ts in the API), so the rail has nothing to show.
export const publicRoutes: RouteRecordRaw[] = [
  {
    path: '/accept-terms',
    name: 'accept-terms',
    component: AcceptTermsView,
  },
]
