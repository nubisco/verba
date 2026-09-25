import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import NubiscoUI, { configureNamedTheme, registerIcons } from '@nubisco/ui'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n/index'
import { useInstanceConfigStore } from './stores/instanceConfig'
import { initAnalytics } from './composables/useAnalytics'
import { consumeSsoTokenFromUrl } from './utils/ssoToken'
import '@/styles/index.scss'
import { version } from '../package.json'
import * as building from '@nubisco/ui/icons/building'
import * as checkCircle from '@nubisco/ui/icons/check-circle'
import * as house from '@nubisco/ui/icons/house'
import * as kanban from '@nubisco/ui/icons/kanban'
import * as key from '@nubisco/ui/icons/key'
import * as squaresFour from '@nubisco/ui/icons/squares-four'
import * as user from '@nubisco/ui/icons/user'

// First statement on purpose. The platform SSO callback carries a live access
// token in the query string, so it has to leave the address bar before Sentry,
// the analytics script or the router ever read location.href.
consumeSsoTokenFromUrl()

const app = createApp(App)
const pinia = createPinia()

Sentry.init({
  app,
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
  release: `verba@${version}`,
  integrations: [
    Sentry.browserTracingIntegration({
      router,
    }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
})

initAnalytics()

app.use(pinia)
app.use(router)
app.use(i18n)
app.use(NubiscoUI)

// Verba ships one named theme, its own. This selects it. The accent behind it
// comes from the engineers category in @nubisco/ui, not from anything here.
configureNamedTheme({ themes: ['verba'], defaultTheme: 'verba' })

// Sidebar glyphs are named in route meta and reach NbIcon as `:name="item.icon"`,
// so the @nubisco/ui 4.0.0 compile-time resolver cannot see them. The set is
// closed (every `nav.icon` in src/router/modules), so register it rather than
// pulling in the ~1,500-icon catalogue. Add a route icon here or NbIcon throws.
registerIcons({
  building,
  'check-circle': checkCircle,
  house,
  kanban,
  key,
  'squares-four': squaresFour,
  user,
})

// Fetch instance config before first render so feature-flagged nav items
// are already resolved by the time DefaultLayout mounts. Fails silently.
useInstanceConfigStore(pinia).fetch()
app.mount('#app')
