import { z } from 'zod'

export const CreateCommentSchema = z.object({
  text: z.string().min(1).max(2000),
  parentId: z.string().optional(),
})

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>
