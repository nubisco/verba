import { z } from 'zod'

export const ImportMappingSchema = z.object({
  keyColumn: z.string().default('key'),
  namespaceColumn: z.string().optional(),
  localeColumns: z.record(z.string(), z.string()).default({}),
})
export type ImportMapping = z.infer<typeof ImportMappingSchema>
