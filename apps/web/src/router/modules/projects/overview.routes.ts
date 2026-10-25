import type { RouteRecordRaw } from 'vue-router'
import ProjectOverviewView from '../../../views/ProjectOverviewView.vue'

export const route: RouteRecordRaw = {
  path: '',
  name: 'project-overview',
  component: ProjectOverviewView,
  meta: {
    breadcrumb: [{ type: 'account' }, { type: 'project' }, { type: 'static', label: 'nav.dashboard' }],
  },
}
