import type { FastifyInstance } from 'fastify'
import { CreateProjectSchema, UpdateProjectSchema } from '../schemas/project.schema.js'
import * as svc from '../services/project.service.js'
import * as membershipService from '../services/membership.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export async function projectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [app.authenticate] }, async (req) => {
    return svc.listProjects(req.user.userId)
  })

  app.post('/projects', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = CreateProjectSchema.parse(req.body)
    const project = await svc.createProject(body)
    await membershipService.addMember(project.id, {
      userId: req.user.userId,
      role: Role.ADMIN,
    })
    return reply.status(201).send(project)
  })

  app.get<{ Params: { id: string } }>('/projects/:id', { preHandler: [app.authenticate] }, async (req) => {
    await requireProjectRole(req.user.userId, req.params.id, Role.READER)
    return svc.getProject(req.params.id)
  })

  app.patch<{ Params: { id: string } }>('/projects/:id', { preHandler: [app.authenticate] }, async (req) => {
    await requireProjectRole(req.user.userId, req.params.id, Role.MAINTAINER)
    const body = UpdateProjectSchema.parse(req.body)
    return svc.updateProject(req.params.id, body)
  })

  app.delete<{ Params: { id: string } }>('/projects/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    await requireProjectRole(req.user.userId, req.params.id, Role.ADMIN)
    await svc.deleteProject(req.params.id)
    return reply.status(204).send()
  })
}
