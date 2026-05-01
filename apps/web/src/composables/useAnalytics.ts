import type { PostHog } from 'posthog-js'

let _posthog: PostHog | null = null

// ─── Initialization ────────────────────────────────────────────────────────

/** Initialize PostHog. Only runs in production when VITE_POSTHOG_KEY is set.
 *  Lazy-loads posthog-js to keep the dev bundle clean. Safe to call multiple times. */
export async function initPostHog(): Promise<void> {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key || !import.meta.env.PROD || _posthog) return

  const { default: posthog } = await import('posthog-js')
  const host = import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com'

  posthog.init(key, {
    api_host: host,
    capture_pageview: false, // Managed manually via trackPageView
    capture_pageleave: true,
    autocapture: false, // Selective tracking only: privacy conscious
  })

  _posthog = posthog
}

// ─── Event API ─────────────────────────────────────────────────────────────

/** Track a pageview. Call from router.afterEach. */
export function trackPageView(): void {
  _posthog?.capture('$pageview', { $current_url: window.location.href })
}

/** Track a named product event with optional properties. */
export function trackEvent(name: string, props?: Record<string, unknown>): void {
  _posthog?.capture(name, props)
}

// ─── Identity ──────────────────────────────────────────────────────────────

/** Associate all subsequent events with an authenticated user.
 *  Call after a successful login or register. */
export function identifyUser(id: string, traits?: Record<string, unknown>): void {
  _posthog?.identify(id, traits)
}

/** Disassociate the current user and start a new anonymous session.
 *  Must be called on logout to prevent session bleed between accounts. */
export function resetUser(): void {
  _posthog?.reset()
}
