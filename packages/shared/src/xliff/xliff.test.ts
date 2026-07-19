import { describe, it, expect } from 'vitest'
import { parseXliff } from './parse.js'
import { serializeXliff } from './serialize.js'
import { unitKey, type XliffOverlay } from './model.js'
import { extractPlaceholders, validatePlaceholders } from './placeholders.js'
import { stateToStatus, canonicalStateFor, resolveExportState } from './state.js'
import { decodeXmlText, escapeXmlText } from './text.js'

// A realistic Xcode-emitted XLIFF 1.2 document (literal UTF-8 smart quotes,
// entities, a plural group, xml:space, notes, and a <header><tool/>).
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="DoodLoop/Localizable.strings" source-language="en" target-language="pt-PT" datatype="plaintext">
    <header><tool tool-id="com.apple.dt.xcode" tool-name="Xcode"/></header>
    <body>
      <trans-unit id="settings.backup.title" xml:space="preserve">
        <source>Backup folder</source>
        <target state="translated">Pasta de backup</target>
        <note>Label for the backup folder picker</note>
      </trans-unit>
      <trans-unit id="import.progress" xml:space="preserve">
        <source>Importing “%@” &amp; more</source>
        <target state="new">Importing “%@” &amp; more</target>
        <note>%@ is the imported project name</note>
      </trans-unit>
      <group id="photos.count">
        <trans-unit id="photos.count.one" xml:space="preserve">
          <source>%lld photo</source>
          <target state="new">%lld photo</target>
        </trans-unit>
        <trans-unit id="photos.count.other" xml:space="preserve">
          <source>%lld photos</source>
          <target state="new">%lld photos</target>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>
`

describe('parseXliff', () => {
  it('projects files and trans-units', () => {
    const doc = parseXliff(SAMPLE)
    expect(doc.version).toBe('1.2')
    expect(doc.files).toHaveLength(1)
    const f = doc.files[0]
    expect(f.original).toBe('DoodLoop/Localizable.strings')
    expect(f.sourceLanguage).toBe('en')
    expect(f.targetLanguage).toBe('pt-PT')
    expect(f.datatype).toBe('plaintext')
    expect(f.units).toHaveLength(4)
  })

  it('decodes entities and preserves smart quotes in text', () => {
    const u = parseXliff(SAMPLE).files[0].units.find((x) => x.id === 'import.progress')!
    expect(u.source).toBe('Importing “%@” & more')
    expect(u.state).toBe('new')
    expect(u.note).toBe('%@ is the imported project name')
    expect(u.spacePreserve).toBe(true)
  })

  it('exposes plural units without collapsing them, tagged with their group', () => {
    const units = parseXliff(SAMPLE).files[0].units
    const one = units.find((u) => u.id === 'photos.count.one')!
    const other = units.find((u) => u.id === 'photos.count.other')!
    expect(one.group).toEqual(['photos.count'])
    expect(other.group).toEqual(['photos.count'])
    expect(one.source).toBe('%lld photo')
    expect(other.source).toBe('%lld photos')
  })

  it('rejects XLIFF 2.0', () => {
    const x = SAMPLE.replace('version="1.2"', 'version="2.0"')
    expect(() => parseXliff(x)).toThrow(/2\.0 is not supported/)
  })

  it('throws on non-XLIFF input', () => {
    expect(() => parseXliff('<html></html>')).toThrow(/missing <xliff>/)
  })
})

describe('serializeXliff', () => {
  it('is byte-identical on a zero-edit round trip', () => {
    expect(serializeXliff(SAMPLE, new Map())).toBe(SAMPLE)
    // Even with overlays that match the current values, output is unchanged.
    const noop = new Map<string, XliffOverlay>([
      [
        unitKey('DoodLoop/Localizable.strings', 'settings.backup.title'),
        { text: 'Pasta de backup', state: 'translated' },
      ],
    ])
    expect(serializeXliff(SAMPLE, noop)).toBe(SAMPLE)
  })

  it('overlays only the changed target, escaping and preserving everything else', () => {
    const overlays = new Map<string, XliffOverlay>([
      [
        unitKey('DoodLoop/Localizable.strings', 'import.progress'),
        { text: 'Importando “%@” & mais', state: 'translated' },
      ],
    ])
    const out = serializeXliff(SAMPLE, overlays)
    expect(out).toContain('<target state="translated">Importando “%@” &amp; mais</target>')
    // untouched unit stays exactly as-is
    expect(out).toContain('<target state="translated">Pasta de backup</target>')
    // header + entities elsewhere intact
    expect(out).toContain('<tool tool-id="com.apple.dt.xcode" tool-name="Xcode"/>')
    // re-parsing yields the decoded edited target
    const reparsed = parseXliff(out).files[0].units.find((u) => u.id === 'import.progress')!
    expect(reparsed.target).toBe('Importando “%@” & mais')
    expect(reparsed.state).toBe('translated')
  })

  it('creates a <target> when the source has none', () => {
    const noTarget = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="A/B.strings" source-language="en" target-language="de" datatype="plaintext">
    <body>
      <trans-unit id="hello" xml:space="preserve">
        <source>Hello</source>
      </trans-unit>
    </body>
  </file>
</xliff>
`
    const overlays = new Map<string, XliffOverlay>([
      [unitKey('A/B.strings', 'hello'), { text: 'Hallo', state: 'translated' }],
    ])
    const out = serializeXliff(noTarget, overlays)
    const u = parseXliff(out).files[0].units.find((x) => x.id === 'hello')!
    expect(u.target).toBe('Hallo')
    expect(u.state).toBe('translated')
    expect(out).toContain('<source>Hello</source>')
  })

  it('round-trips a fully translated document through parse+serialize by id', () => {
    const doc = parseXliff(SAMPLE)
    const overlays = new Map<string, XliffOverlay>()
    for (const f of doc.files)
      for (const u of f.units)
        if (u.target !== undefined) overlays.set(unitKey(f.original, u.id), { text: u.target, state: u.state ?? 'new' })
    // Rebuilding from the parsed projection reproduces the original bytes.
    expect(serializeXliff(SAMPLE, overlays)).toBe(SAMPLE)
  })
})

describe('placeholders', () => {
  it('extracts printf specifiers including positional and literal %%', () => {
    const p = extractPlaceholders('Sent %1$@ files at %.2f%% to %2$lld users %@')
    expect(p.filter((x) => x.literal)).toHaveLength(1)
    const specs = p.filter((x) => !x.literal).map((x) => x.spec)
    expect(specs).toEqual(['@', 'f', 'lld', '@'])
    expect(p.find((x) => x.raw === '%1$@')!.position).toBe(1)
    expect(p.find((x) => x.raw === '%2$lld')!.position).toBe(2)
  })

  it('accepts a matching translation', () => {
    expect(validatePlaceholders('Hi %@, you have %lld', 'Olá %@, tens %lld').ok).toBe(true)
  })

  it('flags a dropped placeholder', () => {
    const r = validatePlaceholders('Hi %@ you have %lld new', 'Olá %@')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/sequence mismatch/i)
  })

  it('flags an added/incompatible placeholder', () => {
    expect(validatePlaceholders('Hello %@', 'Olá %@ %d').ok).toBe(false)
  })

  it('allows positional reordering but flags a missing index', () => {
    expect(validatePlaceholders('%1$@ ate %2$lld', '%2$lld comidos por %1$@').ok).toBe(true)
    const r = validatePlaceholders('%1$@ ate %2$lld', 'apenas %1$@')
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/%2\$ missing/)
  })

  it('flags a target positional index absent from source', () => {
    expect(validatePlaceholders('%1$@', '%1$@ %3$@').ok).toBe(false)
  })
})

describe('state mapping', () => {
  it('maps XLIFF states to Verba status', () => {
    expect(stateToStatus('new')).toBe('TODO')
    expect(stateToStatus('needs-translation')).toBe('TODO')
    expect(stateToStatus('translated')).toBe('SUBMITTED')
    expect(stateToStatus('signed-off')).toBe('APPROVED')
    expect(stateToStatus('final')).toBe('APPROVED')
    expect(stateToStatus(undefined)).toBe('TODO')
  })

  it('preserves the original state when the status bucket is unchanged', () => {
    expect(resolveExportState('APPROVED', 'signed-off')).toBe('signed-off')
    expect(resolveExportState('SUBMITTED', 'needs-review-translation')).toBe('needs-review-translation')
    expect(resolveExportState('TODO', 'new')).toBe('new')
  })

  it('uses the canonical state when the status changed bucket', () => {
    expect(resolveExportState('APPROVED', 'new')).toBe('translated')
    expect(resolveExportState('TODO', 'translated')).toBe('new')
    expect(canonicalStateFor('IN_PROGRESS')).toBe('needs-translation')
  })
})

describe('text helpers', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &#8220;q&#8221; &#x2122;')).toBe('a & b <c> “q” ™')
  })
  it('escapes only & < > for text content', () => {
    expect(escapeXmlText('a & b < c > “d” 😀')).toBe('a &amp; b &lt; c &gt; “d” 😀')
  })
})
