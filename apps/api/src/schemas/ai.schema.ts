import { z } from 'zod'
import { PROVIDERS } from '../services/ai.service.js'

export const SuggestBodySchema = z.object({
  keyId: z.string().min(1),
  localeCode: z.string().min(1),
})

export const FillLocaleBodySchema = z.object({
  localeCode: z.string().min(1),
  namespaceId: z.string().optional(),
  onlyEmpty: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(500).optional().default(200),
})

/** Every field is optional: an omitted one keeps what is stored. A null apiKey removes the key. */
export const SaveAiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.enum(PROVIDERS).optional(),
  model: z.string().max(200).nullable().optional(),
  apiKey: z.string().max(500).nullable().optional(),
})

export const PreviewBodySchema = z.object({
  source: z.string().trim().min(1).max(2000),
  localeCode: z.string().min(1),
})
