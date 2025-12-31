/**
 * Tree Coordinator (v0.2.10)
 *
 * Coordinates execution of recursive agent spawning trees.
 * Monitors work order lifecycle events and manages tree state transitions.
 */

import type {
  WorkOrder,
  WorkOrderStatus,
  TreeMetadata,
  TreeStatus,
  IntegrationStatus,
} from '../types/index.js';
import { WorkOrderStatus as WOS } from '../types/work-order.js';
import { TreeStatus as TS } from '../types/tree-metadata.js';
import { treeStore } from '../control-plane/tree-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('tree-coordinator');

/**
 * Tree Coordinator class.
 *
 * Responsibilities:
 * - Track work order lifecycle events
 * - Detect when work orders spawn children
 * - Manage tree state transitions
 * - Trigger integration when all children complete
 */
export class TreeCoordinator {
  /**
   * Called when a new work order is created.
   * Creates or updates the execution tree.
   */
  async onWorkOrderCreated(workOrder: WorkOrder): Promise<void> {
    // If work order has no parent, it's a root - create new tree
    if (!workOrder.parentId) {
      const rootId = workOrder.rootId ?? workOrder.id;
      const exists = await treeStore.exists(rootId);

      if (!exists) {
        await treeStore.createTree(rootId, workOrder.status);
        log.info({ rootId, workOrderId: workOrder.id }, 'Created new execution tree');
      }
      return;
    }

    // Work order has a parent - add as child node
    const rootId = workOrder.rootId;
    if (!rootId) {
      log.warn({ workOrderId: workOrder.id }, 'Work order has parent but no rootId');
      return;
    }

    const tree = await treeStore.getTree(rootId);
    if (!tree) {
      log.error({ rootId, workOrderId: workOrder.id }, 'Tree not found for child work order');
      return;
    }

    await treeStore.addNode(
      rootId,
      workOrder.id,
      workOrder.parentId,
      workOrder.depth ?? 0,
      workOrder.siblingIndex ?? 0,
      workOrder.status
    );

    log.info(
      {
        rootId,
        workOrderId: workOrder.id,
        parentId: workOrder.parentId,
        depth: workOrder.depth,
      },
      'Added work order to execution tree'
    );
  }

  /**
   * Called when a work order status changes.
   * Updates tree node and checks for tree state transitions.
   */
  async onWorkOrderStatusChange(
    workOrderId: string,
    status: WorkOrderStatus,
    additionalFields?: {
      integrationStatus?: IntegrationStatus;
      integrationWorkOrderId?: string;
    }
  ): Promise<void> {
    // Find which tree this work order belongs to
    const trees = await treeStore.listTrees();
    const tree = trees.find(t => t.nodes[workOrderId] !== undefined);

    if (!tree) {
      // Not part of any tree - this is fine, not all work orders are in trees
      return;
    }

    // Update node status
    const updates: Parameters<typeof treeStore.updateNode>[2] = { status };
    if (additionalFields?.integrationStatus) {
      updates.integrationStatus = additionalFields.integrationStatus;
    }
    if (additionalFields?.integrationWorkOrderId) {
      updates.integrationWorkOrderId = additionalFields.integrationWorkOrderId;
    }
    if (this.isTerminalStatus(status)) {
      updates.completedAt = new Date();
    }

    await treeStore.updateNode(tree.rootId, workOrderId, updates);

    log.debug(
      { rootId: tree.rootId, workOrderId, status },
      'Updated work order status in tree'
    );

    // Check if we need to transition tree state
    await this.updateTreeStatus(tree.rootId);
  }

  /**
   * Check if all children of a work order have completed.
   */
  async areAllChildrenComplete(workOrderId: string): Promise<boolean> {
    // Find which tree this work order belongs to
    const trees = await treeStore.listTrees();
    const tree = trees.find(t => t.nodes[workOrderId] !== undefined);

    if (!tree) {
      return true; // No tree means no children
    }

    const node = tree.nodes[workOrderId];
    if (!node || node.childIds.length === 0) {
      return true; // No children
    }

    // Check if all children have terminal status
    for (const childId of node.childIds) {
      const childNode = tree.nodes[childId];
      if (!childNode || !this.isTerminalStatus(childNode.status)) {
        return false;
      }
    }

    log.debug(
      { rootId: tree.rootId, workOrderId, childCount: node.childIds.length },
      'All children complete'
    );

    return true;
  }

  /**
   * Get the current status of an execution tree.
   */
  async getTreeStatus(rootId: string): Promise<TreeStatus | null> {
    const tree = await treeStore.getTree(rootId);
    return tree?.status ?? null;
  }

  /**
   * Trigger integration for a work order.
   * This should be called when all children have completed successfully.
   */
  async triggerIntegration(workOrderId: string): Promise<void> {
    const trees = await treeStore.listTrees();
    const tree = trees.find(t => t.nodes[workOrderId] !== undefined);

    if (!tree) {
      log.warn({ workOrderId }, 'Cannot trigger integration - work order not in tree');
      return;
    }

    const node = tree.nodes[workOrderId];
    if (!node) {
      return;
    }

    // Check if all children succeeded
    const allChildrenSucceeded = node.childIds.every(childId => {
      const child = tree.nodes[childId];
      return child && child.status === WOS.SUCCEEDED;
    });

    if (!allChildrenSucceeded) {
      log.warn(
        { rootId: tree.rootId, workOrderId },
        'Cannot trigger integration - not all children succeeded'
      );
      return;
    }

    log.info(
      { rootId: tree.rootId, workOrderId, childCount: node.childIds.length },
      'Integration triggered for work order'
    );

    // Integration logic will be implemented by orchestrator
    // Here we just mark the tree as integrating
    await this.updateTreeStatus(tree.rootId);
  }

  /**
   * Update the overall tree status based on node states.
   */
  private async updateTreeStatus(rootId: string): Promise<void> {
    const tree = await treeStore.getTree(rootId);
    if (!tree) {
      return;
    }

    const newStatus = this.calculateTreeStatus(tree);

    if (newStatus !== tree.status) {
      const updates: Parameters<typeof treeStore.updateTree>[1] = { status: newStatus };

      if (this.isTerminalTreeStatus(newStatus)) {
        updates.completedAt = new Date();
      }

      await treeStore.updateTree(rootId, updates);

      log.info(
        { rootId, oldStatus: tree.status, newStatus },
        'Tree status changed'
      );
    }
  }

  /**
   * Calculate what the tree status should be based on node states.
   */
  private calculateTreeStatus(tree: TreeMetadata): TreeStatus {
    const nodes = Object.values(tree.nodes);

    // If any node failed or canceled, tree is failed
    const hasFailed = nodes.some(
      n => n.status === WOS.FAILED || n.status === WOS.CANCELED
    );
    if (hasFailed) {
      return TS.FAILED;
    }

    // If any node is running or queued, tree is active
    const hasActive = nodes.some(
      n => n.status === WOS.RUNNING || n.status === WOS.QUEUED
    );
    if (hasActive) {
      return TS.ACTIVE;
    }

    // If any node is waiting for children, tree is waiting
    const hasWaiting = nodes.some(n => n.status === WOS.WAITING_FOR_CHILDREN);
    if (hasWaiting) {
      return TS.WAITING;
    }

    // If any node is integrating, tree is integrating
    const hasIntegrating = nodes.some(n => n.status === WOS.INTEGRATING);
    if (hasIntegrating) {
      return TS.INTEGRATING;
    }

    // If all nodes succeeded, tree is completed
    const allSucceeded = nodes.every(n => n.status === WOS.SUCCEEDED);
    if (allSucceeded) {
      return TS.COMPLETED;
    }

    // Default to active if we can't determine
    return TS.ACTIVE;
  }

  /**
   * Check if a work order status is terminal.
   */
  private isTerminalStatus(status: WorkOrderStatus): boolean {
    return (
      status === WOS.SUCCEEDED ||
      status === WOS.FAILED ||
      status === WOS.CANCELED
    );
  }

  /**
   * Check if a tree status is terminal.
   */
  private isTerminalTreeStatus(status: TreeStatus): boolean {
    return (
      status === TS.COMPLETED ||
      status === TS.FAILED ||
      status === TS.CANCELED
    );
  }
}

// Default singleton instance
export const treeCoordinator = new TreeCoordinator();
