/// <reference types="vite/client" />
import '../../../ui/src/global'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // PostHog product analytics: leave empty to disable (automatically disabled in dev)
  readonly VITE_POSTHOG_KEY: string
  readonly VITE_POSTHOG_HOST: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
