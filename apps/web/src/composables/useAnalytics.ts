// Thin wrapper around the @nubisco/analytics tracker script (window.nba.*).
// The script is loaded from VITE_ANALYTICS_URL with data-app="verba" so every
// event is tagged with app_id="verba". Identity is the platform user_id (OIDC
// `sub`), which already lives in the auth store, no PII is sent.

const APP_ID = 'verba'

interface Nba {
  track: (name: string, props?: Record<string, unknown>) => void
  identify: (userId: string, opts?: { appId?: string }) => void
  reset: () => void
}

declare global {
  interface Window {
    nba?: Nba
  }
}

let initialized = false

export async function initAnalytics(): Promise<void> {
  if (initialized) return
  const base = import.meta.env.VITE_ANALYTICS_URL
  if (!base || !import.meta.env.PROD) return
  initialized = true

  await new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.src = `${base.replace(/\/$/, '')}/script.js`
    script.defer = true
    script.dataset.app = APP_ID
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => resolve(), { once: true })
    document.head.appendChild(script)
  })
}

export function trackEvent(name: string, props?: Record<string, unknown>): void {
  window.nba?.track(name, props)
}

export function identifyUser(id: string): void {
  window.nba?.identify(id, { appId: APP_ID })
}

export function resetUser(): void {
  window.nba?.reset()
}
