import type { RouteRecordRaw } from 'vue-router'
import { route as listRoute } from './list.routes'
import { route as detailRoute } from './detail.routes'

export const protectedRoutes: RouteRecordRaw[] = [listRoute, detailRoute]
