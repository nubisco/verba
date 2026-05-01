import type { FastifyInstance } from 'fastify'
import { getPublicInstanceConfig } from '../services/instance-config.service.js'

/**
 * Public instance configuration endpoint.
 * No authentication required: the frontend fetches this before login
 * to know which features are enabled on this deployment.
 */
export async function configRoutes(app: FastifyInstance) {
  app.get('/config', async () => {
    return getPublicInstanceConfig()
  })
}
