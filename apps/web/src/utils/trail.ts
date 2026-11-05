/**
 * The breadcrumb trail, as data for `NbBreadcrumbs`' `items`.
 *
 * Each route declares its trail in `meta.breadcrumb` (router.d.ts), and this
 * turns it into crumbs. Every crumb but the last links, and the last is the
 * page you are on. A crumb that names one of several things of its kind is a
 * switcher (fleet standard, "Breadcrumbs switch, not only navigate", the
 * pattern Tally's AppBreadcrumbs and Acta's lib/trail.ts set): its chevron
 * opens a searchable list of the others, and picking one opens the same page
 * for it.
 *
 * - The project switches to the same page of another project of its account:
 *   Keys to Keys, Settings to Settings on the same tab. A page about one thing
 *   inside the project (a key, an import run) has no equivalent there, so it
 *   opens the list that thing was in.
 * - The account, on its own Settings, switches to another account's Settings.
 *   Elsewhere it only names the account, for someone with several, and links
 *   Home, where projects are grouped by account.
 * - A key is drawn as a key (`code`), in the monospace face.
 *
 * Pure, so the rules are tested without mounting the app.
 */
import type { IBreadcrumbItem } from '@nubisco/ui'
import type { BreadcrumbSegment } from '../router/router.d'
import { isLogo } from './logo'

export interface TrailAccount {
  id: string
  name: string
  slug: string
}

export interface TrailProject {
  id: string
  name: string
  avatar?: string | null
}

export interface TrailInput {
  segments: readonly BreadcrumbSegment[]
  /** The route's name. */
  name: string
  params: Record<string, unknown>
  query: Record<string, unknown>
  t: (key: string) => string
  accounts: readonly TrailAccount[]
  account: TrailAccount | null
  /** The project the page is about, once loaded. */
  project: TrailProject | null
  /** The other projects of its account, the project itself included. */
  projects: readonly TrailProject[]
  /** A key's name, or its id until the name is known. */
  keyName: (keyId: string) => string
}

/** Where a project's page goes in another project: the same page, or the list a detail page belongs to. */
const PROJECT_SWITCH_TARGET: Record<string, string> = {
  'key-detail': 'key-list',
  'board-key': 'board',
  'import-run': 'project-import',
}

/** The query a page keeps when it switches project: which settings tab is open. */
const QUERY_KEPT = ['tab']

function kept(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of QUERY_KEPT) {
    const value = query[key]
    if (typeof value === 'string' && value) out[key] = value
  }
  return out
}

function projectPicture(project: TrailProject | undefined): string | undefined {
  return project && isLogo(project.avatar) ? project.avatar : undefined
}

/**
 * A project's picture in the switcher: its logo, or its initials (null) when
 * another project in the list has a logo, so the names still line up. When no
 * project has one, nothing, and the list is names alone.
 */
function optionPicture(project: TrailProject, list: readonly TrailProject[]): { picture?: string | null } {
  const logo = projectPicture(project)
  if (logo) return { picture: logo }
  return list.some((p) => isLogo(p.avatar)) ? { picture: null } : {}
}

export function buildTrail(input: TrailInput): IBreadcrumbItem[] {
  const projectId = typeof input.params.id === 'string' ? input.params.id : undefined

  return input.segments.flatMap((seg): IBreadcrumbItem[] => {
    if (seg.type === 'static') {
      const to = seg.to && projectId ? { name: seg.to, params: { id: projectId } } : undefined
      return [{ label: input.t(seg.label), ...(to && { to }) }]
    }

    if (seg.type === 'account') {
      const current = input.account
      if (!current) return []
      if (seg.switch) {
        const tab = kept(input.query)
        return [
          {
            label: current.name,
            ...(input.accounts.length > 1 && {
              value: current.id,
              options: input.accounts.map((a) => ({
                label: a.name,
                value: a.id,
                to: { name: input.name, query: { ...tab, account: a.slug } },
              })),
              switchLabel: 'Switch account',
              searchPlaceholder: 'Find an account',
              noResultsLabel: 'No account matches',
            }),
          },
        ]
      }
      if (input.accounts.length < 2) return []
      return [{ label: current.name, to: { name: 'dashboard' } }]
    }

    if (seg.type === 'project') {
      const project = input.project && input.project.id === projectId ? input.project : null
      const picture = projectPicture(project ?? undefined)
      const target = PROJECT_SWITCH_TARGET[input.name] ?? input.name
      const query = kept(input.query)
      const peers = input.projects
      return [
        {
          label: project?.name ?? '…',
          ...(picture && { picture }),
          ...(projectId && { to: { name: 'project-overview', params: { id: projectId } } }),
          ...(projectId &&
            peers.length > 1 && {
              value: projectId,
              options: peers.map((p) => ({
                label: p.name,
                value: p.id,
                to: { name: target, params: { id: p.id }, ...(Object.keys(query).length > 0 && { query }) },
                ...optionPicture(p, peers),
              })),
              switchLabel: 'Switch project',
              searchPlaceholder: 'Find a project',
              noResultsLabel: 'No project matches',
            }),
        },
      ]
    }

    // seg.type === 'key'
    const keyId = typeof input.params.keyId === 'string' ? input.params.keyId : undefined
    return [{ label: keyId ? input.keyName(keyId) : '…', code: true }]
  })
}
