/**
 * Spawn Processor Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { SpawnProcessor } from '../src/orchestrator/spawn-processor.js';
import {
  type WorkOrder,
  type Workspace,
  WorkOrderStatus,
  AgentType,
  GatePlanSource,
} from '../src/types/index.js';
import {
  type SpawnRequest,
  type SpawnLimits,
  IntegrationStrategy,
} from '../src/types/spawn.js';
import { workOrderService } from '../src/control-plane/work-order-service.js';

// Mock workOrderService
vi.mock('../src/control-plane/work-order-service.js', () => ({
  workOrderService: {
    submit: vi.fn(),
  },
}));

describe('SpawnProcessor', () => {
  let processor: SpawnProcessor;
  let testWorkspacePath: string;
  let mockParent: WorkOrder;
  let mockWorkspace: Workspace;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new SpawnProcessor();
    testWorkspacePath = '/tmp/test-workspace';

    mockParent = {
      id: 'parent-wo-123',
      taskPrompt: 'Parent task',
      workspaceSource: { type: 'local', path: testWorkspacePath },
      agentType: AgentType.CLAUDE_CODE,
      maxIterations: 3,
      maxWallClockSeconds: 3600,
      gatePlanSource: GatePlanSource.AUTO,
      policies: {
        networkAllowed: false,
        allowedPaths: [],
        forbiddenPatterns: [],
      },
      createdAt: new Date(),
      status: WorkOrderStatus.RUNNING,
      depth: 0,
      rootId: 'parent-wo-123',
    };

    mockWorkspace = {
      id: 'ws-123',
      rootPath: testWorkspacePath,
      createdAt: new Date(),
    };
  });

  describe('checkForSpawnRequest', () => {
    it('should return null when spawn file does not exist', async () => {
      const result = await processor.checkForSpawnRequest('/nonexistent/path');
      expect(result).toBeNull();
    });

    it('should return null when spawn file has invalid JSON', async () => {
      const spawnFilePath = join(testWorkspacePath, '.agentgate', 'spawn-requests.json');

      // Mock fs.readFile to return invalid JSON
      vi.spyOn(fs, 'readFile').mockResolvedValue('{ invalid json }');

      const result = await processor.checkForSpawnRequest(testWorkspacePath);
      expect(result).toBeNull();

      vi.restoreAllMocks();
    });

    it('should parse and return valid spawn request', async () => {
      const validSpawnRequest: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: [
          {
            taskPrompt: 'Child task 1',
            siblingIndex: 0,
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
        ],
      };

      // Mock fs.readFile to return valid JSON
      vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(validSpawnRequest));

      const result = await processor.checkForSpawnRequest(testWorkspacePath);
      expect(result).not.toBeNull();
      expect(result?.parentWorkOrderId).toBe('parent-wo-123');
      expect(result?.children).toHaveLength(1);

      vi.restoreAllMocks();
    });
  });

  describe('validateSpawnRequest', () => {
    const limits: SpawnLimits = {
      maxDepth: 3,
      maxChildren: 10,
      maxTotalDescendants: 100,
    };

    it('should validate a valid spawn request', () => {
      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: [
          {
            taskPrompt: 'Child task 1',
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
        ],
      };

      const result = processor.validateSpawnRequest(request, mockParent, limits);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject when depth limit is exceeded', () => {
      const deepParent: WorkOrder = {
        ...mockParent,
        depth: 3,
      };

      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: [
          {
            taskPrompt: 'Child task 1',
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
        ],
      };

      const result = processor.validateSpawnRequest(request, deepParent, limits);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Depth limit exceeded'))).toBe(true);
    });

    it('should reject when children count exceeds limit', () => {
      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: Array.from({ length: 11 }, (_, i) => ({
          taskPrompt: `Child task ${i}`,
          integrationStrategy: IntegrationStrategy.MANUAL,
        })),
      };

      const result = processor.validateSpawnRequest(request, mockParent, limits);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Children count limit exceeded'))).toBe(true);
    });

    it('should reject when parent work order ID does not match', () => {
      const request: SpawnRequest = {
        parentWorkOrderId: 'wrong-parent-id',
        children: [
          {
            taskPrompt: 'Child task 1',
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
        ],
      };

      const result = processor.validateSpawnRequest(request, mockParent, limits);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Parent work order ID mismatch'))).toBe(true);
    });

    it('should reject when total descendants limit is exceeded', () => {
      const parentWithManyChildren: WorkOrder = {
        ...mockParent,
        childIds: Array.from({ length: 95 }, (_, i) => `child-${i}`),
      };

      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: Array.from({ length: 10 }, (_, i) => ({
          taskPrompt: `Child task ${i}`,
          integrationStrategy: IntegrationStrategy.MANUAL,
        })),
      };

      const result = processor.validateSpawnRequest(request, parentWithManyChildren, limits);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Total descendants limit exceeded'))).toBe(true);
    });
  });

  describe('createChildWorkOrders', () => {
    it('should create child work orders with correct properties', async () => {
      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: [
          {
            taskPrompt: 'Child task 1',
            siblingIndex: 0,
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
          {
            taskPrompt: 'Child task 2',
            siblingIndex: 1,
            integrationStrategy: IntegrationStrategy.AUTO_MERGE,
          },
        ],
      };

      const mockChildOrder1: WorkOrder = {
        id: 'child-wo-1',
        taskPrompt: 'Child task 1',
        workspaceSource: mockParent.workspaceSource,
        agentType: mockParent.agentType,
        maxIterations: mockParent.maxIterations,
        maxWallClockSeconds: mockParent.maxWallClockSeconds,
        gatePlanSource: mockParent.gatePlanSource,
        policies: mockParent.policies,
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
        parentId: 'parent-wo-123',
        rootId: 'parent-wo-123',
        depth: 1,
        siblingIndex: 0,
      };

      const mockChildOrder2: WorkOrder = {
        ...mockChildOrder1,
        id: 'child-wo-2',
        taskPrompt: 'Child task 2',
        siblingIndex: 1,
      };

      vi.mocked(workOrderService.submit)
        .mockResolvedValueOnce(mockChildOrder1)
        .mockResolvedValueOnce(mockChildOrder2);

      const result = await processor.createChildWorkOrders(mockParent, request, mockWorkspace);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('child-wo-1');
      expect(result[1].id).toBe('child-wo-2');
      expect(workOrderService.submit).toHaveBeenCalledTimes(2);

      // Verify parent's childIds were updated
      expect(mockParent.childIds).toContain('child-wo-1');
      expect(mockParent.childIds).toContain('child-wo-2');
    });

    it('should inherit properties from parent', async () => {
      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: [
          {
            taskPrompt: 'Child task',
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
        ],
      };

      const mockChildOrder: WorkOrder = {
        id: 'child-wo-1',
        taskPrompt: 'Child task',
        workspaceSource: mockParent.workspaceSource,
        agentType: mockParent.agentType,
        maxIterations: mockParent.maxIterations,
        maxWallClockSeconds: mockParent.maxWallClockSeconds,
        gatePlanSource: mockParent.gatePlanSource,
        policies: mockParent.policies,
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
        parentId: 'parent-wo-123',
        rootId: 'parent-wo-123',
        depth: 1,
        siblingIndex: 0,
      };

      vi.mocked(workOrderService.submit).mockResolvedValue(mockChildOrder);

      await processor.createChildWorkOrders(mockParent, request, mockWorkspace);

      const submitCall = vi.mocked(workOrderService.submit).mock.calls[0][0];
      expect(submitCall.workspaceSource).toEqual(mockParent.workspaceSource);
      expect(submitCall.agentType).toBe(mockParent.agentType);
      expect(submitCall.maxIterations).toBe(mockParent.maxIterations);
      expect(submitCall.policies).toEqual(mockParent.policies);
    });

    it('should calculate depth correctly for nested spawns', async () => {
      const nestedParent: WorkOrder = {
        ...mockParent,
        depth: 2,
        parentId: 'grandparent-wo',
        rootId: 'root-wo',
      };

      const request: SpawnRequest = {
        parentWorkOrderId: 'parent-wo-123',
        children: [
          {
            taskPrompt: 'Child task',
            integrationStrategy: IntegrationStrategy.MANUAL,
          },
        ],
      };

      const mockChildOrder: WorkOrder = {
        id: 'child-wo-1',
        taskPrompt: 'Child task',
        workspaceSource: nestedParent.workspaceSource,
        agentType: nestedParent.agentType,
        maxIterations: nestedParent.maxIterations,
        maxWallClockSeconds: nestedParent.maxWallClockSeconds,
        gatePlanSource: nestedParent.gatePlanSource,
        policies: nestedParent.policies,
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
        parentId: 'parent-wo-123',
        rootId: 'root-wo',
        depth: 3,
        siblingIndex: 0,
      };

      vi.mocked(workOrderService.submit).mockResolvedValue(mockChildOrder);

      await processor.createChildWorkOrders(nestedParent, request, mockWorkspace);

      const submitCall = vi.mocked(workOrderService.submit).mock.calls[0][0];
      expect(submitCall.depth).toBe(3);
      expect(submitCall.rootId).toBe('root-wo');
      expect(submitCall.parentId).toBe('parent-wo-123');
    });
  });

  describe('deleteSpawnRequestFile', () => {
    it('should delete spawn request file when it exists', async () => {
      const unlinkSpy = vi.spyOn(fs, 'unlink').mockResolvedValue(undefined);

      await processor.deleteSpawnRequestFile(testWorkspacePath);

      expect(unlinkSpy).toHaveBeenCalledWith(
        join(testWorkspacePath, '.agentgate', 'spawn-requests.json')
      );

      vi.restoreAllMocks();
    });

    it('should not throw when file does not exist', async () => {
      const error: NodeJS.ErrnoException = new Error('File not found');
      error.code = 'ENOENT';
      const unlinkSpy = vi.spyOn(fs, 'unlink').mockRejectedValue(error);

      await expect(processor.deleteSpawnRequestFile(testWorkspacePath)).resolves.not.toThrow();

      vi.restoreAllMocks();
    });
  });
});
