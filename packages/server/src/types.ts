// Role constants
export const Role = {
  ADMIN: 'ADMIN',
  MAINTAINER: 'MAINTAINER',
  TRANSLATOR: 'TRANSLATOR',
  READER: 'READER',
} as const;

export type Role = typeof Role[keyof typeof Role];

// WorkflowState constants
export const WorkflowState = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
} as const;

export type WorkflowState = typeof WorkflowState[keyof typeof WorkflowState];
