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

/** Languages offered when someone picks one (a project's locale, their own preferred languages). Any code can still be typed. */
export const KNOWN_LOCALES: { id: string; code: string; name: string }[] = [
  { id: 'en', code: 'en', name: 'English' },
  { id: 'en_US', code: 'en_US', name: 'English (United States)' },
  { id: 'en_GB', code: 'en_GB', name: 'English (United Kingdom)' },
  { id: 'pt', code: 'pt', name: 'Portuguese' },
  { id: 'pt_PT', code: 'pt_PT', name: 'Portuguese (Portugal)' },
  { id: 'pt_BR', code: 'pt_BR', name: 'Portuguese (Brazil)' },
  { id: 'es', code: 'es', name: 'Spanish' },
  { id: 'es_ES', code: 'es_ES', name: 'Spanish (Spain)' },
  { id: 'es_MX', code: 'es_MX', name: 'Spanish (Mexico)' },
  { id: 'fr', code: 'fr', name: 'French' },
  { id: 'fr_FR', code: 'fr_FR', name: 'French (France)' },
  { id: 'de', code: 'de', name: 'German' },
  { id: 'de_DE', code: 'de_DE', name: 'German (Germany)' },
  { id: 'it', code: 'it', name: 'Italian' },
  { id: 'ja', code: 'ja', name: 'Japanese' },
  { id: 'ko', code: 'ko', name: 'Korean' },
  { id: 'zh', code: 'zh', name: 'Chinese' },
  { id: 'zh_CN', code: 'zh_CN', name: 'Chinese (Simplified)' },
  { id: 'zh_TW', code: 'zh_TW', name: 'Chinese (Traditional)' },
  { id: 'ru', code: 'ru', name: 'Russian' },
  { id: 'ar', code: 'ar', name: 'Arabic' },
  { id: 'nl', code: 'nl', name: 'Dutch' },
  { id: 'pl', code: 'pl', name: 'Polish' },
  { id: 'sv', code: 'sv', name: 'Swedish' },
  { id: 'da', code: 'da', name: 'Danish' },
  { id: 'fi', code: 'fi', name: 'Finnish' },
  { id: 'nb', code: 'nb', name: 'Norwegian (Bokmål)' },
  { id: 'tr', code: 'tr', name: 'Turkish' },
  { id: 'cs', code: 'cs', name: 'Czech' },
  { id: 'sk', code: 'sk', name: 'Slovak' },
  { id: 'hu', code: 'hu', name: 'Hungarian' },
  { id: 'ro', code: 'ro', name: 'Romanian' },
  { id: 'uk', code: 'uk', name: 'Ukrainian' },
  { id: 'el', code: 'el', name: 'Greek' },
  { id: 'he', code: 'he', name: 'Hebrew' },
  { id: 'vi', code: 'vi', name: 'Vietnamese' },
  { id: 'th', code: 'th', name: 'Thai' },
  { id: 'id', code: 'id', name: 'Indonesian' },
  { id: 'ms', code: 'ms', name: 'Malay' },
  { id: 'hi', code: 'hi', name: 'Hindi' },
  { id: 'bn', code: 'bn', name: 'Bengali' },
]
