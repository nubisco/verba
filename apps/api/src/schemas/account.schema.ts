import { z } from 'zod'

const slug = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9-]+$/)

const role = z.enum(['OWNER', 'ADMIN', 'MEMBER'])

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: slug.optional(),
})

export const UpdateAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
})

export const AddAccountMemberSchema = z.object({
  email: z.string().email(),
  role: role.default('MEMBER'),
})

export const UpdateAccountMemberSchema = z.object({
  role,
})

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>
export type AddAccountMemberInput = z.infer<typeof AddAccountMemberSchema>
