/// <reference types="vite/client" />

// The `Nb*` tags are resolved at compile time by `nubiscoUI()` in vite.config.ts
// and declared globally by this subpath, which @nubisco/ui ships as of 5.0.0.
// This replaces the mapping we used to derive from the package's value exports
// while dist/global.d.ts was missing.
import '@nubisco/ui/global'

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_URL: string
    // @nubisco/analytics base URL (e.g. https://analytics.nubisco.io).
    // Leave empty to disable; also automatically disabled in dev.
    readonly VITE_ANALYTICS_URL: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
