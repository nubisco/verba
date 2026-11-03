import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { CreateCommentSchema } from '../schemas/comment.schema.js'
import * as commentSvc from '../services/comment.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export function commentRoutes(app: Api) {
  app.post('/projects/:projectId/translations/:translationId/comments', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const body = CreateCommentSchema.parse(await readBody(c))
    const comment = await commentSvc.addComment(
      c.req.param('translationId'),
      c.var.user.userId,
      body.text,
      c.req.param('projectId'),
      body.parentId,
    )
    return c.json(comment, 201)
  })

  app.get('/projects/:projectId/translations/:translationId/comments', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await commentSvc.listComments(c.req.param('projectId'), c.req.param('translationId')))
  })

  app.delete('/projects/:projectId/translations/:translationId/comments/:commentId', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    await commentSvc.deleteComment(
      c.req.param('projectId'),
      c.req.param('translationId'),
      c.req.param('commentId'),
      c.var.user.userId,
      membership.role,
    )
    return c.body(null, 204)
  })
}
