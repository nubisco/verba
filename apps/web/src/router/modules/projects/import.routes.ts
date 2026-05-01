import type { RouteRecordRaw } from 'vue-router'
import ImportView from '../../../views/ImportView.vue'

export const route: RouteRecordRaw = {
  path: 'import',
  name: 'project-import',
  component: ImportView,
  meta: {
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.import' }],
  },
}
