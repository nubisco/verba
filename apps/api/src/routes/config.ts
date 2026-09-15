import type { FastifyInstance } from 'fastify'
import { getPublicInstanceConfig } from '../services/instance-config.service.js'
import { getSsoPublicConfig } from '../services/sso.service.js'

/**
 * Public instance configuration endpoint.
 * No authentication required: the frontend fetches this before login
 * to know which features are enabled on this deployment.
 */
export async function configRoutes(app: FastifyInstance) {
  app.get('/config', async () => {
    const config = getPublicInstanceConfig()
    // Resolved per request rather than baked into the sync config: the SSO
    // runtime is loaded lazily from the EE package, so it is not knowable at
    // module load. It is cached after the first call.
    const sso = await getSsoPublicConfig()
    return { ...config, auth: { ...config.auth, sso } }
  })
}
