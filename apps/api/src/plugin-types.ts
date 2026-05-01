import type { VerbaEvent } from './events.js'

export interface PluginContext {
  /** Subscribe to all Verba events */
  onEvent(listener: (event: VerbaEvent) => void): void
  /** Logger scoped to plugin name */
  log: {
    info(msg: string): void
    warn(msg: string): void
    error(msg: string): void
  }
}

export interface VerbaPlugin {
  register(ctx: PluginContext): void | Promise<void>
}
