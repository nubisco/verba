import type { RouteRecordRaw } from 'vue-router'
import AccountSettingsView from '../../views/AccountSettingsView.vue'

// The account's Settings, reached from the gear at the foot of the rail
// (DefaultLayout). ?section= picks members or plan.
export const protectedRoutes: RouteRecordRaw[] = [
  {
    path: 'settings',
    name: 'account-settings',
    component: AccountSettingsView,
    meta: {
      breadcrumb: [{ type: 'static', label: 'nav.accountSettings' }],
    },
  },
  // Old addresses keep working. The Organizations page sat behind
  // ENABLE_ORGANIZATIONS, and Plan & Entitlements was /admin/entitlements.
  { path: 'organizations', redirect: { name: 'account-settings' } },
]
