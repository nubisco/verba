import type { RouteRecordRaw } from 'vue-router'
import ProjectSettingsView from '../../../views/ProjectSettingsView.vue'

export const route: RouteRecordRaw = {
  path: 'settings',
  name: 'project-settings',
  component: ProjectSettingsView,
  meta: {
    // The project's own configuration, the last item of the project's group in
    // the rail (fleet standard, "Every rail has the same anatomy"). It is also
    // a tab on the project page, which reaches the same route.
    nav: {
      section: 'project',
      icon: 'sliders-horizontal',
      label: 'nav.settings',
      order: 99,
      routeName: 'project-settings',
    },
    breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.settings' }],
  },
}
