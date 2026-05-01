import type { RouteRecordRaw } from 'vue-router'
import BoardView from '../../views/BoardView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'board/:id',
    name: 'board',
    component: BoardView,
    meta: {
      nav: {
        section: 'project',
        icon: 'kanban',
        label: 'nav.board',
        order: 2,
        routeName: 'board',
        activeFor: ['board-key'],
      },
      breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.board' }],
    },
  },
  {
    // When a key inspector is open on the board, the keyId lives in the URL path.
    // BoardView reads route.params.keyId directly: no component remount occurs
    // because Vue Router reuses the instance when the component class is the same.
    path: 'board/:id/:keyId',
    name: 'board-key',
    component: BoardView,
    meta: {
      breadcrumb: [{ type: 'project' }, { type: 'static', label: 'nav.board' }, { type: 'key', code: true }],
    },
  },
]
