/** One locale's approval progress, as the project store reports it. */
export interface LocaleProgress {
  approved: number
  total: number
}

/**
 * The NbProgressBar status for a locale: `finished` (the bar turns to the
 * success colour) once every key is approved, `active` until then. A locale
 * with no keys has nothing to finish, so it stays `active` on an empty bar.
 */
export function localeProgressStatus(lp: LocaleProgress): 'active' | 'finished' {
  return lp.total > 0 && lp.approved >= lp.total ? 'finished' : 'active'
}
