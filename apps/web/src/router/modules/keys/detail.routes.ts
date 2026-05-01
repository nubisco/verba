import type { RouteRecordRaw } from 'vue-router'
import KeyDetailView from '../../../views/KeyDetailView.vue'

export const route: RouteRecordRaw = {
  path: 'keys/:id/:keyId',
  name: 'key-detail',
  component: KeyDetailView,
  meta: {
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.keys' }, { type: 'key', code: true }],
  },
}
