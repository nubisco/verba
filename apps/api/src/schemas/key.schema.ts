import { z } from 'zod'

export const CreateKeySchema = z.object({
  name: z.string().min(1),
  namespaceId: z.string().min(1),
  description: z.string().optional(),
})

export const UpdateKeySchema = CreateKeySchema.partial()

export const KeyQuerySchema = z.object({
  namespaceId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  includeTranslations: z.coerce.boolean().optional().default(false),
})

export type CreateKeyInput = z.infer<typeof CreateKeySchema>
export type UpdateKeyInput = z.infer<typeof UpdateKeySchema>
export type KeyQueryInput = z.infer<typeof KeyQuerySchema>
