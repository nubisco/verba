import { XMLParser } from 'fast-xml-parser'
import type { XliffDocument, XliffFile, XliffUnit, XliffVersion } from './model.js'
import { decodeXmlText } from './text.js'

// Ordered-mode node: exactly one element-name key, plus optional ":@" (attrs).
// Text nodes carry "#text"; comments carry "#comment".
type OrderedNode = Record<string, unknown>

const PARSE_OPTS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: false, // keep entities opaque so untouched nodes round-trip
  ignoreDeclaration: true,
  commentPropName: '#comment',
} as const

const RESERVED = new Set([':@', '#text', '#comment'])

function tagName(node: OrderedNode): string | undefined {
  for (const k of Object.keys(node)) if (!RESERVED.has(k)) return k
  return undefined
}

function attrs(node: OrderedNode): Record<string, string> {
  return (node[':@'] as Record<string, string> | undefined) ?? {}
}

function children(node: OrderedNode, name: string): OrderedNode[] {
  return (node[name] as OrderedNode[] | undefined) ?? []
}

/** Concatenate the decoded text content of an element's descendants. */
function textOf(node: OrderedNode, name: string): string {
  let acc = ''
  const walk = (nodes: OrderedNode[]) => {
    for (const c of nodes) {
      if (typeof c['#text'] === 'string') acc += c['#text'] as string
      else {
        const t = tagName(c)
        if (t) walk(children(c, t))
      }
    }
  }
  walk(children(node, name))
  return decodeXmlText(acc)
}

/** True if the element has a direct child of the given name. */
function hasChild(node: OrderedNode, name: string, childName: string): boolean {
  return children(node, name).some((c) => tagName(c) === childName)
}

class UnsupportedXliffError extends Error {
  statusCode = 422
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedXliffError'
  }
}

/**
 * Parse an XLIFF document into Verba's projection. Only XLIFF 1.2 is supported
 * for now; 2.0 is detected and rejected with a clear error.
 */
export function parseXliff(xml: string): XliffDocument {
  const ast = new XMLParser(PARSE_OPTS).parse(xml) as OrderedNode[]
  const root = ast.find((n) => tagName(n) === 'xliff')
  if (!root) throw new UnsupportedXliffError('Not an XLIFF document: missing <xliff> root')

  const version = (attrs(root)['@_version'] ?? '1.2') as XliffVersion
  if (version.startsWith('2')) {
    throw new UnsupportedXliffError('XLIFF 2.0 is not supported yet (only 1.2)')
  }

  const files: XliffFile[] = []
  for (const fileNode of children(root, 'xliff')) {
    if (tagName(fileNode) !== 'file') continue
    const fa = attrs(fileNode)
    const units: XliffUnit[] = []
    collectUnits(children(fileNode, 'file'), [], units)
    files.push({
      original: fa['@_original'] ?? '',
      sourceLanguage: fa['@_source-language'] ?? '',
      targetLanguage: fa['@_target-language'],
      datatype: fa['@_datatype'],
      units,
    })
  }

  return { version: '1.2', files }
}

/** Recursively collect trans-units, descending into <group> and <body>. */
function collectUnits(nodes: OrderedNode[], groupPath: string[], out: XliffUnit[]): void {
  for (const node of nodes) {
    const name = tagName(node)
    if (!name) continue
    if (name === 'trans-unit') {
      out.push(projectUnit(node, groupPath))
    } else if (name === 'group') {
      const gid = attrs(node)['@_id']
      collectUnits(children(node, 'group'), gid ? [...groupPath, gid] : groupPath, out)
    } else {
      // e.g. <body>, descend without extending the group path
      collectUnits(children(node, name), groupPath, out)
    }
  }
}

function projectUnit(node: OrderedNode, groupPath: string[]): XliffUnit {
  const a = attrs(node)
  const targetChild = children(node, 'trans-unit').find((c) => tagName(c) === 'target')
  return {
    id: a['@_id'] ?? '',
    resname: a['@_resname'],
    spacePreserve: a['@_xml:space'] === 'preserve',
    source: sourceText(node),
    target: hasChild(node, 'trans-unit', 'target') ? targetText(node) : undefined,
    state: targetChild ? attrs(targetChild)['@_state'] : undefined,
    note: hasChild(node, 'trans-unit', 'note') ? noteText(node) : undefined,
    group: groupPath.length ? groupPath : undefined,
  }
}

// Small named wrappers so projectUnit reads clearly.
function sourceText(unit: OrderedNode): string {
  const el = children(unit, 'trans-unit').find((c) => tagName(c) === 'source')
  return el ? textOf(el, 'source') : ''
}
function targetText(unit: OrderedNode): string {
  const el = children(unit, 'trans-unit').find((c) => tagName(c) === 'target')
  return el ? textOf(el, 'target') : ''
}
function noteText(unit: OrderedNode): string {
  const el = children(unit, 'trans-unit').find((c) => tagName(c) === 'note')
  return el ? textOf(el, 'note') : ''
}
