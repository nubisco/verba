import { z } from 'zod'

export const CreateNamespaceSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
})

export const UpdateNamespaceSchema = CreateNamespaceSchema.partial()

export type CreateNamespaceInput = z.infer<typeof CreateNamespaceSchema>
export type UpdateNamespaceInput = z.infer<typeof UpdateNamespaceSchema>
