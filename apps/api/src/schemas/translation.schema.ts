import { z } from 'zod'

export const TRANSLATION_STATUSES = ['TODO', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED'] as const

/**
 * What a client may send when it saves a translation: the text, and where it
 * came from for analytics. Never a status (that moves only through the
 * workflow route, which checks the role for each transition) and never who
 * wrote it (that is the signed-in user). Strict, so a client that tries is
 * told so rather than silently ignored.
 */
export const UpsertTranslationSchema = z
  .object({
    text: z.string(),
    source: z.string().max(40).optional(),
  })
  .strict()

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

/**
 * What server-side callers may pass to upsertTranslation. Imports set a
 * status from the file (XLIFF state), behind the MAINTAINER role the import
 * routes require. No route hands client input through this type.
 */
export type UpsertTranslationInput = {
  text: string
  status?: (typeof TRANSLATION_STATUSES)[number]
}
export type UpdateTranslationStatusInput = z.infer<typeof UpdateTranslationStatusSchema>
export type TranslationQueryInput = z.infer<typeof TranslationQuerySchema>
