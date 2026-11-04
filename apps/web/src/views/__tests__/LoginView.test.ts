// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NbButton, NbPanel } from '@nubisco/ui'

const { takeSsoToken } = vi.hoisted(() => ({ takeSsoToken: vi.fn((): string | null => null) }))
vi.mock('../../utils/ssoToken', () => ({ takeSsoToken }))
vi.mock('../../api', () => {
  class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly body: Record<string, unknown> | null,
    ) {
      super(message)
    }
    get code() {
      return typeof this.body?.code === 'string' ? this.body.code : undefined
    }
  }
  return { apiFetch: vi.fn(), ApiError, API_BASE: '/api' }
})

import { ApiError, apiFetch } from '../../api'
import { i18n } from '../../i18n'
import { useInstanceConfigStore } from '../../stores/instanceConfig'
import LoginView from '../LoginView.vue'

// Hosted Verba signs in through its provider only, with sign-up closed. When
// the provider hands over an identity Verba refuses, the page has to say which
// identity that was and make switching the main action: signing in again with
// no prompt replays the same pinned identity, which is the trap this guards.
const flushAll = async () => {
  for (let i = 0; i < 6; i++) {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
  }
}

describe('LoginView refusal after federated sign-in', () => {
  let app: App | null = null
  let root: HTMLElement
  const navigated: string[] = []

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    takeSsoToken.mockReturnValue(null)
    navigated.length = 0
    sessionStorage.clear()
    root = document.createElement('div')
    document.body.appendChild(root)
    // location.href is how a sign-in starts. Capture it rather than navigate.
    const real = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        origin: real.origin,
        set href(v: string) {
          navigated.push(v)
        },
        get href() {
          return real.href
        },
      },
    })
  })

  afterEach(() => {
    app?.unmount()
    app = null
    root.remove()
  })

  async function mountAt(url: string, opts: { serverSso: boolean; routes?: Record<string, unknown> }) {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/config')
        return {
          features: {},
          signup: { open: false, terms: null },
          auth: {
            mode: 'platform',
            localPasswordEnabled: false,
            localOtpEnabled: false,
            platformEnabled: true,
            platformIssuer: 'https://id.example.com',
            platformAuthOrigin: 'https://id.example.com',
            platformAppId: 'example-verba',
            sso: opts.serverSso
              ? { enabled: true, mode: 'handover', label: 'Nubisco' }
              : { enabled: false, mode: null, label: null },
          },
        }
      if (opts.routes && path in opts.routes) {
        const answer = opts.routes[path]
        if (answer instanceof Error) throw answer
        return answer
      }
      throw new Error(`unexpected ${path}`)
    })
    const pinia = createPinia()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', component: LoginView },
        { path: '/projects', component: { template: '<div />' } },
      ],
    })
    await router.push(url)
    app = createApp({ template: '<router-view />' })
    app.component('NbButton', NbButton)
    app.component('NbPanel', NbPanel)
    app.use(pinia)
    app.use(router)
    app.use(i18n)
    await useInstanceConfigStore(pinia).fetch()
    app.mount(root)
    await flushAll()
    return router
  }

  const buttons = () => Array.from(root.querySelectorAll('button')).map((b) => b.textContent?.trim())

  it('names the identity the provider sent, from the server flow, and says why once', async () => {
    const router = await mountAt('/login?error=signup_closed', {
      serverSso: true,
      routes: { '/auth/sso/refused': { email: 'second@example.com' } },
    })

    const text = root.textContent ?? ''
    expect(text).toContain("You're signed in to Nubisco as")
    expect(text).toContain('second@example.com')
    // The reason appears once, and the fixed closed-sign-up note is gone.
    expect(text.match(/not open for new accounts/g)).toHaveLength(1)
    // The address never sits in the URL.
    expect(router.currentRoute.value.fullPath).toBe('/login')
  })

  it('makes "Use another account" the main action, asking the provider for its chooser', async () => {
    await mountAt('/login?error=not_a_member', {
      serverSso: true,
      routes: { '/auth/sso/refused': { email: 'second@example.com' } },
    })

    expect(buttons()).toEqual(['Use another account', 'Add another account'])
    expect(root.textContent).not.toContain('Sign in with')
    expect(root.textContent).toContain('cannot sign in to this Verba instance')

    const primary = root.querySelector<HTMLButtonElement>('.platform-btn')!
    expect(primary.textContent?.trim()).toBe('Use another account')
    primary.click()
    expect(new URL(navigated[0]!).searchParams.get('prompt')).toBe('select_account')
    Array.from(root.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Add another'))!
      .click()
    expect(new URL(navigated[1]!).searchParams.get('prompt')).toBe('login')
  })

  it('names the identity from the callback answer on the browser flow', async () => {
    takeSsoToken.mockReturnValue('jwt')
    sessionStorage.setItem('verba.platform.sso.state', 'st')
    await mountAt('/login?state=st', {
      serverSso: false,
      routes: {
        '/auth/platform/callback': new ApiError('closed', 403, {
          error: 'closed',
          code: 'signup_closed',
          email: 'second@example.com',
        }),
      },
    })

    expect(root.textContent).toContain('second@example.com')
    expect(root.textContent?.match(/not open for new accounts/g)).toHaveLength(1)
    root.querySelector<HTMLButtonElement>('.platform-btn')!.click()
    const url = new URL(navigated[0]!)
    expect(url.pathname).toBe('/api/auth/sso')
    expect(url.searchParams.get('prompt')).toBe('select_account')
  })

  it('still explains the refusal when the server could not name the identity', async () => {
    await mountAt('/login?error=not_a_member', {
      serverSso: true,
      routes: { '/auth/sso/refused': { email: null } },
    })
    expect(root.textContent).not.toContain("You're signed in")
    expect(root.textContent).toContain('cannot sign in to this Verba instance')
    expect(buttons()[0]).toBe('Use another account')
  })

  it('shows no closed-sign-up note on the plain sign-in page', async () => {
    await mountAt('/login', { serverSso: true })
    expect(root.textContent).not.toContain('not open for new accounts')
    expect(buttons()[0]).toBe('Sign in with Nubisco')
  })
})
