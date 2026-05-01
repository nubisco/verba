import { z } from 'zod'

export const CreateLocaleSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  isEnabled: z.boolean().optional(),
})

export const UpdateLocaleSchema = CreateLocaleSchema.partial()

export type CreateLocaleInput = z.infer<typeof CreateLocaleSchema>
export type UpdateLocaleInput = z.infer<typeof UpdateLocaleSchema>
