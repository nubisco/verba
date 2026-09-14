import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fonts } from '@nubisco/ui/plugins/fonts'
import { nubiscoUI } from '@nubisco/ui/vite'

/**
 * Vite configuration for the Verba web application.
 *
 * @remarks
 * Configures Vue plugin, SCSS preprocessing with modern compiler API,
 * and path aliases for module resolution.
 *
 * @property {object} plugins - Vue framework plugin
 * @property {object} css.preprocessorOptions.scss - SCSS configuration with modern compiler API,
 * charset disabled, and automatic import of Nubisco UI variables
 * @property {object} resolve.alias - Module path aliases:
 *   - `@/` resolves to `/apps/web/src/` (relative to vite.config.ts location)
 *   - `@nubisco/verba-shared` resolves to `../../packages/shared/src/index.ts`
 * @property {number} server.port - Development server port (5173)
 */
export default defineConfig({
  // @nubisco/ui 4.0.0 stopped registering components from `app.use(NubiscoUI)`.
  // This plugin resolves `<NbButton>` and literal icon/flag names to
  // per-component imports at compile time, and pulls in each component's
  // stylesheet, which is why main.ts no longer imports the full sheet.
  // `dts: false` because the Nb* tags are declared by `@nubisco/ui/global`,
  // imported from env.d.ts; a generated components.d.ts would sit outside this
  // package's tsconfig `include` and be dead weight.
  // `catalog: 'off'` stops the glyph resolver auto-injecting the ~1,500-icon
  // catalogue into the two files that bind a glyph to a runtime value. Both
  // supply their own artwork instead: DefaultLayout's sidebar names are
  // registered in main.ts, and LocaleBadge imports the flag catalogue itself.
  // Adding a third such binding without doing one of those throws on render.
  plugins: [vue(), vueDevTools(), fonts(), ...nubiscoUI({ components: { dts: false }, glyphs: { catalog: 'off' } })],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        charset: false,
        additionalData: `@use '@nubisco/ui/variables';`,
      },
    },
  },
  resolve: {
    alias: {
      '@/': new URL('./src/', import.meta.url).pathname,
      '@nubisco/verba-shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
