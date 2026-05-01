import type { RouteRecordRaw } from 'vue-router'
import AdminEntitlementsView from '../../../views/AdminEntitlementsView.vue'

export const route: RouteRecordRaw = {
  path: 'admin/entitlements',
  name: 'admin-entitlements',
  component: AdminEntitlementsView,
  meta: { requiresAuth: true, requiresAdmin: true },
}
