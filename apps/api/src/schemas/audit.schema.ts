import { z } from 'zod'

export const AuditQuerySchema = z.object({
  entityType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type AuditQueryInput = z.infer<typeof AuditQuerySchema>
