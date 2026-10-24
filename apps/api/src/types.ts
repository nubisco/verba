export const Role = {
  ADMIN: 'ADMIN',
  MAINTAINER: 'MAINTAINER',
  TRANSLATOR: 'TRANSLATOR',
  READER: 'READER',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export const Status = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
} as const
export type Status = (typeof Status)[keyof typeof Status]

// A person's role in an account (the tenant above projects). OWNER manages
// everything including other owners, ADMIN adds and removes people and their
// roles below owner, MEMBER works in the account's projects.
export const AccountRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const
export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole]
