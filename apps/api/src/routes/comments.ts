import type { FastifyInstance } from 'fastify'
import { CreateCommentSchema } from '../schemas/comment.schema.js'
import * as commentSvc from '../services/comment.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export async function commentRoutes(app: FastifyInstance) {
  app.post<{ Params: { projectId: string; translationId: string } }>(
    '/projects/:projectId/translations/:translationId/comments',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const body = CreateCommentSchema.parse(req.body)
      const comment = await commentSvc.addComment(
        req.params.translationId,
        req.user.userId,
        body.text,
        req.params.projectId,
        body.parentId,
      )
      return reply.status(201).send(comment)
    },
  )

  app.get<{ Params: { projectId: string; translationId: string } }>(
    '/projects/:projectId/translations/:translationId/comments',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return commentSvc.listComments(req.params.translationId)
    },
  )

  app.delete<{
    Params: { projectId: string; translationId: string; commentId: string }
  }>(
    '/projects/:projectId/translations/:translationId/comments/:commentId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      await commentSvc.deleteComment(req.params.commentId, req.user.userId, membership.role)
      return reply.status(204).send()
    },
  )
}
