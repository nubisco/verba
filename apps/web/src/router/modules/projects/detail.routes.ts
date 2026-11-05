import type { RouteRecordRaw } from 'vue-router'
import ProjectDetailView from '../../../views/ProjectDetailView.vue'
import { route as overviewRoute } from './overview.routes'
import { route as historyRoute } from './history.routes'
import { route as importRoute } from './import.routes'
import { route as exportRoute } from './export.routes'
import { route as importRunRoute } from './import-run.routes'

export const route: RouteRecordRaw = {
  path: 'projects/:id',
  name: 'project',
  component: ProjectDetailView,
  meta: {
    nav: {
      section: 'project',
      icon: 'squares-four',
      label: 'nav.dashboard',
      order: 0,
      routeName: 'project',
      // Active for the project page's own tabs. Settings is a page of its own,
      // the last item of the project's group in the rail.
      activeFor: ['project-overview', 'project-history', 'project-import', 'project-export', 'import-run'],
    },
  },
  children: [overviewRoute, historyRoute, importRoute, exportRoute, importRunRoute],
}
