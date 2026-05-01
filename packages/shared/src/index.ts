// @nubisco/verba-shared
// Shared types and constants for the Verba open-core monorepo.
// This package is AGPL-3.0. It may be imported by both CE and EE code.
// It must never import from @nubisco/verba-ee.

// ─── Role ────────────────────────────────────────────────────────────────────

export const Role = {
  ADMIN: 'ADMIN',
  MAINTAINER: 'MAINTAINER',
  TRANSLATOR: 'TRANSLATOR',
  READER: 'READER',
} as const

export type Role = (typeof Role)[keyof typeof Role]

// Numeric weight used for role hierarchy comparisons (higher = more privileged)
export const RoleWeight: Record<Role, number> = {
  ADMIN: 4,
  MAINTAINER: 3,
  TRANSLATOR: 2,
  READER: 1,
}

// ─── Translation status ───────────────────────────────────────────────────────

export const Status = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
} as const

export type Status = (typeof Status)[keyof typeof Status]

// ─── Membership status ────────────────────────────────────────────────────────

export const MembershipStatus = {
  ACTIVE: 'ACTIVE',
  INVITED: 'INVITED',
  SUSPENDED: 'SUSPENDED',
} as const

export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus]
