import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import type { XliffOverlay } from './model.js'
import { unitKey } from './model.js'
import { escapeXmlText } from './text.js'

type OrderedNode = Record<string, unknown>

const PARSE_OPTS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false,
  ignoreDeclaration: true,
  commentPropName: '#comment',
} as const

const BUILD_OPTS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: false,
  suppressEmptyNode: true,
  processEntities: false,
  commentPropName: '#comment',
} as const

const RESERVED = new Set([':@', '#text', '#comment'])

function tagName(node: OrderedNode): string | undefined {
  for (const k of Object.keys(node)) if (!RESERVED.has(k)) return k
  return undefined
}
function attrs(node: OrderedNode): Record<string, string> {
  if (!node[':@']) node[':@'] = {}
  return node[':@'] as Record<string, string>
}
function childList(node: OrderedNode, name: string): OrderedNode[] {
  return (node[name] as OrderedNode[] | undefined) ?? []
}
function rawText(children: OrderedNode[]): string {
  return children.map((c) => (typeof c['#text'] === 'string' ? (c['#text'] as string) : '')).join('')
}

/**
 * Regenerate an XLIFF document from its original text (the skeleton), overlaying
 * only changed <target> values + states. Untouched nodes (header, order,
 * unknown elements, entities, whitespace) are reproduced byte-for-byte, and the
 * XML prolog/epilog are transplanted verbatim from the original.
 *
 * `overlays` is keyed by unitKey(fileOriginal, transUnitId). An overlay whose
 * escaped text and state already match the skeleton is skipped, so a zero-edit
 * export is byte-identical to the input.
 */
export function serializeXliff(originalXml: string, overlays: Map<string, XliffOverlay>): string {
  if (overlays.size === 0) return originalXml

  const ast = new XMLParser(PARSE_OPTS).parse(originalXml) as OrderedNode[]
  const root = ast.find((n) => tagName(n) === 'xliff')
  if (!root) return originalXml

  let changed = false
  for (const fileNode of childList(root, 'xliff')) {
    if (tagName(fileNode) !== 'file') continue
    const original = attrs(fileNode)['@_original'] ?? ''
    changed = applyToUnits(childList(fileNode, 'file'), original, overlays) || changed
  }

  if (!changed) return originalXml

  const body = new XMLBuilder(BUILD_OPTS).build(ast) as string
  const start = originalXml.indexOf('<xliff')
  const endIdx = originalXml.lastIndexOf('</xliff>')
  if (start === -1 || endIdx === -1) return body
  const prolog = originalXml.slice(0, start)
  const epilog = originalXml.slice(endIdx + '</xliff>'.length)
  return prolog + body + epilog
}

function applyToUnits(nodes: OrderedNode[], original: string, overlays: Map<string, XliffOverlay>): boolean {
  let changed = false
  for (const node of nodes) {
    const name = tagName(node)
    if (!name) continue
    if (name === 'trans-unit') {
      const id = attrs(node)['@_id'] ?? ''
      const overlay = overlays.get(unitKey(original, id))
      if (overlay && applyOverlay(node, overlay)) changed = true
    } else {
      changed = applyToUnits(childList(node, name), original, overlays) || changed
    }
  }
  return changed
}

function applyOverlay(unit: OrderedNode, overlay: XliffOverlay): boolean {
  const kids = childList(unit, 'trans-unit')
  const newRaw = escapeXmlText(overlay.text)
  const targetIdx = kids.findIndex((c) => tagName(c) === 'target')

  if (targetIdx !== -1) {
    const targetNode = kids[targetIdx]
    const currentRaw = rawText(childList(targetNode, 'target'))
    const currentState = attrs(targetNode)['@_state']
    if (currentRaw === newRaw && currentState === overlay.state) return false
    targetNode.target = [{ '#text': newRaw }]
    attrs(targetNode)['@_state'] = overlay.state
    return true
  }

  // No <target> yet: insert one after <source>, mirroring its indentation.
  const sourceIdx = kids.findIndex((c) => tagName(c) === 'source')
  const newTarget: OrderedNode = { target: [{ '#text': newRaw }], ':@': { '@_state': overlay.state } }
  if (sourceIdx !== -1) {
    const ws = kids[sourceIdx - 1]
    const wsClone: OrderedNode | undefined =
      ws && typeof ws['#text'] === 'string' ? { '#text': ws['#text'] } : undefined
    const insert = wsClone ? [wsClone, newTarget] : [newTarget]
    kids.splice(sourceIdx + 1, 0, ...insert)
  } else {
    kids.push(newTarget)
  }
  return true
}
