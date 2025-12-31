/**
 * Tree Coordinator Unit Tests (v0.2.10)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TreeCoordinator } from '../src/orchestrator/tree-coordinator.js';
import { TreeStore } from '../src/control-plane/tree-store.js';
import type { WorkOrder, TreeMetadata } from '../src/types/index.js';
import { WorkOrderStatus } from '../src/types/work-order.js';
import { TreeStatus } from '../src/types/tree-metadata.js';
import { setAgentGateRoot } from '../src/artifacts/paths.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('TreeCoordinator', () => {
  let coordinator: TreeCoordinator;
  let store: TreeStore;
  let testRoot: string;

  beforeEach(async () => {
    // Create temporary directory for test data
    testRoot = await mkdtemp(join(tmpdir(), 'agentgate-tree-test-'));
    setAgentGateRoot(testRoot);

    coordinator = new TreeCoordinator();
    store = new TreeStore();
    await store.init();
  });

  afterEach(async () => {
    // Clean up test directory
    if (testRoot) {
      await rm(testRoot, { recursive: true, force: true });
    }
  });

  describe('onWorkOrderCreated', () => {
    it('should create new tree for root work order', async () => {
      const workOrder: WorkOrder = {
        id: 'wo-root',
        taskPrompt: 'Test task',
        workspaceSource: { type: 'local', path: '/test' },
        agentType: 'claude-code',
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: 'default',
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
      };

      await coordinator.onWorkOrderCreated(workOrder);

      const tree = await store.getTree('wo-root');
      expect(tree).toBeDefined();
      expect(tree?.rootId).toBe('wo-root');
      expect(tree?.status).toBe(TreeStatus.ACTIVE);
      expect(tree?.nodeCount).toBe(1);
    });

    it('should not create duplicate tree for same root', async () => {
      const workOrder: WorkOrder = {
        id: 'wo-root',
        taskPrompt: 'Test task',
        workspaceSource: { type: 'local', path: '/test' },
        agentType: 'claude-code',
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: 'default',
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
      };

      await coordinator.onWorkOrderCreated(workOrder);
      const tree1 = await store.getTree('wo-root');
      const nodeCount1 = tree1?.nodeCount;

      await coordinator.onWorkOrderCreated(workOrder);
      const tree2 = await store.getTree('wo-root');

      expect(tree2?.nodeCount).toBe(nodeCount1);
    });

    it('should add child node to existing tree', async () => {
      // Create root first
      await store.createTree('wo-root', WorkOrderStatus.QUEUED);

      const childWorkOrder: WorkOrder = {
        id: 'wo-child',
        taskPrompt: 'Child task',
        workspaceSource: { type: 'local', path: '/test' },
        agentType: 'claude-code',
        maxIterations: 3,
        maxWallClockSeconds: 3600,
        gatePlanSource: 'default',
        policies: {
          networkAllowed: false,
          allowedPaths: [],
          forbiddenPatterns: [],
        },
        createdAt: new Date(),
        status: WorkOrderStatus.QUEUED,
        parentId: 'wo-root',
        rootId: 'wo-root',
        depth: 1,
        siblingIndex: 0,
      };

      await coordinator.onWorkOrderCreated(childWorkOrder);

      const tree = await store.getTree('wo-root');
      expect(tree?.nodeCount).toBe(2);
      expect(tree?.nodes['wo-child']).toBeDefined();
      expect(tree?.nodes['wo-child']?.parentId).toBe('wo-root');
      expect(tree?.nodes['wo-root']?.childIds).toContain('wo-child');
    });
  });

  describe('onWorkOrderStatusChange', () => {
    it('should update node status in tree', async () => {
      await store.createTree('wo-root', WorkOrderStatus.QUEUED);

      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.RUNNING);

      const tree = await store.getTree('wo-root');
      expect(tree?.nodes['wo-root']?.status).toBe(WorkOrderStatus.RUNNING);
    });

    it('should set completedAt for terminal status', async () => {
      await store.createTree('wo-root', WorkOrderStatus.QUEUED);

      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.SUCCEEDED);

      const tree = await store.getTree('wo-root');
      expect(tree?.nodes['wo-root']?.completedAt).toBeDefined();
    });

    it('should update tree status when all nodes complete', async () => {
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);

      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.SUCCEEDED);

      const tree = await store.getTree('wo-root');
      expect(tree?.status).toBe(TreeStatus.COMPLETED);
    });

    it('should set tree to FAILED if any node fails', async () => {
      const tree = await store.createTree('wo-root', WorkOrderStatus.RUNNING);
      await store.addNode('wo-root', 'wo-child', 'wo-root', 1, 0, WorkOrderStatus.RUNNING);

      await coordinator.onWorkOrderStatusChange('wo-child', WorkOrderStatus.FAILED);

      const updatedTree = await store.getTree('wo-root');
      expect(updatedTree?.status).toBe(TreeStatus.FAILED);
    });

    it('should handle work order not in any tree', async () => {
      // Should not throw
      await expect(
        coordinator.onWorkOrderStatusChange('wo-unknown', WorkOrderStatus.SUCCEEDED)
      ).resolves.not.toThrow();
    });

    it('should update integration status', async () => {
      await store.createTree('wo-root', WorkOrderStatus.WAITING_FOR_CHILDREN);

      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.INTEGRATING, {
        integrationStatus: 'in_progress',
        integrationWorkOrderId: 'wo-integration',
      });

      const tree = await store.getTree('wo-root');
      expect(tree?.nodes['wo-root']?.integrationStatus).toBe('in_progress');
      expect(tree?.nodes['wo-root']?.integrationWorkOrderId).toBe('wo-integration');
    });
  });

  describe('areAllChildrenComplete', () => {
    it('should return true for work order with no children', async () => {
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);

      const result = await coordinator.areAllChildrenComplete('wo-root');
      expect(result).toBe(true);
    });

    it('should return false if any child is still running', async () => {
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);
      await store.addNode('wo-root', 'wo-child1', 'wo-root', 1, 0, WorkOrderStatus.SUCCEEDED);
      await store.addNode('wo-root', 'wo-child2', 'wo-root', 1, 1, WorkOrderStatus.RUNNING);

      const result = await coordinator.areAllChildrenComplete('wo-root');
      expect(result).toBe(false);
    });

    it('should return true if all children have terminal status', async () => {
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);
      await store.addNode('wo-root', 'wo-child1', 'wo-root', 1, 0, WorkOrderStatus.SUCCEEDED);
      await store.addNode('wo-root', 'wo-child2', 'wo-root', 1, 1, WorkOrderStatus.SUCCEEDED);

      const result = await coordinator.areAllChildrenComplete('wo-root');
      expect(result).toBe(true);
    });

    it('should return true for work order not in any tree', async () => {
      const result = await coordinator.areAllChildrenComplete('wo-unknown');
      expect(result).toBe(true);
    });

    it('should consider FAILED status as complete', async () => {
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);
      await store.addNode('wo-root', 'wo-child1', 'wo-root', 1, 0, WorkOrderStatus.SUCCEEDED);
      await store.addNode('wo-root', 'wo-child2', 'wo-root', 1, 1, WorkOrderStatus.FAILED);

      const result = await coordinator.areAllChildrenComplete('wo-root');
      expect(result).toBe(true);
    });
  });

  describe('getTreeStatus', () => {
    it('should return tree status', async () => {
      await store.createTree('wo-root', WorkOrderStatus.QUEUED);

      const status = await coordinator.getTreeStatus('wo-root');
      expect(status).toBe(TreeStatus.ACTIVE);
    });

    it('should return null for non-existent tree', async () => {
      const status = await coordinator.getTreeStatus('wo-unknown');
      expect(status).toBeNull();
    });
  });

  describe('triggerIntegration', () => {
    it('should not trigger if work order not in tree', async () => {
      // Should not throw
      await expect(
        coordinator.triggerIntegration('wo-unknown')
      ).resolves.not.toThrow();
    });

    it('should not trigger if not all children succeeded', async () => {
      await store.createTree('wo-root', WorkOrderStatus.WAITING_FOR_CHILDREN);
      await store.addNode('wo-root', 'wo-child1', 'wo-root', 1, 0, WorkOrderStatus.SUCCEEDED);
      await store.addNode('wo-root', 'wo-child2', 'wo-root', 1, 1, WorkOrderStatus.FAILED);

      await coordinator.triggerIntegration('wo-root');

      const tree = await store.getTree('wo-root');
      expect(tree?.status).not.toBe(TreeStatus.INTEGRATING);
    });

    it('should trigger when all children succeeded', async () => {
      await store.createTree('wo-root', WorkOrderStatus.WAITING_FOR_CHILDREN);
      await store.addNode('wo-root', 'wo-child1', 'wo-root', 1, 0, WorkOrderStatus.SUCCEEDED);
      await store.addNode('wo-root', 'wo-child2', 'wo-root', 1, 1, WorkOrderStatus.SUCCEEDED);

      await coordinator.triggerIntegration('wo-root');

      // Integration logic will update tree status elsewhere
      // Here we just verify it doesn't throw
      const tree = await store.getTree('wo-root');
      expect(tree).toBeDefined();
    });
  });

  describe('tree status transitions', () => {
    it('should transition from ACTIVE to WAITING when parent waits for children', async () => {
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);

      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.WAITING_FOR_CHILDREN);

      const tree = await store.getTree('wo-root');
      expect(tree?.status).toBe(TreeStatus.WAITING);
    });

    it('should transition to INTEGRATING when node starts integration', async () => {
      await store.createTree('wo-root', WorkOrderStatus.WAITING_FOR_CHILDREN);

      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.INTEGRATING);

      const tree = await store.getTree('wo-root');
      expect(tree?.status).toBe(TreeStatus.INTEGRATING);
    });

    it('should handle complex tree with multiple levels', async () => {
      // Create root
      await store.createTree('wo-root', WorkOrderStatus.RUNNING);

      // Add level 1 children
      await store.addNode('wo-root', 'wo-child1', 'wo-root', 1, 0, WorkOrderStatus.RUNNING);
      await store.addNode('wo-root', 'wo-child2', 'wo-root', 1, 1, WorkOrderStatus.RUNNING);

      // Add level 2 grandchildren
      await store.addNode('wo-root', 'wo-grandchild1', 'wo-child1', 2, 0, WorkOrderStatus.RUNNING);

      // Complete all nodes
      await coordinator.onWorkOrderStatusChange('wo-grandchild1', WorkOrderStatus.SUCCEEDED);
      await coordinator.onWorkOrderStatusChange('wo-child1', WorkOrderStatus.SUCCEEDED);
      await coordinator.onWorkOrderStatusChange('wo-child2', WorkOrderStatus.SUCCEEDED);
      await coordinator.onWorkOrderStatusChange('wo-root', WorkOrderStatus.SUCCEEDED);

      const tree = await store.getTree('wo-root');
      expect(tree?.status).toBe(TreeStatus.COMPLETED);
      expect(tree?.nodeCount).toBe(4);
    });
  });
});
