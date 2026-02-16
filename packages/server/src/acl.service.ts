import { Role } from '@prisma/client';
import { prismaService } from './prisma.service.js';

export class ACLService {
  // Check if user has required project role
  async hasProjectRole(userId: string, projectId: string, requiredRole: Role): Promise<boolean> {
    const userRole = await prismaService.getUserProjectRole(userId, projectId);
    if (!userRole) return false;
    return this.roleHierarchy(userRole) >= this.roleHierarchy(requiredRole);
  }

  // Check if user has required namespace role
  async hasNamespaceRole(
    userId: string,
    namespaceId: string,
    requiredRole: Role
  ): Promise<boolean> {
    // First check namespace-specific access
    const namespaceRole = await prismaService.getUserNamespaceRole(userId, namespaceId);
    if (namespaceRole && this.roleHierarchy(namespaceRole) >= this.roleHierarchy(requiredRole)) {
      return true;
    }

    // Fall back to project-level access
    const namespace = await prismaService.findNamespaceById(namespaceId);
    if (!namespace) return false;

    return this.hasProjectRole(userId, namespace.projectId, requiredRole);
  }

  // Check if user can transition workflow state
  async canTransitionState(
    userId: string,
    namespaceId: string,
    currentState: string,
    newState: string
  ): Promise<boolean> {
    const transitions: Record<string, { to: string; requiredRole: Role }[]> = {
      TODO: [
        { to: 'IN_PROGRESS', requiredRole: Role.TRANSLATOR },
      ],
      IN_PROGRESS: [
        { to: 'TODO', requiredRole: Role.TRANSLATOR },
        { to: 'SUBMITTED', requiredRole: Role.TRANSLATOR },
      ],
      SUBMITTED: [
        { to: 'IN_PROGRESS', requiredRole: Role.MAINTAINER },
        { to: 'APPROVED', requiredRole: Role.MAINTAINER },
      ],
      APPROVED: [
        { to: 'IN_PROGRESS', requiredRole: Role.MAINTAINER },
      ],
    };

    const allowedTransitions = transitions[currentState] || [];
    const transition = allowedTransitions.find((t) => t.to === newState);

    if (!transition) return false;

    return this.hasNamespaceRole(userId, namespaceId, transition.requiredRole);
  }

  // Role hierarchy: ADMIN > MAINTAINER > TRANSLATOR > READER
  private roleHierarchy(role: Role): number {
    const hierarchy: Record<Role, number> = {
      [Role.ADMIN]: 4,
      [Role.MAINTAINER]: 3,
      [Role.TRANSLATOR]: 2,
      [Role.READER]: 1,
    };
    return hierarchy[role] || 0;
  }
}

export const aclService = new ACLService();
