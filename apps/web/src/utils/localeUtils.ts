/**
 * Maps bare language codes (no country segment) to the most conventional
 * country flag to represent that language.
 */
const LANGUAGE_FLAG: Record<string, string> = {
  en: 'gb', // English - Great Britain
  ja: 'jp', // Japanese - Japan
  ko: 'kr', // Korean - South Korea
  zh: 'cn', // Chinese - China
  ar: 'sa', // Arabic - Saudi Arabia
  he: 'il', // Hebrew - Israel
  hi: 'in', // Hindi - India
  bn: 'bd', // Bengali - Bangladesh
  vi: 'vn', // Vietnamese - Vietnam
  ms: 'my', // Malay - Malaysia
  nb: 'no', // Norwegian Bokmal - Norway
  nn: 'no', // Norwegian Nynorsk - Norway
  sw: 'ke', // Swahili - Kenya
  yo: 'ng', // Yoruba - Nigeria
  ha: 'ng', // Hausa - Nigeria
  ur: 'pk', // Urdu - Pakistan
  fa: 'ir', // Persian - Iran
  uk: 'ua', // Ukrainian - Ukraine
}

/** Returns a flag emoji for a locale code like "en", "en_US", "pt_PT", "zh_Hans_CN" */
export function localeFlag(code: string): string {
  const parts = code.split(/[-_]/)
  const country = [...parts].reverse().find((p) => /^[A-Z]{2}$/.test(p))
  const segment = country ?? LANGUAGE_FLAG[parts[0]] ?? parts[0]
  const upper = segment.toUpperCase()
  const offset = 0x1f1e6 - 65
  return String.fromCodePoint(upper.charCodeAt(0) + offset) + String.fromCodePoint(upper.charCodeAt(1) + offset)
}

/** Format a locale entry as "🇬🇧 en - English" */
export function localeLabel(code: string, name: string): string {
  return `${localeFlag(code)} ${code} - ${name}`
}

/**
 * Returns the lowercase country code to use as NbFlag `name` prop.
 * e.g. "pt_PT" -> "pt", "en_US" -> "us", "zh_Hans_CN" -> "cn", "en" -> "gb"
 */
export function localeToFlagName(code: string): string {
  const parts = code.split(/[-_]/)
  const country = [...parts].reverse().find((p) => /^[A-Z]{2}$/.test(p))
  if (country) return country.toLowerCase()
  return LANGUAGE_FLAG[parts[0]] ?? parts[0].toLowerCase()
}
