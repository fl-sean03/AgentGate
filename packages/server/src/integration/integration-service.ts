/**
 * Integration Service
 *
 * Manages the integration of child work order branches into parent branches
 * according to specified integration strategies.
 */

import { createLogger } from '../utils/logger.js';
import { WorkOrder, IntegrationStatus, WorkOrderStatus } from '../types/work-order.js';
import { IntegrationStrategy } from '../types/spawn.js';
import {
  getCurrentBranch,
  checkout,
  merge,
  abortMerge,
  hasConflicts,
  deleteBranch,
  type MergeResult,
  type MergeOptions,
} from '../workspace/git-ops.js';
import { detectConflicts, type ConflictCheckResult } from './conflict-detector.js';
import type { WorkOrderStore } from '../control-plane/work-order-store.js';

const log = createLogger('integration-service');

export interface IntegrationResult {
  success: boolean;
  strategy: IntegrationStrategy;
  conflictsDetected: boolean;
  mergeResult: MergeResult | undefined;
  conflictDetails: ConflictCheckResult | undefined;
  error: string | undefined;
  integratedBranches: string[];
}

export interface IntegrationOptions {
  /** Delete child branches after successful integration */
  deleteChildBranches?: boolean;
  /** Remote name for branch deletion (if applicable) */
  remote?: string;
}

/**
 * Integration Service
 *
 * Orchestrates the integration of child work order branches into their parent.
 */
export class IntegrationService {
  constructor(
    private workOrderStore: WorkOrderStore,
    private workspacePath: string
  ) {}

  /**
   * Integrate a single child work order into the parent
   */
  async integrateChild(
    parentWorkOrder: WorkOrder,
    childWorkOrder: WorkOrder,
    strategy: IntegrationStrategy,
    options: IntegrationOptions = {}
  ): Promise<IntegrationResult> {
    log.info(
      {
        parentId: parentWorkOrder.id,
        childId: childWorkOrder.id,
        strategy,
      },
      'Starting child integration'
    );

    const childBranchName = `agentgate/${childWorkOrder.id}`;
    const parentBranchName = `agentgate/${parentWorkOrder.id}`;

    try {
      // Update child integration status
      await this.updateIntegrationStatus(childWorkOrder, IntegrationStatus.IN_PROGRESS);

      // Checkout parent branch
      const currentBranch = await getCurrentBranch(this.workspacePath);
      if (currentBranch !== parentBranchName) {
        await checkout(this.workspacePath, parentBranchName);
      }

      // Perform integration based on strategy
      let mergeResult: MergeResult;

      switch (strategy) {
        case IntegrationStrategy.AUTO_MERGE:
          mergeResult = await this.performAutoMerge(childBranchName);
          break;

        case IntegrationStrategy.AUTO_SQUASH:
          mergeResult = await this.performAutoSquash(childBranchName, childWorkOrder);
          break;

        case IntegrationStrategy.MANUAL:
          return await this.performManualIntegration(childBranchName, childWorkOrder);

        default:
          throw new Error(`Unsupported integration strategy: ${strategy}`);
      }

      // Handle merge conflicts
      if (!mergeResult.success && mergeResult.conflicts) {
        log.warn(
          {
            parentId: parentWorkOrder.id,
            childId: childWorkOrder.id,
            conflictFiles: mergeResult.conflictFiles,
          },
          'Integration failed due to conflicts'
        );

        // Abort the merge
        await abortMerge(this.workspacePath);

        await this.updateIntegrationStatus(childWorkOrder, IntegrationStatus.FAILED);

        return {
          success: false,
          strategy,
          conflictsDetected: true,
          mergeResult,
          conflictDetails: undefined,
          integratedBranches: [],
          error: 'Merge conflicts detected',
        };
      }

      // Delete child branch if requested
      if (options.deleteChildBranches) {
        await this.deleteChildBranch(childBranchName, options.remote);
      }

      // Update integration status
      await this.updateIntegrationStatus(childWorkOrder, IntegrationStatus.COMPLETED);

      log.info(
        {
          parentId: parentWorkOrder.id,
          childId: childWorkOrder.id,
          mergeCommit: mergeResult.mergeCommit,
        },
        'Child integration completed'
      );

      return {
        success: true,
        strategy,
        conflictsDetected: false,
        mergeResult,
        conflictDetails: undefined,
        error: undefined,
        integratedBranches: [childBranchName],
      };
    } catch (error) {
      log.error(
        {
          parentId: parentWorkOrder.id,
          childId: childWorkOrder.id,
          err: error,
        },
        'Integration failed'
      );

      // Try to abort merge if it was in progress
      try {
        if (await hasConflicts(this.workspacePath)) {
          await abortMerge(this.workspacePath);
        }
      } catch (abortError) {
        log.warn({ err: abortError }, 'Failed to abort merge');
      }

      await this.updateIntegrationStatus(childWorkOrder, IntegrationStatus.FAILED);

      return {
        success: false,
        strategy,
        conflictsDetected: false,
        mergeResult: undefined,
        conflictDetails: undefined,
        integratedBranches: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Integrate multiple child work orders into the parent
   *
   * This performs conflict detection across all children before attempting integration.
   */
  async integrateChildren(
    parentWorkOrder: WorkOrder,
    childWorkOrders: WorkOrder[],
    strategy: IntegrationStrategy,
    options: IntegrationOptions = {}
  ): Promise<IntegrationResult> {
    log.info(
      {
        parentId: parentWorkOrder.id,
        childCount: childWorkOrders.length,
        strategy,
      },
      'Starting multi-child integration'
    );

    const parentBranchName = `agentgate/${parentWorkOrder.id}`;
    const childBranchNames = childWorkOrders.map((wo) => `agentgate/${wo.id}`);

    try {
      // Detect conflicts between children
      const conflictCheck = await detectConflicts(
        this.workspacePath,
        parentBranchName,
        childBranchNames
      );

      if (conflictCheck.hasConflicts) {
        log.warn(
          {
            parentId: parentWorkOrder.id,
            conflicts: conflictCheck.conflicts,
          },
          'Conflicts detected between child branches'
        );

        return {
          success: false,
          strategy,
          conflictsDetected: true,
          mergeResult: undefined,
          conflictDetails: conflictCheck,
          integratedBranches: [],
          error: 'Conflicts detected between child branches',
        };
      }

      // Integrate each child sequentially
      const integratedBranches: string[] = [];
      for (const childWorkOrder of childWorkOrders) {
        const result = await this.integrateChild(parentWorkOrder, childWorkOrder, strategy, {
          ...options,
          // Don't delete branches yet - wait until all are integrated
          deleteChildBranches: false,
        });

        if (!result.success) {
          log.error(
            {
              parentId: parentWorkOrder.id,
              childId: childWorkOrder.id,
            },
            'Failed to integrate child, aborting batch integration'
          );

          return {
            success: false,
            strategy,
            conflictsDetected: result.conflictsDetected,
            mergeResult: result.mergeResult,
            conflictDetails: result.conflictDetails,
            integratedBranches,
            error: result.error,
          };
        }

        integratedBranches.push(`agentgate/${childWorkOrder.id}`);
      }

      // Delete child branches if requested (after all successful)
      if (options.deleteChildBranches) {
        for (const branchName of childBranchNames) {
          await this.deleteChildBranch(branchName, options.remote);
        }
      }

      log.info(
        {
          parentId: parentWorkOrder.id,
          childCount: childWorkOrders.length,
        },
        'Multi-child integration completed'
      );

      return {
        success: true,
        strategy,
        conflictsDetected: false,
        mergeResult: undefined,
        conflictDetails: undefined,
        error: undefined,
        integratedBranches,
      };
    } catch (error) {
      log.error(
        {
          parentId: parentWorkOrder.id,
          err: error,
        },
        'Multi-child integration failed'
      );

      return {
        success: false,
        strategy,
        conflictsDetected: false,
        mergeResult: undefined,
        conflictDetails: undefined,
        integratedBranches: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Perform an auto-merge integration (creates merge commit)
   */
  private async performAutoMerge(childBranchName: string): Promise<MergeResult> {
    log.debug({ childBranchName }, 'Performing auto-merge');

    const mergeOptions: MergeOptions = {
      fastForward: false, // Always create merge commit
      message: `Merge child branch ${childBranchName}`,
    };

    return await merge(this.workspacePath, childBranchName, mergeOptions);
  }

  /**
   * Perform an auto-squash integration (squashes all commits into one)
   */
  private async performAutoSquash(
    childBranchName: string,
    childWorkOrder: WorkOrder
  ): Promise<MergeResult> {
    log.debug({ childBranchName }, 'Performing auto-squash');

    const mergeOptions: MergeOptions = {
      squash: true,
      message: `Squash merge: ${childWorkOrder.taskPrompt.substring(0, 72)}`,
    };

    return await merge(this.workspacePath, childBranchName, mergeOptions);
  }

  /**
   * Perform a manual integration (requires user intervention)
   */
  private async performManualIntegration(
    childBranchName: string,
    childWorkOrder: WorkOrder
  ): Promise<IntegrationResult> {
    log.info({ childBranchName }, 'Manual integration requested');

    await this.updateIntegrationStatus(childWorkOrder, IntegrationStatus.PENDING);

    return {
      success: true,
      strategy: IntegrationStrategy.MANUAL,
      conflictsDetected: false,
      mergeResult: undefined,
      conflictDetails: undefined,
      integratedBranches: [],
      error: 'Manual integration required - no automatic merge performed',
    };
  }

  /**
   * Delete a child branch (local and optionally remote)
   */
  private async deleteChildBranch(branchName: string, remote?: string): Promise<void> {
    try {
      await deleteBranch(this.workspacePath, branchName);
      log.debug({ branchName }, 'Deleted local child branch');

      if (remote) {
        await deleteBranch(this.workspacePath, branchName, remote);
        log.debug({ branchName, remote }, 'Deleted remote child branch');
      }
    } catch (error) {
      log.warn({ branchName, err: error }, 'Failed to delete child branch');
      // Don't fail integration if branch deletion fails
    }
  }

  /**
   * Update the integration status of a work order
   */
  private async updateIntegrationStatus(
    workOrder: WorkOrder,
    status: IntegrationStatus
  ): Promise<void> {
    workOrder.integrationStatus = status;
    await this.workOrderStore.save(workOrder);
    log.debug({ workOrderId: workOrder.id, status }, 'Updated integration status');
  }
}

/**
 * Create an integration service instance
 */
export function createIntegrationService(
  workOrderStore: WorkOrderStore,
  workspacePath: string
): IntegrationService {
  return new IntegrationService(workOrderStore, workspacePath);
}
