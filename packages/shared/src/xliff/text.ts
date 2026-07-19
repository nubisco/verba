// XML text (de)coding helpers.
//
// The skeleton is kept in raw entity space (fast-xml-parser runs with
// processEntities:false), so untouched nodes round-trip byte-for-byte. These
// helpers convert between that raw space and the decoded text Verba stores and
// shows to translators.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** Decode XML entities (named + numeric) into their literal characters. */
export function decodeXmlText(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const code = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      if (Number.isNaN(code)) return match
      try {
        return String.fromCodePoint(code)
      } catch {
        return match
      }
    }
    return NAMED[body] ?? match
  })
}

/**
 * Escape a decoded string for insertion into XML element text. Only `& < >`
 * need escaping in text content; quotes and non-ASCII (smart quotes, emoji)
 * stay as literal UTF-8, matching how Xcode emits them.
 */
export function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
