import type { RouteRecordRaw } from 'vue-router'
import ProjectsView from '../../../views/ProjectsView.vue'

export const route: RouteRecordRaw = {
  path: 'projects',
  name: 'projects',
  component: ProjectsView,
}
