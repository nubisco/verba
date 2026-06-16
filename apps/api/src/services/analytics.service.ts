// Server-side @nubisco/analytics emitter. Fire-and-forget; never blocks the
// request that triggered it, never throws upward. No-ops when the analytics
// env vars are missing so dev and self-hosted instances stay quiet.
//
// Env:
//   ANALYTICS_URL          base URL, e.g. https://analytics.nubisco.io
//   ANALYTICS_TOKEN        bearer token for /api/v1/event (scope: ingest)
//   ANALYTICS_DOMAIN       domain registered in analytics (e.g. verba.nubisco.io)
//   ANALYTICS_PROPERTY_ID  optional, takes precedence over ANALYTICS_DOMAIN

const APP_ID = 'verba'
const SYNTHETIC_HOST = 'https://verba.nubisco.io'

interface TrackOptions {
  userId: string | null | undefined
  props?: Record<string, unknown>
}

function config() {
  const base = process.env.ANALYTICS_URL?.replace(/\/$/, '')
  const token = process.env.ANALYTICS_TOKEN
  const propertyId = process.env.ANALYTICS_PROPERTY_ID
  const domain = process.env.ANALYTICS_DOMAIN
  if (!base || !token || (!propertyId && !domain)) return null
  return { url: `${base}/api/v1/event`, token, propertyId, domain }
}

export function track(eventName: string, opts: TrackOptions): void {
  const cfg = config()
  if (!cfg) return

  // Identified events require a userId. Anonymous server events would create
  // visitor rows we can't ever join back to a person, so skip them outright.
  const userId = opts.userId
  if (!userId) return

  const payload: Record<string, unknown> = {
    url: `${SYNTHETIC_HOST}/_/server/${eventName}`,
    eventType: 'custom',
    eventName,
    appId: APP_ID,
    userId,
    visitorId: userId,
    sessionId: userId,
    props: opts.props,
  }
  if (cfg.propertyId) payload.propertyId = cfg.propertyId
  else if (cfg.domain) payload.domain = cfg.domain

  // Intentionally not awaited. We don't want analytics latency or failure to
  // affect API response times. Errors are logged but never re-raised.
  void fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn(`[analytics] ${eventName} dispatch failed:`, err?.message ?? err)
  })
}
