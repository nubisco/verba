import { PrismaClient } from '@prisma/client';
import { Role, WorkflowState } from './types.js';

const prisma = new PrismaClient();

export class PrismaService {
  // User methods
  async createUser(data: { email: string; name: string; password: string }) {
    return prisma.user.create({ data });
  }

  async findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  // Project methods
  async createProject(data: { name: string; description?: string }) {
    return prisma.project.create({ data });
  }

  async findProjectById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
        namespaces: true,
        locales: true,
      },
    });
  }

  async listProjects() {
    return prisma.project.findMany({
      include: {
        members: { include: { user: true } },
        _count: { select: { namespaces: true, locales: true } },
      },
    });
  }

  async addProjectMember(projectId: string, userId: string, role: Role) {
    return prisma.projectMember.create({
      data: { projectId, userId, role },
    });
  }

  async getUserProjectRole(userId: string, projectId: string) {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return member?.role as Role | null;
  }

  // Namespace methods
  async createNamespace(data: { projectId: string; name: string; description?: string }) {
    return prisma.namespace.create({ data });
  }

  async findNamespaceById(id: string) {
    return prisma.namespace.findUnique({
      where: { id },
      include: { access: { include: { user: true } }, keys: true },
    });
  }

  async listNamespaces(projectId: string) {
    return prisma.namespace.findMany({
      where: { projectId },
      include: { _count: { select: { keys: true } } },
    });
  }

  async addNamespaceAccess(namespaceId: string, userId: string, role: Role) {
    return prisma.namespaceAccess.create({
      data: { namespaceId, userId, role },
    });
  }

  async getUserNamespaceRole(userId: string, namespaceId: string) {
    const access = await prisma.namespaceAccess.findUnique({
      where: { namespaceId_userId: { namespaceId, userId } },
    });
    return access?.role as Role | null;
  }

  // Locale methods
  async createLocale(data: { projectId: string; code: string; name: string }) {
    return prisma.locale.create({ data });
  }

  async listLocales(projectId: string) {
    return prisma.locale.findMany({ where: { projectId } });
  }

  // Key methods
  async createKey(data: { namespaceId: string; key: string; description?: string }) {
    return prisma.key.create({ data });
  }

  async findKeyById(id: string) {
    return prisma.key.findUnique({
      where: { id },
      include: { translations: { include: { locale: true } } },
    });
  }

  async listKeys(namespaceId: string) {
    return prisma.key.findMany({
      where: { namespaceId },
      include: { translations: { include: { locale: true } } },
    });
  }

  // Translation methods
  async createTranslation(data: {
    keyId: string;
    localeId: string;
    value: string;
    translatorId?: string;
  }) {
    return prisma.translation.create({ data });
  }

  async updateTranslation(id: string, data: { value?: string; state?: WorkflowState }) {
    return prisma.translation.update({ where: { id }, data });
  }

  async findTranslationById(id: string) {
    return prisma.translation.findUnique({
      where: { id },
      include: { key: { include: { namespace: true } }, locale: true, comments: true },
    });
  }

  async listTranslations(keyId: string) {
    return prisma.translation.findMany({
      where: { keyId },
      include: { locale: true },
    });
  }

  async listApprovedTranslations(projectId: string) {
    return prisma.translation.findMany({
      where: {
        state: WorkflowState.APPROVED,
        key: { namespace: { projectId } },
      },
      include: { key: { include: { namespace: true } }, locale: true },
    });
  }

  // Comment methods
  async createComment(data: { translationId: string; userId: string; content: string }) {
    return prisma.comment.create({ data });
  }

  async listComments(translationId: string) {
    return prisma.comment.findMany({
      where: { translationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Audit log methods
  async createAuditLog(data: {
    projectId: string;
    userId: string;
    action: string;
    entity: string;
    entityId: string;
    details?: string;
  }) {
    return prisma.auditLog.create({ data });
  }

  async listAuditLogs(projectId: string, limit = 100) {
    return prisma.auditLog.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const prismaService = new PrismaService();
