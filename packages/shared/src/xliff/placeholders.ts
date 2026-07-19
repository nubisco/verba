// printf-style placeholder extraction and validation.
//
// Apple format strings use C printf placeholders: %@ %d %lld %f %.2f, literal
// %%, and positional forms %1$@ %2$lld. A translation must never drop, add,
// reorder (non-positionally), or corrupt a placeholder relative to the source.

export interface Placeholder {
  /** the full matched token, e.g. "%1$@" or "%.2f" */
  raw: string
  /** 1-based positional index, or null for non-positional */
  position: number | null
  /**
   * conversion incl. length modifier, lowercased, e.g. "@", "lld", "f".
   * Flags/width/precision are stripped so "%.2f" and "%08.2f" compare equal.
   */
  spec: string
  /** true for literal "%%" */
  literal: boolean
}

// %[position$][flags][width][.precision][length]conversion
// Groups: 1 = positional index, 2 = length modifier, 3 = conversion char.
const PLACEHOLDER_RE = /%(?:(\d+)\$)?[-+ 0#]*\d*(?:\.\d+)?(hh|h|ll|l|q|L|z|j|t)?([@diouxXeEfFgGaAcspn%])/g

export function extractPlaceholders(s: string): Placeholder[] {
  const out: Placeholder[] = []
  for (const m of s.matchAll(PLACEHOLDER_RE)) {
    const length = m[2] ?? ''
    const conversion = m[3]
    out.push({
      raw: m[0],
      position: m[1] ? parseInt(m[1], 10) : null,
      spec: `${length}${conversion}`.toLowerCase(),
      literal: conversion === '%',
    })
  }
  return out
}

export interface PlaceholderValidation {
  ok: boolean
  errors: string[]
}

/**
 * Validate that `target` placeholders are compatible with `source`:
 *  - non-positional specifiers must match as an ordered sequence
 *    (dropping, adding, or reordering is an error, since printf args are ordered);
 *  - each positional index present in source must appear exactly once in target,
 *    and target must introduce no index absent from source.
 * Literal %% is ignored.
 */
export function validatePlaceholders(source: string, target: string): PlaceholderValidation {
  const errors: string[] = []

  const srcAll = extractPlaceholders(source).filter((p) => !p.literal)
  const tgtAll = extractPlaceholders(target).filter((p) => !p.literal)

  const srcPos = srcAll.filter((p) => p.position !== null)
  const tgtPos = tgtAll.filter((p) => p.position !== null)
  const srcSeq = srcAll.filter((p) => p.position === null).map((p) => p.spec)
  const tgtSeq = tgtAll.filter((p) => p.position === null).map((p) => p.spec)

  // Non-positional: ordered sequence must match.
  if (srcSeq.length !== tgtSeq.length || srcSeq.some((s, i) => s !== tgtSeq[i])) {
    errors.push(
      `Placeholder sequence mismatch: source has [${srcSeq.join(', ')}] but target has [${tgtSeq.join(', ')}]`,
    )
  }

  // Positional: each source index appears exactly once in target.
  const srcIndices = new Set(srcPos.map((p) => p.position as number))
  const tgtCounts = new Map<number, number>()
  for (const p of tgtPos) tgtCounts.set(p.position!, (tgtCounts.get(p.position!) ?? 0) + 1)

  for (const idx of srcIndices) {
    const count = tgtCounts.get(idx) ?? 0
    if (count === 0) errors.push(`Positional placeholder %${idx}$ missing from target`)
    else if (count > 1) errors.push(`Positional placeholder %${idx}$ appears ${count} times in target`)
  }
  for (const idx of tgtCounts.keys()) {
    if (!srcIndices.has(idx)) errors.push(`Positional placeholder %${idx}$ in target is not present in source`)
  }

  return { ok: errors.length === 0, errors }
}
