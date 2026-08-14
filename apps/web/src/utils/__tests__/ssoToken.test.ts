import { describe, it, expect, beforeEach } from 'vitest'
import mainSource from '../../main.ts?raw'
import { consumeSsoTokenFromUrl, takeSsoToken, resetSsoTokenForTests } from '../ssoToken'

// A shape-accurate stand-in for a platform RS256 access token.
const FAKE_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEiLCJhcHAiOiJ2ZXJiYSJ9.c2lnbmF0dXJl'

function visit(url: string) {
  window.history.replaceState(null, '', url)
}

describe('consumeSsoTokenFromUrl', () => {
  beforeEach(() => {
    resetSsoTokenForTests()
    visit('/login')
  })

  it('removes the token from the address bar', () => {
    visit(`/login?token=${FAKE_TOKEN}&state=abc-123`)

    consumeSsoTokenFromUrl()

    expect(window.location.href).not.toContain(FAKE_TOKEN)
    expect(window.location.search).not.toContain('token=')
  })

  it('hands the token to the caller exactly once', () => {
    visit(`/login?token=${FAKE_TOKEN}&state=abc-123`)

    consumeSsoTokenFromUrl()

    expect(takeSsoToken()).toBe(FAKE_TOKEN)
    // A later visit to /login in the same SPA session must not replay it.
    expect(takeSsoToken()).toBeNull()
  })

  it('keeps the non-credential params the callback handler still needs', () => {
    visit(`/login?token=${FAKE_TOKEN}&state=abc-123&redirect=%2Fprojects%2F7`)

    consumeSsoTokenFromUrl()

    const params = new URLSearchParams(window.location.search)
    expect(params.get('state')).toBe('abc-123')
    expect(params.get('redirect')).toBe('/projects/7')
    expect(params.get('token')).toBeNull()
  })

  it('leaves a token-free URL untouched', () => {
    visit('/login?redirect=%2Fprojects')

    consumeSsoTokenFromUrl()

    expect(window.location.search).toBe('?redirect=%2Fprojects')
    expect(takeSsoToken()).toBeNull()
  })

  it('replaces rather than pushes, so the tokenised URL is not a history entry', () => {
    const before = window.history.length
    visit(`/login?token=${FAKE_TOKEN}`)
    const afterVisit = window.history.length

    consumeSsoTokenFromUrl()

    expect(window.history.length).toBe(afterVisit)
    expect(afterVisit).toBe(before)
  })
})

describe('boot ordering', () => {
  // Ordering is what actually decides whether the token leaks: Sentry and the
  // analytics tracker both read location.href when they initialise, so the
  // token must already be out of the URL by then.
  it('consumes the token before Sentry and analytics initialise', () => {
    const consumeAt = mainSource.indexOf('consumeSsoTokenFromUrl()')
    const sentryAt = mainSource.indexOf('Sentry.init(')
    const analyticsAt = mainSource.indexOf('initAnalytics()')

    expect(consumeAt).toBeGreaterThan(-1)
    expect(sentryAt).toBeGreaterThan(consumeAt)
    expect(analyticsAt).toBeGreaterThan(consumeAt)
  })
})
