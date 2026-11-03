import type { FastifyInstance } from 'fastify'
import { registerHostedBilling } from '../services/billing.service.js'

// Hosted billing's routes come from the Enterprise Edition, and only on an
// instance configured to sell plans (services/billing.service.ts). On any
// other instance this registers nothing.
export async function billingRoutes(app: FastifyInstance) {
  await registerHostedBilling(app)
}
