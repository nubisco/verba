// Mapping between XLIFF 1.2 target `state` values and Verba workflow status.
//
// The mapping is intentionally round-trip stable: on export we keep the
// original state string verbatim whenever the status has not moved out of its
// bucket (see resolveExportState), so a zero-edit round trip reproduces states
// exactly even though XLIFF has more states than Verba has statuses.

import type { Status } from '../index.js'

/** XLIFF state → Verba status (import direction). */
export function stateToStatus(state: string | undefined): Status {
  switch ((state ?? '').toLowerCase()) {
    case 'translated':
    case 'needs-review-translation':
    case 'needs-review-adaptation':
    case 'needs-review-l10n':
      return 'SUBMITTED'
    case 'signed-off':
    case 'final':
      return 'APPROVED'
    // "new", "needs-translation", "needs-adaptation", "needs-l10n", unknown
    default:
      return 'TODO'
  }
}

/** Canonical XLIFF state for a Verba status (export direction, Xcode-friendly). */
export function canonicalStateFor(status: Status): string {
  switch (status) {
    case 'APPROVED':
    case 'SUBMITTED':
      return 'translated'
    case 'IN_PROGRESS':
      return 'needs-translation'
    case 'TODO':
    default:
      return 'new'
  }
}

/**
 * Resolve the state to write on export. Preserves the original state string
 * verbatim when the current status still maps to it (byte-stable round trip);
 * otherwise falls back to the canonical state for the new status.
 */
export function resolveExportState(status: Status, originalState?: string): string {
  if (originalState && stateToStatus(originalState) === status) return originalState
  return canonicalStateFor(status)
}
