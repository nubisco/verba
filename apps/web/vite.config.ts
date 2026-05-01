import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { fonts } from '@nubisco/ui/plugins/fonts'

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
  plugins: [vue(), vueDevTools(), fonts()],
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
