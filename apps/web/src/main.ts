import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import NubiscoUI from '@nubisco/ui'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n/index'
import { useInstanceConfigStore } from './stores/instanceConfig'
import { initAnalytics } from './composables/useAnalytics'
import { consumeSsoTokenFromUrl } from './utils/ssoToken'
import '@nubisco/ui/dist/ui.css'
import '@/styles/index.scss'
import { version } from '../package.json'

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

// Fetch instance config before first render so feature-flagged nav items
// are already resolved by the time DefaultLayout mounts. Fails silently.
useInstanceConfigStore(pinia).fetch()
app.mount('#app')
