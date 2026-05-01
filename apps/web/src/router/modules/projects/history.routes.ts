import type { RouteRecordRaw } from 'vue-router'
import ProjectHistoryView from '../../../views/ProjectHistoryView.vue'

export const route: RouteRecordRaw = {
  path: 'history',
  name: 'project-history',
  component: ProjectHistoryView,
  meta: {
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.history' }],
  },
}
