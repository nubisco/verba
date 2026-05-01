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
