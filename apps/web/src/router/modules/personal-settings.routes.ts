import type { RouteRecordRaw } from 'vue-router'
import PersonalSettingsView from '../../views/PersonalSettingsView.vue'

export const protectedRoutes: RouteRecordRaw[] = [
  {
    // The person's own settings, opened from the user menu's "Your settings".
    // Profile itself (name, picture, passkeys) is Nubisco Platform's.
    path: 'me',
    name: 'personal-settings',
    component: PersonalSettingsView,
    meta: {
      breadcrumb: [{ type: 'static', label: 'nav.yourSettings' }],
    },
  },
  {
    // The old profile page. Bookmarks and links to it still land.
    path: 'profile',
    redirect: '/me',
  },
]
