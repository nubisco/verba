import type { RouteRecordRaw } from 'vue-router'
import KeyListView from '../../../views/KeyListView.vue'

export const route: RouteRecordRaw = {
  path: 'keys/:id',
  name: 'key-list',
  component: KeyListView,
  meta: {
    nav: {
      section: 'project',
      icon: 'key',
      label: 'nav.keys',
      order: 1,
      routeName: 'key-list',
      activeFor: ['key-detail'],
    },
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.keys' }],
  },
}
