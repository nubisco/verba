import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { bus } from './events.js'
import type { VerbaEvent } from './events.js'
import type { PluginContext, VerbaPlugin } from './plugin-types.js'

function makeContext(name: string): PluginContext {
  return {
    onEvent(listener: (event: VerbaEvent) => void) {
      bus.on(listener)
    },
    log: {
      info: (msg) => console.log(`[plugin:${name}] ${msg}`),
      warn: (msg) => console.warn(`[plugin:${name}] ${msg}`),
      error: (msg) => console.error(`[plugin:${name}] ${msg}`),
    },
  }
}

export async function loadPlugins(pluginsDir?: string): Promise<void> {
  if (!pluginsDir) return

  let entries: string[]
  try {
    entries = await readdir(pluginsDir)
  } catch {
    console.warn(`[plugins] Directory "${pluginsDir}" not found: skipping plugin load`)
    return
  }

  const files = entries.filter((f) => /\.(js|mjs|cjs)$/.test(f)).sort()

  for (const file of files) {
    const fullPath = path.resolve(pluginsDir, file)
    const name = path.basename(file, path.extname(file))
    try {
      const mod = (await import(pathToFileURL(fullPath).href)) as {
        default?: VerbaPlugin
      } & VerbaPlugin
      const plugin: VerbaPlugin = mod.default ?? mod
      if (typeof plugin.register !== 'function') {
        console.warn(`[plugin:${name}] No register() export: skipping`)
        continue
      }
      await plugin.register(makeContext(name))
      console.log(`[plugin:${name}] Loaded`)
    } catch (err) {
      // Fail-safe: plugin errors must never crash the app
      console.error(`[plugin:${name}] Failed to load: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
