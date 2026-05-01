import type { RouteRecordRaw } from 'vue-router'
import { route as entitlementsRoute } from './entitlements.routes'

export const protectedRoutes: RouteRecordRaw[] = [entitlementsRoute]
