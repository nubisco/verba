import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { buildApp } from './app.js'
import { loadPlugins } from './plugin-loader.js'
import { migrateStoredAiKeys } from './services/ai-settings.service.js'
import { aiEncryptionConfigured } from './services/encryption.service.js'

// The Node server: what the Docker image runs. The app itself (app.ts) knows
// nothing of Node's HTTP server. Node's WebSockets are added here.
let injectWebSocket: ReturnType<typeof createNodeWebSocket>['injectWebSocket'] | undefined
const app = await buildApp({
  websocket: (api) => {
    const nodeWs = createNodeWebSocket({ app: api })
    injectWebSocket = nodeWs.injectWebSocket
    return nodeWs.upgradeWebSocket
  },
})
const port = Number(process.env.PORT) || 4000

const log = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (detail: unknown, msg?: string) => console.error(msg ?? '', detail),
}

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
    log.info(`[boot] Enterprise Edition loaded: license ${licenseValid ? 'valid' : 'inactive (no LICENSE_KEY)'}`)
  } catch {
    // EE package not installed: safe to ignore in OSS deployments.
    log.warn('[boot] ENABLE_EE=true but @nubisco/verba-ee is not available, so it starts in OSS mode')
  }
}

// Projects' AI keys stored before the current format are sealed again under
// AI_ENCRYPTION_KEY. Without one they keep working as they are, read-only, and
// no new key can be saved until it is set. Nothing is ever dropped.
async function sealLegacyAiKeys() {
  if (!aiEncryptionConfigured()) {
    log.warn('[boot] AI_ENCRYPTION_KEY is not set: projects cannot save AI provider keys until it is')
  }
  try {
    const { resealed, unreadable, waiting } = await migrateStoredAiKeys()
    if (resealed) log.info(`[boot] ${resealed} AI key(s) sealed in the current format`)
    if (waiting) log.warn(`[boot] ${waiting} AI key(s) in an earlier format wait for AI_ENCRYPTION_KEY`)
    if (unreadable) log.warn(`[boot] ${unreadable} AI key(s) cannot be read and must be entered again`)
  } catch (err) {
    log.error(err, '[boot] AI key migration failed')
  }
}

async function afterListening() {
  log.info(`[boot] API listening on port ${port}`)

  if (enableEE) {
    await loadEE()
  } else {
    log.info('[boot] Community Edition: open-source mode')
  }

  await loadPlugins(process.env.PLUGINS_DIR)

  await sealLegacyAiKeys()
}

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  afterListening().catch((err) => {
    log.error(err)
    process.exit(1)
  })
})
injectWebSocket?.(server)
server.on('error', (err) => {
  log.error(err)
  process.exit(1)
})
