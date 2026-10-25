import type { RouteRecordRaw } from 'vue-router'
import ImportRunView from '../../../views/ImportRunView.vue'

export const route: RouteRecordRaw = {
  path: 'import-runs/:runId',
  name: 'import-run',
  component: ImportRunView,
  meta: {
    breadcrumb: [
      { type: 'account' },
      { type: 'project' },
      { type: 'static', label: 'nav.import', to: 'project-import' },
      { type: 'static', label: 'nav.importRun' },
    ],
  },
}
