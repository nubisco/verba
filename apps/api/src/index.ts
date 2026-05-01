import { buildApp } from './app.js'
import { loadPlugins } from './plugin-loader.js'

const app = buildApp()
const port = Number(process.env.PORT) || 4000

// ─── Boot mode ───────────────────────────────────────────────────────────────
// OSS_ONLY=true : explicit Community Edition mode; EE never loads.
// ENABLE_EE=true: Enterprise Edition modules are dynamically loaded at startup.
// Default (neither set) behaves as OSS_ONLY.

const ossOnly = process.env.OSS_ONLY === 'true'
const enableEE = !ossOnly && process.env.ENABLE_EE === 'true'

async function loadEE() {
  try {
    const ee = await import('@nubisco/verba-ee')
    const licenseValid = ee.isLicenseValid()
    app.log.info(`[boot] Enterprise Edition loaded: license ${licenseValid ? 'valid' : 'inactive (no LICENSE_KEY)'}`)
  } catch {
    // EE package not installed: safe to ignore in OSS deployments.
    app.log.warn('[boot] ENABLE_EE=true but @nubisco/verba-ee is not available; starting in OSS mode')
  }
}

app
  .listen({ port, host: '0.0.0.0' })
  .then(async () => {
    app.log.info(`[boot] API listening on port ${port}`)

    if (enableEE) {
      await loadEE()
    } else {
      app.log.info('[boot] Community Edition: open-source mode')
    }

    await loadPlugins(process.env.PLUGINS_DIR)
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
