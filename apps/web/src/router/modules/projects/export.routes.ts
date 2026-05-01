import type { RouteRecordRaw } from 'vue-router'
import ExportView from '../../../views/ExportView.vue'

export const route: RouteRecordRaw = {
  path: 'export',
  name: 'project-export',
  component: ExportView,
  meta: {
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.export' }],
  },
}
