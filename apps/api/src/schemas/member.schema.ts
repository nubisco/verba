import { z } from 'zod'
import { Role } from '../types.js'

export const AddMemberSchema = z.object({
  userId: z.string(),
  role: z.enum([Role.ADMIN, Role.MAINTAINER, Role.TRANSLATOR, Role.READER]),
  namespaceIds: z.array(z.string()).optional(),
})

/**
 * What the API accepts when an admin adds someone: an exact email address,
 * never a user id. The id is resolved on the server, so adding a member does
 * not need a way to look people up across the instance.
 */
export const AddMemberRequestSchema = z.object({
  email: z.string().email(),
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
