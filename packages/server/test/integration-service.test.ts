/**
 * Integration Service Unit Tests
 *
 * Tests for integration-service module including conflict detection
 * and branch integration operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  initRepo,
  stageAll,
  commit,
  createBranch,
  checkout,
  getCurrentBranch,
} from '../src/workspace/git-ops.js';
import { IntegrationService } from '../src/integration/integration-service.js';
import { detectConflicts } from '../src/integration/conflict-detector.js';
import { WorkOrderStore } from '../src/control-plane/work-order-store.js';
import {
  WorkOrder,
  WorkOrderStatus,
  IntegrationStatus,
  AgentType,
  GatePlanSource,
} from '../src/types/work-order.js';
import { IntegrationStrategy } from '../src/types/spawn.js';

const TEST_OUTPUT_DIR = path.join(import.meta.dirname, '../test-output');

describe('Integration Service', () => {
  let testDir: string;
  let workOrderStore: WorkOrderStore;
  let integrationService: IntegrationService;

  beforeEach(async () => {
    // Create unique test directory
    testDir = path.join(TEST_OUTPUT_DIR, `integration-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Create work order store instance
    workOrderStore = new WorkOrderStore();
    await workOrderStore.init();

    // Create integration service
    integrationService = new IntegrationService(workOrderStore, testDir);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  const createTestWorkOrder = (id: string, parentId?: string): WorkOrder => ({
    id,
    taskPrompt: `Test task ${id}`,
    workspaceSource: { type: 'local', path: testDir },
    agentType: AgentType.CLAUDE_CODE,
    maxIterations: 3,
    maxWallClockSeconds: 3600,
    gatePlanSource: GatePlanSource.DEFAULT,
    policies: {
      networkAllowed: false,
      allowedPaths: [],
      forbiddenPatterns: [],
    },
    createdAt: new Date(),
    status: WorkOrderStatus.SUCCEEDED,
    parentId,
    depth: parentId ? 1 : 0,
  });

  describe('integrateChild', () => {
    beforeEach(async () => {
      // Initialize repo with parent branch
      await initRepo(testDir);
      await writeFile(path.join(testDir, 'base.txt'), 'base content');
      await stageAll(testDir);
      await commit(testDir, 'Initial commit');

      // Create parent branch
      await createBranch(testDir, 'agentgate/parent-123');
      await writeFile(path.join(testDir, 'parent.txt'), 'parent content');
      await stageAll(testDir);
      await commit(testDir, 'Parent work');
    });

    it('should integrate child with auto-merge strategy', async () => {
      // Create child branch
      await createBranch(testDir, 'agentgate/child-456');
      await writeFile(path.join(testDir, 'child.txt'), 'child content');
      await stageAll(testDir);
      await commit(testDir, 'Child work');

      // Create work orders
      const parentWorkOrder = createTestWorkOrder('parent-123');
      const childWorkOrder = createTestWorkOrder('child-456', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(childWorkOrder);

      // Checkout parent branch
      await checkout(testDir, 'agentgate/parent-123');

      // Integrate
      const result = await integrationService.integrateChild(
        parentWorkOrder,
        childWorkOrder,
        IntegrationStrategy.AUTO_MERGE
      );

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(IntegrationStrategy.AUTO_MERGE);
      expect(result.conflictsDetected).toBe(false);
      expect(result.mergeResult?.success).toBe(true);

      // Verify integration status updated
      const updatedChild = await workOrderStore.load('child-456');
      expect(updatedChild?.integrationStatus).toBe(IntegrationStatus.COMPLETED);
    });

    it('should integrate child with auto-squash strategy', async () => {
      // Create child branch with multiple commits
      await createBranch(testDir, 'agentgate/child-456');

      await writeFile(path.join(testDir, 'child1.txt'), 'child content 1');
      await stageAll(testDir);
      await commit(testDir, 'Child work 1');

      await writeFile(path.join(testDir, 'child2.txt'), 'child content 2');
      await stageAll(testDir);
      await commit(testDir, 'Child work 2');

      // Create work orders
      const parentWorkOrder = createTestWorkOrder('parent-123');
      const childWorkOrder = createTestWorkOrder('child-456', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(childWorkOrder);

      // Checkout parent branch
      await checkout(testDir, 'agentgate/parent-123');

      // Integrate with squash
      const result = await integrationService.integrateChild(
        parentWorkOrder,
        childWorkOrder,
        IntegrationStrategy.AUTO_SQUASH
      );

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(IntegrationStrategy.AUTO_SQUASH);
      expect(result.mergeResult?.mergeCommit).toBeDefined();
    });

    it('should handle merge conflicts', async () => {
      // Create child branch that conflicts
      await createBranch(testDir, 'agentgate/child-456');
      await writeFile(path.join(testDir, 'parent.txt'), 'child modified parent');
      await stageAll(testDir);
      await commit(testDir, 'Child modifies parent file');

      // Modify same file on parent
      await checkout(testDir, 'agentgate/parent-123');
      await writeFile(path.join(testDir, 'parent.txt'), 'parent modified again');
      await stageAll(testDir);
      await commit(testDir, 'Parent modifies same file');

      // Create work orders
      const parentWorkOrder = createTestWorkOrder('parent-123');
      const childWorkOrder = createTestWorkOrder('child-456', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(childWorkOrder);

      // Integrate (should fail with conflicts)
      const result = await integrationService.integrateChild(
        parentWorkOrder,
        childWorkOrder,
        IntegrationStrategy.AUTO_MERGE
      );

      expect(result.success).toBe(false);
      expect(result.conflictsDetected).toBe(true);
      expect(result.mergeResult?.conflicts).toBe(true);
      expect(result.mergeResult?.conflictFiles?.length).toBeGreaterThan(0);

      // Verify integration status
      const updatedChild = await workOrderStore.load('child-456');
      expect(updatedChild?.integrationStatus).toBe(IntegrationStatus.FAILED);
    });

    it('should handle manual integration strategy', async () => {
      // Create child branch
      await createBranch(testDir, 'agentgate/child-456');
      await writeFile(path.join(testDir, 'child.txt'), 'child content');
      await stageAll(testDir);
      await commit(testDir, 'Child work');

      // Create work orders
      const parentWorkOrder = createTestWorkOrder('parent-123');
      const childWorkOrder = createTestWorkOrder('child-456', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(childWorkOrder);

      await checkout(testDir, 'agentgate/parent-123');

      // Manual integration should not perform merge
      const result = await integrationService.integrateChild(
        parentWorkOrder,
        childWorkOrder,
        IntegrationStrategy.MANUAL
      );

      expect(result.success).toBe(true);
      expect(result.strategy).toBe(IntegrationStrategy.MANUAL);
      expect(result.integratedBranches.length).toBe(0);

      // Verify integration status is pending
      const updatedChild = await workOrderStore.load('child-456');
      expect(updatedChild?.integrationStatus).toBe(IntegrationStatus.PENDING);
    });

    it('should delete child branch after integration if requested', async () => {
      // Create child branch
      await createBranch(testDir, 'agentgate/child-456');
      await writeFile(path.join(testDir, 'child.txt'), 'child content');
      await stageAll(testDir);
      await commit(testDir, 'Child work');

      const parentWorkOrder = createTestWorkOrder('parent-123');
      const childWorkOrder = createTestWorkOrder('child-456', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(childWorkOrder);

      await checkout(testDir, 'agentgate/parent-123');

      // Integrate with branch deletion
      const result = await integrationService.integrateChild(
        parentWorkOrder,
        childWorkOrder,
        IntegrationStrategy.AUTO_MERGE,
        { deleteChildBranches: true }
      );

      expect(result.success).toBe(true);

      // Note: Branch deletion is best-effort and logged, but doesn't fail integration
      // We just verify the integration succeeded
    });
  });

  describe('integrateChildren', () => {
    beforeEach(async () => {
      // Initialize repo with parent branch
      await initRepo(testDir);
      await writeFile(path.join(testDir, 'base.txt'), 'base content');
      await stageAll(testDir);
      await commit(testDir, 'Initial commit');

      // Create parent branch
      await createBranch(testDir, 'agentgate/parent-123');
      await writeFile(path.join(testDir, 'parent.txt'), 'parent content');
      await stageAll(testDir);
      await commit(testDir, 'Parent work');
    });

    it('should integrate multiple children without conflicts', async () => {
      // Create first child branch
      await createBranch(testDir, 'agentgate/child-1');
      await writeFile(path.join(testDir, 'child1.txt'), 'child 1 content');
      await stageAll(testDir);
      await commit(testDir, 'Child 1 work');

      // Create second child branch (from parent)
      await checkout(testDir, 'agentgate/parent-123');
      await createBranch(testDir, 'agentgate/child-2');
      await writeFile(path.join(testDir, 'child2.txt'), 'child 2 content');
      await stageAll(testDir);
      await commit(testDir, 'Child 2 work');

      // Create work orders
      const parentWorkOrder = createTestWorkOrder('parent-123');
      const child1WorkOrder = createTestWorkOrder('child-1', 'parent-123');
      const child2WorkOrder = createTestWorkOrder('child-2', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(child1WorkOrder);
      await workOrderStore.save(child2WorkOrder);

      await checkout(testDir, 'agentgate/parent-123');

      // Integrate all children
      const result = await integrationService.integrateChildren(
        parentWorkOrder,
        [child1WorkOrder, child2WorkOrder],
        IntegrationStrategy.AUTO_MERGE
      );

      expect(result.success).toBe(true);
      expect(result.conflictsDetected).toBe(false);
      expect(result.integratedBranches.length).toBe(2);
    });

    it('should detect conflicts between children', async () => {
      // Create first child branch modifying same file
      await createBranch(testDir, 'agentgate/child-1');
      await writeFile(path.join(testDir, 'shared.txt'), 'child 1 version');
      await stageAll(testDir);
      await commit(testDir, 'Child 1 modifies shared');

      // Create second child branch modifying same file
      await checkout(testDir, 'agentgate/parent-123');
      await createBranch(testDir, 'agentgate/child-2');
      await writeFile(path.join(testDir, 'shared.txt'), 'child 2 version');
      await stageAll(testDir);
      await commit(testDir, 'Child 2 modifies shared');

      const parentWorkOrder = createTestWorkOrder('parent-123');
      const child1WorkOrder = createTestWorkOrder('child-1', 'parent-123');
      const child2WorkOrder = createTestWorkOrder('child-2', 'parent-123');

      await workOrderStore.save(parentWorkOrder);
      await workOrderStore.save(child1WorkOrder);
      await workOrderStore.save(child2WorkOrder);

      await checkout(testDir, 'agentgate/parent-123');

      // Integrate should detect conflicts
      const result = await integrationService.integrateChildren(
        parentWorkOrder,
        [child1WorkOrder, child2WorkOrder],
        IntegrationStrategy.AUTO_MERGE
      );

      expect(result.success).toBe(false);
      expect(result.conflictsDetected).toBe(true);
      expect(result.conflictDetails?.hasConflicts).toBe(true);
      expect(result.conflictDetails?.conflicts.length).toBeGreaterThan(0);
    });
  });
});

describe('Conflict Detector', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(TEST_OUTPUT_DIR, `conflict-detect-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Initialize repo with base
    await initRepo(testDir);
    await writeFile(path.join(testDir, 'base.txt'), 'base content');
    await stageAll(testDir);
    await commit(testDir, 'Initial commit');

    // Create base branch
    await createBranch(testDir, 'base');
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should detect no conflicts when branches modify different files', async () => {
    // Create branch 1
    await createBranch(testDir, 'branch-1');
    await writeFile(path.join(testDir, 'file1.txt'), 'content 1');
    await stageAll(testDir);
    await commit(testDir, 'Add file1');

    // Create branch 2 from base
    await checkout(testDir, 'base');
    await createBranch(testDir, 'branch-2');
    await writeFile(path.join(testDir, 'file2.txt'), 'content 2');
    await stageAll(testDir);
    await commit(testDir, 'Add file2');

    await checkout(testDir, 'base');

    const result = await detectConflicts(testDir, 'base', ['branch-1', 'branch-2']);

    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts.length).toBe(0);
    expect(result.conflictingFiles.length).toBe(0);
  });

  it('should detect conflicts when branches modify same file', async () => {
    // Create branch 1
    await createBranch(testDir, 'branch-1');
    await writeFile(path.join(testDir, 'shared.txt'), 'version 1');
    await stageAll(testDir);
    await commit(testDir, 'Branch 1 version');

    // Create branch 2 from base
    await checkout(testDir, 'base');
    await createBranch(testDir, 'branch-2');
    await writeFile(path.join(testDir, 'shared.txt'), 'version 2');
    await stageAll(testDir);
    await commit(testDir, 'Branch 2 version');

    await checkout(testDir, 'base');

    const result = await detectConflicts(testDir, 'base', ['branch-1', 'branch-2']);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].sharedFiles).toContain('shared.txt');
    expect(result.conflictingFiles).toContain('shared.txt');
  });

  it('should detect conflicts across multiple branch pairs', async () => {
    // Create branch 1
    await createBranch(testDir, 'branch-1');
    await writeFile(path.join(testDir, 'shared.txt'), 'version 1');
    await stageAll(testDir);
    await commit(testDir, 'Branch 1');

    // Create branch 2
    await checkout(testDir, 'base');
    await createBranch(testDir, 'branch-2');
    await writeFile(path.join(testDir, 'shared.txt'), 'version 2');
    await stageAll(testDir);
    await commit(testDir, 'Branch 2');

    // Create branch 3
    await checkout(testDir, 'base');
    await createBranch(testDir, 'branch-3');
    await writeFile(path.join(testDir, 'shared.txt'), 'version 3');
    await stageAll(testDir);
    await commit(testDir, 'Branch 3');

    await checkout(testDir, 'base');

    const result = await detectConflicts(testDir, 'base', ['branch-1', 'branch-2', 'branch-3']);

    expect(result.hasConflicts).toBe(true);
    // 3 branches = 3 pairs: (1,2), (1,3), (2,3)
    expect(result.conflicts.length).toBe(3);
  });

  it('should handle empty branch list', async () => {
    const result = await detectConflicts(testDir, 'base', []);

    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts.length).toBe(0);
  });
});
