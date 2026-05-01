import { z } from 'zod'
import { Role } from '../types.js'

export const AddMemberSchema = z.object({
  userId: z.string(),
  role: z.enum([Role.ADMIN, Role.MAINTAINER, Role.TRANSLATOR, Role.READER]),
  namespaceIds: z.array(z.string()).optional(),
})

export const UpdateMemberSchema = z.object({
  role: z.enum([Role.ADMIN, Role.MAINTAINER, Role.TRANSLATOR, Role.READER]).optional(),
  namespaceIds: z.array(z.string()).optional(),
})

export const UpdateMemberLocalesSchema = z.object({
  localeIds: z.array(z.string()),
})

export type AddMemberInput = z.infer<typeof AddMemberSchema>
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>
export type UpdateMemberLocalesInput = z.infer<typeof UpdateMemberLocalesSchema>
