// XLIFF interoperability engine (version-agnostic internal model + XLIFF 1.2
// parse/serialize, placeholder validation, and state mapping). Pure, DB-free.

export type { XliffDocument, XliffFile, XliffUnit, XliffOverlay, XliffVersion } from './model.js'
export { unitKey } from './model.js'
export { parseXliff } from './parse.js'
export { serializeXliff } from './serialize.js'
export {
  extractPlaceholders,
  validatePlaceholders,
  type Placeholder,
  type PlaceholderValidation,
} from './placeholders.js'
export { stateToStatus, canonicalStateFor, resolveExportState } from './state.js'
export { decodeXmlText, escapeXmlText } from './text.js'
