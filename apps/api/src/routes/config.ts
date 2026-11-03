import type { Api } from '../http.js'
import { getPublicInstanceConfig } from '../services/instance-config.service.js'
import { getSsoPublicConfig } from '../services/sso.service.js'
import { hostedBillingEnabled } from '../services/billing.service.js'

/**
 * Public instance configuration endpoint.
 * No authentication required: the frontend fetches this before login
 * to know which features are enabled on this deployment.
 */
export function configRoutes(app: Api) {
  app.get('/config', async (c) => {
    const config = getPublicInstanceConfig()
    // Resolved per request rather than baked into the sync config: the SSO
    // runtime is loaded lazily from the EE package, so it is not knowable at
    // module load. It is cached after the first call.
    const sso = await getSsoPublicConfig()
    // Hosted billing is EE and switched on by configuration, so it is
    // resolved here for the same reason as SSO.
    const billing = await hostedBillingEnabled()
    return c.json({ ...config, features: { ...config.features, billing }, auth: { ...config.auth, sso } })
  })
}
