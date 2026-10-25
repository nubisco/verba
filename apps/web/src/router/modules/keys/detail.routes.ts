import type { RouteRecordRaw } from 'vue-router'
import KeyDetailView from '../../../views/KeyDetailView.vue'

export const route: RouteRecordRaw = {
  path: 'keys/:id/:keyId',
  name: 'key-detail',
  component: KeyDetailView,
  meta: {
    breadcrumb: [
      { type: 'account' },
      { type: 'project' },
      { type: 'static', label: 'nav.keys', to: 'key-list' },
      { type: 'key' },
    ],
  },
}
