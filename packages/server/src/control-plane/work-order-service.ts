import { nanoid } from 'nanoid';
import {
  type WorkOrder,
  type SubmitRequest,
  type ListFilters,
  WorkOrderStatus,
  AgentType,
  GatePlanSource,
} from '../types/index.js';
import { WorkOrderStore, workOrderStore, type PurgeOptions, type PurgeResult } from './work-order-store.js';
import {
  type AgentProcessManager,
  type KillResult,
  getAgentProcessManager,
} from './agent-process-manager.js';
import { getQueueManager } from './queue-manager.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('work-order-service');

/**
 * Force kill options for terminating running work orders.
 * (v0.2.23 Wave 1.3)
 */
export interface ForceKillOptions {
  /** Grace period in ms before SIGKILL (default: 5000) */
  gracePeriodMs?: number;
  /** Skip graceful shutdown, immediately SIGKILL */
  immediate?: boolean;
  /** Reason for killing (logged) */
  reason?: string;
}

/**
 * Result of a force kill operation.
 * (v0.2.23 Wave 1.3)
 */
export interface ForceKillResult {
  /** Whether the kill was successful */
  success: boolean;
  /** Whether force kill (SIGKILL) was used */
  forcedKill: boolean;
  /** Time taken to terminate */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** New work order status after kill */
  newStatus: WorkOrderStatus;
}

/**
 * Work Order Service - Manages work order lifecycle.
 *
 * Provides operations for submitting, retrieving, listing,
 * and managing work orders.
 */
export class WorkOrderService {
  private processManager: AgentProcessManager;

  constructor(
    private store: WorkOrderStore = workOrderStore,
    processManager?: AgentProcessManager
  ) {
    this.processManager = processManager ?? getAgentProcessManager();
  }

  /**
   * Submit a new work order.
   *
   * Creates a work order from the submit request, assigns
   * a unique ID, and queues it for processing.
   */
  async submit(request: SubmitRequest): Promise<WorkOrder> {
    const id = nanoid(12);
    const now = new Date();

    const order: WorkOrder = {
      id,
      taskPrompt: request.taskPrompt,
      workspaceSource: request.workspaceSource,
      agentType: request.agentType ?? AgentType.CLAUDE_CODE_SUBSCRIPTION,
      maxIterations: request.maxIterations ?? 3,
      maxWallClockSeconds: request.maxWallClockSeconds ?? 3600,
      gatePlanSource: request.gatePlanSource ?? GatePlanSource.AUTO,
      policies: request.policies ?? {
        networkAllowed: false,
        allowedPaths: [],
        forbiddenPatterns: [
          '**/.env',
          '**/.env.*',
          '**/secrets/**',
          '**/*.pem',
          '**/*.key',
          '**/credentials.json',
          '**/service-account*.json',
        ],
      },
      // v0.2.15: Pass through skip verification levels (only if defined)
      ...(request.skipVerification && { skipVerification: request.skipVerification }),
      createdAt: now,
      status: WorkOrderStatus.QUEUED,
    };

    await this.store.save(order);
    log.info({ id: order.id, status: order.status }, 'Work order submitted');

    return order;
  }

  /**
   * Get a work order by ID.
   *
   * @returns The work order or null if not found.
   */
  async get(id: string): Promise<WorkOrder | null> {
    const order = await this.store.load(id);
    if (!order) {
      log.debug({ id }, 'Work order not found');
    }
    return order;
  }

  /**
   * List work orders with optional filtering.
   *
   * Supports filtering by status and pagination.
   */
  async list(filters: ListFilters): Promise<WorkOrder[]> {
    const resolvedFilters: ListFilters = {
      status: filters.status,
      limit: filters.limit ?? 20,
      offset: filters.offset ?? 0,
    };

    const orders = await this.store.list(resolvedFilters);
    log.debug(
      { count: orders.length, filters: resolvedFilters },
      'Listed work orders'
    );

    return orders;
  }

  /**
   * Cancel a work order.
   *
   * Supports canceling both QUEUED and RUNNING work orders.
   * For RUNNING work orders, sends an abort signal to the agent process.
   *
   * @throws Error if work order not found or not cancelable.
   */
  async cancel(id: string): Promise<void> {
    const order = await this.store.load(id);

    if (!order) {
      throw new Error(`Work order not found: ${id}`);
    }

    // Check if in a cancelable state
    const cancelableStatuses: WorkOrderStatus[] = [
      WorkOrderStatus.QUEUED,
      WorkOrderStatus.RUNNING,
      WorkOrderStatus.WAITING_FOR_CHILDREN,
      WorkOrderStatus.INTEGRATING,
    ];

    if (!cancelableStatuses.includes(order.status)) {
      throw new Error(
        `Cannot cancel work order in status '${order.status}'. Only queued or running orders can be canceled.`
      );
    }

    // If running, abort the agent process via queue manager
    if (order.status === WorkOrderStatus.RUNNING) {
      const queueManager = getQueueManager();
      const aborted = queueManager.cancelRunning(id);
      if (aborted) {
        log.info({ id }, 'Running work order aborted');
      } else {
        // Work order may have completed between status check and abort
        log.warn({ id }, 'Work order was running but not found in queue manager');
      }
    } else if (order.status === WorkOrderStatus.QUEUED) {
      // Remove from queue if still queued
      const queueManager = getQueueManager();
      queueManager.cancel(id);
    }

    await this.store.updateStatus(id, WorkOrderStatus.CANCELED, {
      completedAt: new Date(),
    });

    log.info({ id, previousStatus: order.status }, 'Work order canceled');
  }

  /**
   * Update the status of a work order.
   *
   * This is typically called by the execution layer as
   * the work order progresses through its lifecycle.
   */
  async updateStatus(
    id: string,
    status: WorkOrderStatus,
    additionalFields?: {
      runId?: string;
      completedAt?: Date;
      error?: string;
    }
  ): Promise<void> {
    const order = await this.store.load(id);

    if (!order) {
      throw new Error(`Work order not found: ${id}`);
    }

    // Validate status transitions
    if (!this.isValidTransition(order.status, status)) {
      throw new Error(
        `Invalid status transition from '${order.status}' to '${status}'`
      );
    }

    await this.store.updateStatus(id, status, additionalFields);
    log.info({ id, from: order.status, to: status }, 'Work order status updated');
  }

  /**
   * Mark a work order as running with an associated run ID.
   */
  async markRunning(id: string, runId: string): Promise<void> {
    await this.updateStatus(id, WorkOrderStatus.RUNNING, { runId });
  }

  /**
   * Mark a work order as succeeded.
   */
  async markSucceeded(id: string): Promise<void> {
    await this.updateStatus(id, WorkOrderStatus.SUCCEEDED, {
      completedAt: new Date(),
    });
  }

  /**
   * Mark a work order as failed with an error message.
   */
  async markFailed(id: string, error: string): Promise<void> {
    await this.updateStatus(id, WorkOrderStatus.FAILED, {
      completedAt: new Date(),
      error,
    });
  }

  /**
   * Get counts of work orders by status.
   */
  async getCounts(): Promise<Record<WorkOrderStatus, number>> {
    const counts: Record<WorkOrderStatus, number> = {
      [WorkOrderStatus.QUEUED]: 0,
      [WorkOrderStatus.RUNNING]: 0,
      [WorkOrderStatus.WAITING_FOR_CHILDREN]: 0,
      [WorkOrderStatus.INTEGRATING]: 0,
      [WorkOrderStatus.SUCCEEDED]: 0,
      [WorkOrderStatus.FAILED]: 0,
      [WorkOrderStatus.CANCELED]: 0,
    };

    for (const status of Object.values(WorkOrderStatus)) {
      counts[status] = await this.store.count(status);
    }

    return counts;
  }

  /**
   * Force kill a running work order's agent process.
   * (v0.2.23 Wave 1.3)
   *
   * This terminates the agent process associated with the work order,
   * first attempting a graceful shutdown (SIGTERM), then escalating
   * to SIGKILL if the process doesn't terminate within the grace period.
   *
   * @param id - Work order ID
   * @param options - Kill options
   * @returns Result of the kill operation
   * @throws Error if work order not found
   */
  async forceKill(id: string, options: ForceKillOptions = {}): Promise<ForceKillResult> {
    const order = await this.store.load(id);

    if (!order) {
      throw new Error(`Work order not found: ${id}`);
    }

    // Check if work order is in a killable state
    const killableStatuses: WorkOrderStatus[] = [
      WorkOrderStatus.RUNNING,
      WorkOrderStatus.WAITING_FOR_CHILDREN,
      WorkOrderStatus.INTEGRATING,
    ];

    if (!killableStatuses.includes(order.status)) {
      // If already in terminal state, return success
      const terminalStatuses: WorkOrderStatus[] = [
        WorkOrderStatus.SUCCEEDED,
        WorkOrderStatus.FAILED,
        WorkOrderStatus.CANCELED,
      ];

      if (terminalStatuses.includes(order.status)) {
        log.info({ id, status: order.status }, 'Work order already in terminal state');
        return {
          success: true,
          forcedKill: false,
          durationMs: 0,
          newStatus: order.status,
        };
      }

      // Queued orders can be canceled directly
      if (order.status === WorkOrderStatus.QUEUED) {
        await this.cancel(id);
        return {
          success: true,
          forcedKill: false,
          durationMs: 0,
          newStatus: WorkOrderStatus.CANCELED,
        };
      }
    }

    log.info(
      {
        id,
        status: order.status,
        gracePeriodMs: options.gracePeriodMs,
        immediate: options.immediate,
        reason: options.reason,
      },
      'Force killing work order'
    );

    // Check if there's an active process for this work order
    const hasProcess = this.processManager.hasActiveProcess(id);

    if (!hasProcess) {
      // No active process, just update status
      log.warn({ id }, 'No active process found for work order, updating status only');
      await this.store.updateStatus(id, WorkOrderStatus.CANCELED, {
        completedAt: new Date(),
        error: options.reason ?? 'Force killed (no active process)',
      });
      return {
        success: true,
        forcedKill: false,
        durationMs: 0,
        newStatus: WorkOrderStatus.CANCELED,
      };
    }

    // Kill the process
    let killResult: KillResult;
    if (options.immediate) {
      killResult = await this.processManager.forceKill(id, options.reason);
    } else {
      // Build kill options, only including defined properties
      const killOptions: {
        gracePeriodMs?: number;
        reason?: string;
        forceImmediate: false;
      } = { forceImmediate: false };
      if (options.gracePeriodMs !== undefined) {
        killOptions.gracePeriodMs = options.gracePeriodMs;
      }
      if (options.reason !== undefined) {
        killOptions.reason = options.reason;
      }
      killResult = await this.processManager.kill(id, killOptions);
    }

    // Update work order status based on kill result
    const newStatus = killResult.success
      ? WorkOrderStatus.CANCELED
      : order.status; // Keep current status if kill failed

    if (killResult.success) {
      await this.store.updateStatus(id, WorkOrderStatus.CANCELED, {
        completedAt: new Date(),
        error: options.reason ?? 'Force killed',
      });
    }

    log.info(
      {
        id,
        success: killResult.success,
        forcedKill: killResult.forcedKill,
        durationMs: killResult.durationMs,
        newStatus,
      },
      'Force kill completed'
    );

    // Build result, only including error if defined
    const result: ForceKillResult = {
      success: killResult.success,
      forcedKill: killResult.forcedKill,
      durationMs: killResult.durationMs,
      newStatus,
    };
    if (killResult.error !== undefined) {
      result.error = killResult.error;
    }
    return result;
  }

  /**
   * Check if a work order has an active agent process.
   * (v0.2.23 Wave 1.3)
   */
  hasActiveProcess(id: string): boolean {
    return this.processManager.hasActiveProcess(id);
  }

  /**
   * Get the process manager instance.
   * (v0.2.23 Wave 1.3)
   */
  getProcessManager(): AgentProcessManager {
    return this.processManager;
  }

  /**
   * Validate a status transition.
   */
  private isValidTransition(
    from: WorkOrderStatus,
    to: WorkOrderStatus
  ): boolean {
    const validTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
      [WorkOrderStatus.QUEUED]: [
        WorkOrderStatus.RUNNING,
        WorkOrderStatus.FAILED, // Allow direct failure for early errors (e.g., workspace setup failure)
        WorkOrderStatus.CANCELED,
      ],
      [WorkOrderStatus.RUNNING]: [
        WorkOrderStatus.WAITING_FOR_CHILDREN,
        WorkOrderStatus.SUCCEEDED,
        WorkOrderStatus.FAILED,
        WorkOrderStatus.CANCELED,
      ],
      [WorkOrderStatus.WAITING_FOR_CHILDREN]: [
        WorkOrderStatus.INTEGRATING,
        WorkOrderStatus.FAILED,
        WorkOrderStatus.CANCELED,
      ],
      [WorkOrderStatus.INTEGRATING]: [
        WorkOrderStatus.SUCCEEDED,
        WorkOrderStatus.FAILED,
        WorkOrderStatus.CANCELED,
      ],
      [WorkOrderStatus.SUCCEEDED]: [],
      [WorkOrderStatus.FAILED]: [
        WorkOrderStatus.RUNNING, // Allow retry from failed state
        WorkOrderStatus.FAILED, // Idempotent - allow re-failing with updated error
      ],
      [WorkOrderStatus.CANCELED]: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Purge work orders based on criteria.
   *
   * Deletes work orders matching the specified filters:
   * - statuses: Only delete work orders in these statuses
   * - olderThan: Only delete work orders created before this date
   * - dryRun: Preview what would be deleted without actually deleting
   *
   * By default (no options), this will delete ALL work orders.
   * For safety, callers should specify either statuses or olderThan.
   */
  async purge(options: PurgeOptions = {}): Promise<PurgeResult> {
    log.info({ options }, 'Purging work orders');

    const result = await this.store.purge(options);

    if (options.dryRun) {
      log.info(
        { wouldDelete: result.wouldDelete },
        'Dry run purge complete - no work orders deleted'
      );
    } else {
      log.info(
        { deletedCount: result.deletedCount, deletedIds: result.deletedIds },
        'Work orders purged'
      );
    }

    return result;
  }
}

// Default singleton instance
export const workOrderService = new WorkOrderService();
