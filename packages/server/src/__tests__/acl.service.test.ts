import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ACLService } from '../acl.service';
import { Role } from '../types';
import { prismaService } from '../prisma.service';

vi.mock('../prisma.service');

describe('ACLService', () => {
  let aclService: ACLService;

  beforeEach(() => {
    aclService = new ACLService();
    vi.clearAllMocks();
  });

  describe('hasProjectRole', () => {
    it('should return true when user has exact required role', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.MAINTAINER);

      const result = await aclService.hasProjectRole('user1', 'project1', Role.MAINTAINER);
      expect(result).toBe(true);
    });

    it('should return true when user has higher role than required', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.ADMIN);

      const result = await aclService.hasProjectRole('user1', 'project1', Role.TRANSLATOR);
      expect(result).toBe(true);
    });

    it('should return false when user has lower role than required', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.READER);

      const result = await aclService.hasProjectRole('user1', 'project1', Role.MAINTAINER);
      expect(result).toBe(false);
    });

    it('should return false when user has no role', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(null);

      const result = await aclService.hasProjectRole('user1', 'project1', Role.READER);
      expect(result).toBe(false);
    });
  });

  describe('hasNamespaceRole', () => {
    it('should return true when user has namespace-specific role', async () => {
      vi.spyOn(prismaService, 'getUserNamespaceRole').mockResolvedValue(Role.TRANSLATOR);

      const result = await aclService.hasNamespaceRole('user1', 'namespace1', Role.TRANSLATOR);
      expect(result).toBe(true);
    });

    it('should fallback to project role when no namespace role', async () => {
      vi.spyOn(prismaService, 'getUserNamespaceRole').mockResolvedValue(null);
      vi.spyOn(prismaService, 'findNamespaceById').mockResolvedValue({
        id: 'namespace1',
        projectId: 'project1',
        name: 'Test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.ADMIN);

      const result = await aclService.hasNamespaceRole('user1', 'namespace1', Role.MAINTAINER);
      expect(result).toBe(true);
    });
  });

  describe('canTransitionState', () => {
    beforeEach(() => {
      vi.spyOn(prismaService, 'getUserNamespaceRole').mockResolvedValue(null);
      vi.spyOn(prismaService, 'findNamespaceById').mockResolvedValue({
        id: 'namespace1',
        projectId: 'project1',
        name: 'Test',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
    });

    it('should allow TRANSLATOR to transition TODO to IN_PROGRESS', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.TRANSLATOR);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'TODO',
        'IN_PROGRESS'
      );
      expect(result).toBe(true);
    });

    it('should allow TRANSLATOR to transition IN_PROGRESS to SUBMITTED', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.TRANSLATOR);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'IN_PROGRESS',
        'SUBMITTED'
      );
      expect(result).toBe(true);
    });

    it('should not allow TRANSLATOR to transition SUBMITTED to APPROVED', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.TRANSLATOR);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'SUBMITTED',
        'APPROVED'
      );
      expect(result).toBe(false);
    });

    it('should allow MAINTAINER to transition SUBMITTED to APPROVED', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.MAINTAINER);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'SUBMITTED',
        'APPROVED'
      );
      expect(result).toBe(true);
    });

    it('should allow MAINTAINER to transition APPROVED to IN_PROGRESS', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.MAINTAINER);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'APPROVED',
        'IN_PROGRESS'
      );
      expect(result).toBe(true);
    });

    it('should not allow invalid transitions', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.ADMIN);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'TODO',
        'APPROVED'
      );
      expect(result).toBe(false);
    });

    it('should not allow READER to transition any state', async () => {
      vi.spyOn(prismaService, 'getUserProjectRole').mockResolvedValue(Role.READER);

      const result = await aclService.canTransitionState(
        'user1',
        'namespace1',
        'TODO',
        'IN_PROGRESS'
      );
      expect(result).toBe(false);
    });
  });
});
