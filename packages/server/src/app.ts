import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { hashPassword, comparePassword } from './auth.utils.js';
import { prismaService } from './prisma.service.js';
import { aclService } from './acl.service.js';
import { importCSV, importXLSX, exportApprovedJSON } from './import-export.service.js';
import { Role, WorkflowState } from './types.js';

const fastify = Fastify({ logger: true });

// Register plugins
await fastify.register(cors);

// Ensure JWT secret is set in production
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'your-secret-key-change-in-production') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }
  console.warn('WARNING: Using default JWT secret. Set JWT_SECRET environment variable in production.');
}

await fastify.register(jwt, {
  secret: jwtSecret || 'your-secret-key-change-in-production',
});
await fastify.register(multipart);

// Auth middleware
const authenticate = async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
};

// Routes

// Auth routes
fastify.post('/api/auth/register', async (request, reply) => {
  const { email, name, password } = request.body as any;
  const hashedPassword = await hashPassword(password);

  try {
    const user = await prismaService.createUser({
      email,
      name,
      password: hashedPassword,
    });

    const token = fastify.jwt.sign({ userId: user.id, email: user.email });
    reply.send({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error: any) {
    reply.code(400).send({ error: error.message });
  }
});

fastify.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body as any;

  const user = await prismaService.findUserByEmail(email);
  if (!user || !(await comparePassword(password, user.password))) {
    return reply.code(401).send({ error: 'Invalid credentials' });
  }

  const token = fastify.jwt.sign({ userId: user.id, email: user.email });
  reply.send({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// Project routes
fastify.get('/api/projects', { onRequest: [authenticate] }, async (request) => {
  const projects = await prismaService.listProjects();
  return { projects };
});

fastify.post('/api/projects', { onRequest: [authenticate] }, async (request, reply) => {
  const { name, description } = request.body as any;
  const userId = (request.user as any).userId;

  const project = await prismaService.createProject({ name, description });
  await prismaService.addProjectMember(project.id, userId, Role.ADMIN);

  reply.code(201).send({ project });
});

fastify.get('/api/projects/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { id } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, id, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const project = await prismaService.findProjectById(id);
  return { project };
});

fastify.post('/api/projects/:id/members', { onRequest: [authenticate] }, async (request, reply) => {
  const { id } = request.params as any;
  const { userId: targetUserId, role } = request.body as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, id, Role.ADMIN);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const member = await prismaService.addProjectMember(id, targetUserId, role);
  reply.code(201).send({ member });
});

// Namespace routes
fastify.get('/api/projects/:projectId/namespaces', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const namespaces = await prismaService.listNamespaces(projectId);
  return { namespaces };
});

fastify.post('/api/projects/:projectId/namespaces', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const { name, description } = request.body as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.MAINTAINER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const namespace = await prismaService.createNamespace({ projectId, name, description });

  await prismaService.createAuditLog({
    projectId,
    userId,
    action: 'NAMESPACE_CREATED',
    entity: 'Namespace',
    entityId: namespace.id,
  });

  reply.code(201).send({ namespace });
});

fastify.get('/api/namespaces/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { id } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasNamespaceRole(userId, id, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const namespace = await prismaService.findNamespaceById(id);
  return { namespace };
});

fastify.post('/api/namespaces/:id/access', { onRequest: [authenticate] }, async (request, reply) => {
  const { id } = request.params as any;
  const { userId: targetUserId, role } = request.body as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasNamespaceRole(userId, id, Role.ADMIN);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const access = await prismaService.addNamespaceAccess(id, targetUserId, role);
  reply.code(201).send({ access });
});

// Locale routes
fastify.get('/api/projects/:projectId/locales', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const locales = await prismaService.listLocales(projectId);
  return { locales };
});

fastify.post('/api/projects/:projectId/locales', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const { code, name } = request.body as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.MAINTAINER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const locale = await prismaService.createLocale({ projectId, code, name });
  reply.code(201).send({ locale });
});

// Key routes
fastify.get('/api/namespaces/:namespaceId/keys', { onRequest: [authenticate] }, async (request, reply) => {
  const { namespaceId } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasNamespaceRole(userId, namespaceId, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const keys = await prismaService.listKeys(namespaceId);
  return { keys };
});

fastify.post('/api/namespaces/:namespaceId/keys', { onRequest: [authenticate] }, async (request, reply) => {
  const { namespaceId } = request.params as any;
  const { key, description } = request.body as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasNamespaceRole(userId, namespaceId, Role.MAINTAINER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const keyRecord = await prismaService.createKey({ namespaceId, key, description });
  reply.code(201).send({ key: keyRecord });
});

fastify.get('/api/keys/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { id } = request.params as any;
  const userId = (request.user as any).userId;

  const keyRecord = await prismaService.findKeyById(id);
  if (!keyRecord) {
    return reply.code(404).send({ error: 'Key not found' });
  }

  const hasAccess = await aclService.hasNamespaceRole(userId, keyRecord.namespaceId, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  return { key: keyRecord };
});

// Translation routes
fastify.post('/api/keys/:keyId/translations', { onRequest: [authenticate] }, async (request, reply) => {
  const { keyId } = request.params as any;
  const { localeId, value } = request.body as any;
  const userId = (request.user as any).userId;

  const keyRecord = await prismaService.findKeyById(keyId);
  if (!keyRecord) {
    return reply.code(404).send({ error: 'Key not found' });
  }

  const hasAccess = await aclService.hasNamespaceRole(userId, keyRecord.namespaceId, Role.TRANSLATOR);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const translation = await prismaService.createTranslation({
    keyId,
    localeId,
    value,
    translatorId: userId,
  });

  const namespace = await prismaService.findNamespaceById(keyRecord.namespaceId);
  await prismaService.createAuditLog({
    projectId: namespace!.projectId,
    userId,
    action: 'TRANSLATION_CREATED',
    entity: 'Translation',
    entityId: translation.id,
  });

  reply.code(201).send({ translation });
});

fastify.patch('/api/translations/:id', { onRequest: [authenticate] }, async (request, reply) => {
  const { id } = request.params as any;
  const { value, state } = request.body as any;
  const userId = (request.user as any).userId;

  const translation = await prismaService.findTranslationById(id);
  if (!translation) {
    return reply.code(404).send({ error: 'Translation not found' });
  }

  const hasAccess = await aclService.hasNamespaceRole(
    userId,
    translation.key.namespaceId,
    Role.TRANSLATOR
  );
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  // Check state transition
  if (state && state !== translation.state) {
    const canTransition = await aclService.canTransitionState(
      userId,
      translation.key.namespaceId,
      translation.state,
      state
    );
    if (!canTransition) {
      return reply.code(403).send({ error: 'Invalid state transition' });
    }
  }

  const updated = await prismaService.updateTranslation(id, { value, state });

  await prismaService.createAuditLog({
    projectId: translation.key.namespace.projectId,
    userId,
    action: state ? 'STATE_CHANGED' : 'TRANSLATION_UPDATED',
    entity: 'Translation',
    entityId: id,
    details: JSON.stringify({ oldState: translation.state, newState: state }),
  });

  return { translation: updated };
});

// Comment routes
fastify.get('/api/translations/:translationId/comments', { onRequest: [authenticate] }, async (request, reply) => {
  const { translationId } = request.params as any;
  const userId = (request.user as any).userId;

  const translation = await prismaService.findTranslationById(translationId);
  if (!translation) {
    return reply.code(404).send({ error: 'Translation not found' });
  }

  const hasAccess = await aclService.hasNamespaceRole(
    userId,
    translation.key.namespaceId,
    Role.READER
  );
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const comments = await prismaService.listComments(translationId);
  return { comments };
});

fastify.post('/api/translations/:translationId/comments', { onRequest: [authenticate] }, async (request, reply) => {
  const { translationId } = request.params as any;
  const { content } = request.body as any;
  const userId = (request.user as any).userId;

  const translation = await prismaService.findTranslationById(translationId);
  if (!translation) {
    return reply.code(404).send({ error: 'Translation not found' });
  }

  const hasAccess = await aclService.hasNamespaceRole(
    userId,
    translation.key.namespaceId,
    Role.READER
  );
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const comment = await prismaService.createComment({ translationId, userId, content });
  reply.code(201).send({ comment });
});

// Import/Export routes
fastify.post('/api/projects/:projectId/import', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.MAINTAINER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const data = await request.file();
  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded' });
  }

  const buffer = await data.toBuffer();
  let imported = 0;

  if (data.mimetype === 'text/csv') {
    const content = buffer.toString('utf-8');
    imported = await importCSV(content, projectId);
  } else if (
    data.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    imported = await importXLSX(buffer, projectId);
  } else {
    return reply.code(400).send({ error: 'Unsupported file type' });
  }

  await prismaService.createAuditLog({
    projectId,
    userId,
    action: 'IMPORT',
    entity: 'Project',
    entityId: projectId,
    details: JSON.stringify({ imported }),
  });

  return { imported };
});

fastify.get('/api/projects/:projectId/export', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.READER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const data = await exportApprovedJSON(projectId);
  reply.header('Content-Type', 'application/json');
  return data;
});

// Audit log routes
fastify.get('/api/projects/:projectId/audit', { onRequest: [authenticate] }, async (request, reply) => {
  const { projectId } = request.params as any;
  const userId = (request.user as any).userId;

  const hasAccess = await aclService.hasProjectRole(userId, projectId, Role.MAINTAINER);
  if (!hasAccess) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  const logs = await prismaService.listAuditLogs(projectId);
  return { logs };
});

export default fastify;
