import type { RouteRecordRaw } from 'vue-router'

// Plan & Entitlements moved under the account's Settings (operators only).
export const route: RouteRecordRaw = {
  path: 'admin/entitlements',
  name: 'admin-entitlements',
  redirect: { name: 'account-settings', query: { section: 'plan' } },
}
