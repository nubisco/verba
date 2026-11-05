import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import type { AccountSummary } from '../../stores/accounts'

const route = reactive({
  name: 'key-list',
  query: {} as Record<string, string>,
  params: { id: 'p1' } as Record<string, string>,
  meta: {
    breadcrumb: [{ type: 'account' }, { type: 'project' }, { type: 'static', label: 'nav.keys' }],
  } as Record<string, unknown>,
})
const accounts = reactive({ accounts: [] as AccountSummary[], current: null as AccountSummary | null })

vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('../../stores/accounts', () => ({ useAccountsStore: () => accounts }))
vi.mock('../../stores/project', () => ({ useProjectStore: () => ({ project: { name: 'Website' } }) }))
vi.mock('../../stores/keyName', () => ({ useKeyNameStore: () => ({ resolve: vi.fn(), getName: (k: string) => k }) }))

const { useBreadcrumbs } = await import('../useBreadcrumbs')

const account = (id: string, name: string) =>
  ({ id, name, slug: name.toLowerCase(), role: 'OWNER' }) as unknown as AccountSummary

// The account crumb tells one account from another. With one, there is nothing
// to tell apart, so the trail starts at the project.
describe('useBreadcrumbs', () => {
  it('leaves the account out for a person with one account', () => {
    accounts.accounts = [account('a1', 'Acme')]
    accounts.current = accounts.accounts[0]
    const { crumbs } = useBreadcrumbs()
    expect(crumbs.value.map((c) => c.label)).toEqual(['Website', 'nav.keys'])
  })

  it('starts with the account, linking Home, for a person with several', () => {
    accounts.accounts = [account('a1', 'Acme'), account('a2', 'Globex')]
    accounts.current = accounts.accounts[1]
    const { crumbs } = useBreadcrumbs()
    expect(crumbs.value[0]).toEqual({ label: 'Globex', to: { name: 'dashboard' } })
    expect(crumbs.value.map((c) => c.label)).toEqual(['Globex', 'Website', 'nav.keys'])
  })

  describe('on the account settings page', () => {
    const settingsTrail = [
      { type: 'account', switch: true },
      { type: 'static', label: 'nav.accountSettings' },
    ]

    it('names the account even when it is the only one, with nothing to switch to', () => {
      route.name = 'account-settings'
      route.meta.breadcrumb = settingsTrail
      accounts.accounts = [account('a1', 'Acme')]
      accounts.current = accounts.accounts[0]
      const { crumbs } = useBreadcrumbs()
      expect(crumbs.value[0]).toEqual({ label: 'Acme' })
    })

    it('switches to the same settings tab of another account', () => {
      route.name = 'account-settings'
      route.query = { tab: 'members' }
      route.meta.breadcrumb = settingsTrail
      accounts.accounts = [account('a1', 'Acme'), account('a2', 'Globex')]
      accounts.current = accounts.accounts[0]
      const { crumbs } = useBreadcrumbs()
      expect(crumbs.value[0].value).toBe('a1')
      expect(crumbs.value[0].options).toEqual([
        { label: 'Acme', value: 'a1', to: { name: 'account-settings', query: { tab: 'members', account: 'acme' } } },
        {
          label: 'Globex',
          value: 'a2',
          to: { name: 'account-settings', query: { tab: 'members', account: 'globex' } },
        },
      ])
      expect(crumbs.value.map((c) => c.label)).toEqual(['Acme', 'nav.accountSettings'])
    })
  })
})
