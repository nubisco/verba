import { describe, expect, it } from 'vitest'
import type { BreadcrumbSegment } from '../../router/router.d'
import { buildTrail, type TrailInput } from '../trail'

const LOGO = 'data:image/png;base64,AAAA'
const acme = { id: 'a1', name: 'Acme', slug: 'acme' }
const globex = { id: 'a2', name: 'Globex', slug: 'globex' }
const web = { id: 'p1', name: 'Website', avatar: null }
const app = { id: 'p2', name: 'App', avatar: LOGO }

const projectTrail = (label: string): BreadcrumbSegment[] => [
  { type: 'account' },
  { type: 'project' },
  { type: 'static', label },
]

function input(over: Partial<TrailInput>): TrailInput {
  return {
    segments: projectTrail('nav.keys'),
    name: 'key-list',
    params: { id: 'p1' },
    query: {},
    t: (k) => k,
    accounts: [acme],
    account: acme,
    project: web,
    projects: [web, app],
    keyName: (id) => (id === 'k1' ? 'checkout.title' : id),
    ...over,
  }
}

describe('buildTrail', () => {
  it('leaves the account out for someone with one, and links it Home for someone with several', () => {
    expect(buildTrail(input({})).map((c) => c.label)).toEqual(['Website', 'nav.keys'])
    const several = buildTrail(input({ accounts: [acme, globex] }))
    expect(several[0]).toEqual({ label: 'Acme', to: { name: 'dashboard' } })
  })

  // Fleet standard, "Breadcrumbs switch, not only navigate".
  it('switches the project to the same page of another project of its account', () => {
    const [project] = buildTrail(input({}))
    expect(project.to).toEqual({ name: 'project-overview', params: { id: 'p1' } })
    expect(project.value).toBe('p1')
    expect(project.switchLabel).toBe('Switch project')
    expect(project.options).toEqual([
      { label: 'Website', value: 'p1', to: { name: 'key-list', params: { id: 'p1' } }, picture: null },
      { label: 'App', value: 'p2', to: { name: 'key-list', params: { id: 'p2' } }, picture: LOGO },
    ])
  })

  it('keeps the settings tab when it switches project', () => {
    const [project] = buildTrail(
      input({
        name: 'project-settings',
        query: { tab: 'members', other: 'x' },
        segments: projectTrail('nav.settings'),
      }),
    )
    expect(project.options?.[1].to).toEqual({
      name: 'project-settings',
      params: { id: 'p2' },
      query: { tab: 'members' },
    })
  })

  it('opens the list a key or an import run belongs to in the other project', () => {
    const keyTrail: BreadcrumbSegment[] = [
      { type: 'project' },
      { type: 'static', label: 'nav.keys', to: 'key-list' },
      { type: 'key' },
    ]
    const onKey = buildTrail(input({ name: 'key-detail', params: { id: 'p1', keyId: 'k1' }, segments: keyTrail }))
    expect(onKey[0].options?.[1].to).toEqual({ name: 'key-list', params: { id: 'p2' } })
    const onCard = buildTrail(input({ name: 'board-key', params: { id: 'p1', keyId: 'k1' }, segments: keyTrail }))
    expect(onCard[0].options?.[1].to).toEqual({ name: 'board', params: { id: 'p2' } })
    const onRun = buildTrail(input({ name: 'import-run', params: { id: 'p1', runId: 'r1' } }))
    expect(onRun[0].options?.[1].to).toEqual({ name: 'project-import', params: { id: 'p2' } })
  })

  it('draws a key as a key, and links its list', () => {
    const trail = buildTrail(
      input({
        name: 'key-detail',
        params: { id: 'p1', keyId: 'k1' },
        segments: [{ type: 'project' }, { type: 'static', label: 'nav.keys', to: 'key-list' }, { type: 'key' }],
      }),
    )
    expect(trail[1]).toEqual({ label: 'nav.keys', to: { name: 'key-list', params: { id: 'p1' } } })
    expect(trail[2]).toEqual({ label: 'checkout.title', code: true })
  })

  it('shows the project logo on its crumb, and no switcher when it is the only project', () => {
    const trail = buildTrail(input({ project: app, params: { id: 'p2' }, projects: [app] }))
    expect(trail[0]).toEqual({ label: 'App', picture: LOGO, to: { name: 'project-overview', params: { id: 'p2' } } })
  })

  it('does not name a project the page is not about while the right one loads', () => {
    const trail = buildTrail(input({ params: { id: 'p2' }, project: web }))
    expect(trail[0].label).toBe('…')
  })

  it('switches the account on its own settings, keeping the tab', () => {
    const trail = buildTrail(
      input({
        name: 'account-settings',
        params: {},
        query: { tab: 'members' },
        accounts: [acme, globex],
        segments: [
          { type: 'account', switch: true },
          { type: 'static', label: 'nav.accountSettings' },
        ],
      }),
    )
    expect(trail[0].options?.map((o) => o.to)).toEqual([
      { name: 'account-settings', query: { tab: 'members', account: 'acme' } },
      { name: 'account-settings', query: { tab: 'members', account: 'globex' } },
    ])
  })
})
