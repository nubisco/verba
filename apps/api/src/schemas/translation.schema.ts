import { z } from 'zod'

export const TRANSLATION_STATUSES = ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED'] as const

export const UpsertTranslationSchema = z.object({
  text: z.string(),
  status: z.enum(TRANSLATION_STATUSES).optional(),
  updatedById: z.string().optional(),
})

export const UpdateTranslationStatusSchema = z.object({
  status: z.enum(TRANSLATION_STATUSES),
})

export const TranslationQuerySchema = z.object({
  status: z.enum(TRANSLATION_STATUSES).optional(),
  namespaceId: z.string().optional(),
  localeId: z.string().optional(),
  keyId: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export type UpsertTranslationInput = z.infer<typeof UpsertTranslationSchema>
export type UpdateTranslationStatusInput = z.infer<typeof UpdateTranslationStatusSchema>
export type TranslationQueryInput = z.infer<typeof TranslationQuerySchema>
