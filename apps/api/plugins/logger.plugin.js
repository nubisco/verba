/**
 * Example logger plugin. Logs every Verba event to stdout.
 *
 * To enable, set PLUGINS_DIR=./plugins in your .env (or environment).
 * This file must be compiled/copied as .js before it can be loaded at runtime.
 */

/** @type {import('../src/plugin-types.js').VerbaPlugin} */
const plugin = {
  register(ctx) {
    ctx.log.info('Logger plugin active, listening for all events')
    ctx.onEvent((event) => {
      ctx.log.info(JSON.stringify(event))
    })
  },
}

export default plugin
