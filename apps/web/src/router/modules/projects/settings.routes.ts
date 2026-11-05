import type { RouteRecordRaw } from 'vue-router'
import ProjectSettingsView from '../../../views/ProjectSettingsView.vue'

export const route: RouteRecordRaw = {
  path: 'projects/:id/settings',
  name: 'project-settings',
  component: ProjectSettingsView,
  meta: {
    // The project's own configuration, the last item of the project's group in
    // the rail (fleet standard, "Every rail has the same anatomy"). A page of
    // its own rather than a tab of the project page, so its sections are the
    // one tab strip on screen (?tab=, useSettingsTab).
    nav: {
      section: 'project',
      icon: 'sliders-horizontal',
      label: 'nav.settings',
      order: 99,
      routeName: 'project-settings',
    },
    breadcrumb: [{ type: 'account' }, { type: 'project' }, { type: 'static', label: 'nav.settings' }],
  },
}
