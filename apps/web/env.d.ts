/// <reference types="vite/client" />
import type * as NubiscoUI from '@nubisco/ui'

// @nubisco/ui is installed as a plugin in main.ts, which registers every
// component globally. The package advertises a `@nubisco/ui/global` subpath
// for the matching GlobalComponents declaration, but 1.48.0 does not actually
// ship dist/global.d.ts, so we derive the same mapping from the `Nb*` value
// exports instead. Drop this in favour of `import '@nubisco/ui/global'` once
// the package ships that file.
type NbComponents = Pick<typeof NubiscoUI, Extract<keyof typeof NubiscoUI, `Nb${string}`>>

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

declare module 'vue' {
  // Augmenting GlobalComponents requires an interface, so the empty body is
  // structural, not an oversight.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GlobalComponents extends NbComponents {}
}

export {}
