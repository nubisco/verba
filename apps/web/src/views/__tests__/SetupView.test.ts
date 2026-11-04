// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { NbButton, NbTextInput } from '@nubisco/ui'

vi.mock('../../api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../../api'
import { useInstanceConfigStore } from '../../stores/instanceConfig'
import SetupView from '../SetupView.vue'

// The wizard asks for a password only where password sign-in is on
// (ENABLE_LOCAL_PASSWORD, reported by /config). With email codes alone the API
// ignores a password, so asking for one was a lie.
describe('SetupView', () => {
  let app: App | null = null
  let root: HTMLElement

  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    root = document.createElement('div')
    document.body.appendChild(root)
  })

  afterEach(() => {
    app?.unmount()
    app = null
    root.remove()
  })

  async function mountWith(auth: { localPasswordEnabled: boolean; localOtpEnabled: boolean }) {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      features: {},
      auth: {
        mode: auth.localPasswordEnabled ? (auth.localOtpEnabled ? 'hybrid' : 'local_password') : 'local_otp',
        platformEnabled: false,
        platformIssuer: null,
        platformAppId: null,
        ...auth,
      },
    })
    const pinia = createPinia()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    app = createApp(SetupView)
    // The build resolves Nb* tags at compile time, which the test transform does not.
    app.component('NbButton', NbButton)
    app.component('NbTextInput', NbTextInput)
    app.use(pinia)
    app.use(router)
    await useInstanceConfigStore(pinia).fetch()
    app.mount(root)
    // Past the welcome step, to the account form.
    root.querySelector('button')?.click()
    await nextTick()
    await nextTick()
  }

  it('asks for a password when password sign-in is on', async () => {
    await mountWith({ localPasswordEnabled: true, localOtpEnabled: true })
    expect(root.querySelector('input[type="email"]')).not.toBeNull()
    expect(root.querySelector('input[type="password"]')).not.toBeNull()
  })

  it('asks for no password when the instance signs in by email code only', async () => {
    await mountWith({ localPasswordEnabled: false, localOtpEnabled: true })
    expect(root.querySelector('input[type="email"]')).not.toBeNull()
    expect(root.querySelector('input[type="password"]')).toBeNull()
    expect(root.textContent).toContain('You sign in with a code sent to this address.')
  })

  it('sends no password to /setup when it asked for none', async () => {
    await mountWith({ localPasswordEnabled: false, localOtpEnabled: true })
    vi.mocked(apiFetch).mockResolvedValue({})
    const input = root.querySelector<HTMLInputElement>('input[type="email"]')!
    input.value = 'ops@example.com'
    input.dispatchEvent(new Event('input'))
    root.querySelector('form')!.dispatchEvent(new Event('submit'))
    await nextTick()
    const call = vi.mocked(apiFetch).mock.calls.find(([path]) => path === '/setup')
    expect(call).toBeDefined()
    expect(JSON.parse(String(call![1]!.body))).toEqual({ adminEmail: 'ops@example.com' })
  })
})
