import { createI18n } from 'vue-i18n'

import en_common from '@/locales/en/common.json'
import en_auth from '@/locales/en/auth.json'
import en_nav from '@/locales/en/nav.json'
import en_projects from '@/locales/en/projects.json'
import en_keys from '@/locales/en/keys.json'
import en_board from '@/locales/en/board.json'
import en_dashboard from '@/locales/en/dashboard.json'
import en_profile from '@/locales/en/profile.json'
import en_import from '@/locales/en/import.json'
import en_export from '@/locales/en/export.json'
import en_review from '@/locales/en/review.json'

const en = {
  common: en_common,
  auth: en_auth,
  nav: en_nav,
  projects: en_projects,
  keys: en_keys,
  board: en_board,
  dashboard: en_dashboard,
  profile: en_profile,
  import: en_import,
  export: en_export,
  review: en_review,
}

export type MessageSchema = typeof en

const savedLocale = localStorage.getItem('verba-locale') ?? 'en'

export const i18n = createI18n<[MessageSchema], 'en'>({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: { en },
})

export async function loadLocale(locale: string): Promise<void> {
  if (locale === 'en') return
  if ((i18n.global.availableLocales as string[]).includes(locale)) return

  const namespaces = [
    'common',
    'auth',
    'nav',
    'projects',
    'keys',
    'board',
    'dashboard',
    'profile',
    'import',
    'export',
    'review',
  ]
  const messages: Record<string, unknown> = {}

  await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const res = await fetch(`/locales/${locale}/${ns}.json`)
        if (res.ok) messages[ns] = await res.json()
      } catch {
        // namespace not available for this locale
      }
    }),
  )

  i18n.global.setLocaleMessage(locale as 'en', messages as unknown as MessageSchema)
}

export async function setLocale(locale: string): Promise<void> {
  await loadLocale(locale)
  ;(i18n.global.locale as unknown as { value: string }).value = locale
  localStorage.setItem('verba-locale', locale)
  document.documentElement.lang = locale.split('_')[0]
}
