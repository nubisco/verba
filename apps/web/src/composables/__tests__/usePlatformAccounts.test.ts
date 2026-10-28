import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../../api', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from '../../api'
import { useInstanceConfigStore } from '../../stores/instanceConfig'
import { usePlatformAccounts } from '../usePlatformAccounts'

// Accord keeps platform.nubisco.io as the token issuer and holds browser
// sessions on its auth host. The switcher has to ask the auth host, or it
// reads the old session cookie and shows stale or no accounts.
describe('usePlatformAccounts', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ identities: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  async function loadWith(auth: Record<string, unknown>): Promise<string> {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      features: {},
      auth: {
        mode: 'local_otp',
        localOtpEnabled: true,
        localPasswordEnabled: false,
        platformEnabled: true,
        platformIssuer: 'https://platform.example.com',
        platformAppId: 'nubisco-verba',
        ...auth,
      },
    })
    await useInstanceConfigStore().fetch()
    await usePlatformAccounts().load()
    return String(fetchMock.mock.calls[0][0])
  }

  it('lists the accounts from the auth host', async () => {
    const url = await loadWith({ platformAuthOrigin: 'https://auth.example.com' })
    expect(url).toBe('https://auth.example.com/api/auth/identities')
  })

  it('falls back to the issuer when the API does not name an auth host', async () => {
    const url = await loadWith({})
    expect(url).toBe('https://platform.example.com/api/auth/identities')
  })
})
