import { nanoid } from 'nanoid';
import {
  type WorkOrder,
  type SubmitRequest,
  type ListFilters,
  WorkOrderStatus,
  AgentType,
  GatePlanSource,
} from '../types/index.js';
import { WorkOrderStore, workOrderStore } from './work-order-store.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('work-order-service');

/**
 * Work Order Service - Manages work order lifecycle.
 *
 * Provides operations for submitting, retrieving, listing,
 * and managing work orders.
 */
export class WorkOrderService {
  constructor(private store: WorkOrderStore = workOrderStore) {}

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
   * Only queued work orders can be canceled. Running work
   * orders must be stopped through the execution layer.
   *
   * @throws Error if work order not found or not cancelable.
   */
  async cancel(id: string): Promise<void> {
    const order = await this.store.load(id);

    if (!order) {
      throw new Error(`Work order not found: ${id}`);
    }

    if (order.status !== WorkOrderStatus.QUEUED) {
      throw new Error(
        `Cannot cancel work order in status '${order.status}'. Only queued orders can be canceled.`
      );
    }

    await this.store.updateStatus(id, WorkOrderStatus.CANCELED, {
      completedAt: new Date(),
    });

    log.info({ id }, 'Work order canceled');
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
   * Validate a status transition.
   */
  private isValidTransition(
    from: WorkOrderStatus,
    to: WorkOrderStatus
  ): boolean {
    const validTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
      [WorkOrderStatus.QUEUED]: [
        WorkOrderStatus.RUNNING,
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
      [WorkOrderStatus.FAILED]: [],
      [WorkOrderStatus.CANCELED]: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }
}

// Default singleton instance
export const workOrderService = new WorkOrderService();
