import type { RouteRecordRaw } from 'vue-router'
import ProjectSettingsView from '../../../views/ProjectSettingsView.vue'

export const route: RouteRecordRaw = {
  path: 'settings',
  name: 'project-settings',
  component: ProjectSettingsView,
  meta: {
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.settings' }],
  },
}
