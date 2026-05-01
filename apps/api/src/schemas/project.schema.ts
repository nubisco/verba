import { z } from 'zod'

export const CreateProjectSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  avatar: z.string().max(10).optional(),
  // CreateProjectSchema keeps max(10): only emoji/initials at creation time
})

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  avatar: z.string().max(307200).optional().nullable(), // emoji/initials or base64 image data URL (max ~300 KB)
  aiProvider: z.enum(['openai', 'anthropic', 'gemini']).nullable().optional(),
  aiApiKey: z.string().optional().nullable(),
  aiModel: z.string().optional().nullable(),
  aiEnabled: z.boolean().optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
