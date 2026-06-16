/// <reference types="vite/client" />
import '../../../ui/src/global'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  // @nubisco/analytics base URL (e.g. https://analytics.nubisco.io).
  // Leave empty to disable; also automatically disabled in dev.
  readonly VITE_ANALYTICS_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
