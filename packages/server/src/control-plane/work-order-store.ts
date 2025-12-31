import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  getWorkOrdersDir,
  getWorkOrderPath,
  ensureDir,
} from '../artifacts/paths.js';
import type { WorkOrder, WorkOrderStatus, ListFilters } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('work-order-store');

/**
 * Serializable version of WorkOrder for JSON persistence.
 * Converts Date objects to ISO strings.
 */
interface SerializedWorkOrder {
  id: string;
  taskPrompt: string;
  workspaceSource: WorkOrder['workspaceSource'];
  agentType: WorkOrder['agentType'];
  maxIterations: number;
  maxWallClockSeconds: number;
  gatePlanSource: WorkOrder['gatePlanSource'];
  policies: WorkOrder['policies'];
  createdAt: string;
  status: WorkOrderStatus;
  runId?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Serialize a WorkOrder for JSON storage.
 */
function serialize(order: WorkOrder): SerializedWorkOrder {
  const result: SerializedWorkOrder = {
    id: order.id,
    taskPrompt: order.taskPrompt,
    workspaceSource: order.workspaceSource,
    agentType: order.agentType,
    maxIterations: order.maxIterations,
    maxWallClockSeconds: order.maxWallClockSeconds,
    gatePlanSource: order.gatePlanSource,
    policies: order.policies,
    createdAt: order.createdAt.toISOString(),
    status: order.status,
  };

  if (order.runId !== undefined) {
    result.runId = order.runId;
  }
  if (order.completedAt !== undefined) {
    result.completedAt = order.completedAt.toISOString();
  }
  if (order.error !== undefined) {
    result.error = order.error;
  }

  return result;
}

/**
 * Deserialize a WorkOrder from JSON storage.
 */
function deserialize(data: SerializedWorkOrder): WorkOrder {
  const result: WorkOrder = {
    id: data.id,
    taskPrompt: data.taskPrompt,
    workspaceSource: data.workspaceSource,
    agentType: data.agentType,
    maxIterations: data.maxIterations,
    maxWallClockSeconds: data.maxWallClockSeconds,
    gatePlanSource: data.gatePlanSource,
    policies: data.policies,
    createdAt: new Date(data.createdAt),
    status: data.status,
  };

  if (data.runId !== undefined) {
    result.runId = data.runId;
  }
  if (data.completedAt !== undefined) {
    result.completedAt = new Date(data.completedAt);
  }
  if (data.error !== undefined) {
    result.error = data.error;
  }

  return result;
}

/**
 * Work Order Store - JSON file persistence for work orders.
 *
 * Stores work orders as individual JSON files in ~/.agentgate/work-orders/
 */
export class WorkOrderStore {
  private initialized = false;

  /**
   * Ensure the work orders directory exists.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await ensureDir(getWorkOrdersDir());
    this.initialized = true;
    log.debug('Work order store initialized');
  }

  /**
   * Save a work order to disk.
   */
  async save(order: WorkOrder): Promise<void> {
    await this.init();
    const path = getWorkOrderPath(order.id);
    const data = serialize(order);
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    log.debug({ id: order.id, path }, 'Work order saved');
  }

  /**
   * Load a work order from disk by ID.
   * Returns null if not found.
   */
  async load(id: string): Promise<WorkOrder | null> {
    await this.init();
    const path = getWorkOrderPath(id);

    if (!existsSync(path)) {
      log.debug({ id }, 'Work order not found');
      return null;
    }

    try {
      const content = await readFile(path, 'utf-8');
      const data = JSON.parse(content) as SerializedWorkOrder;
      return deserialize(data);
    } catch (error) {
      log.error({ id, error }, 'Failed to load work order');
      throw new Error(`Failed to load work order ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List all work orders with optional filtering.
   */
  async list(filters: ListFilters): Promise<WorkOrder[]> {
    await this.init();
    const dir = getWorkOrdersDir();

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      // Directory might not exist yet
      return [];
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const orders: WorkOrder[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await readFile(`${dir}/${file}`, 'utf-8');
        const data = JSON.parse(content) as SerializedWorkOrder;
        const order = deserialize(data);

        // Apply status filter
        if (filters.status !== undefined && order.status !== filters.status) {
          continue;
        }

        orders.push(order);
      } catch (error) {
        log.warn({ file, error }, 'Failed to load work order file');
      }
    }

    // Sort by creation date (newest first)
    orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const start = filters.offset ?? 0;
    const end = start + (filters.limit ?? 20);
    return orders.slice(start, end);
  }

  /**
   * Delete a work order from disk.
   */
  async delete(id: string): Promise<boolean> {
    await this.init();
    const path = getWorkOrderPath(id);

    if (!existsSync(path)) {
      return false;
    }

    await unlink(path);
    log.debug({ id }, 'Work order deleted');
    return true;
  }

  /**
   * Check if a work order exists.
   */
  async exists(id: string): Promise<boolean> {
    await this.init();
    const path = getWorkOrderPath(id);
    return existsSync(path);
  }

  /**
   * Update a work order's status.
   */
  async updateStatus(
    id: string,
    status: WorkOrderStatus,
    additionalFields?: Partial<Pick<WorkOrder, 'runId' | 'completedAt' | 'error'>>
  ): Promise<void> {
    const order = await this.load(id);
    if (!order) {
      throw new Error(`Work order not found: ${id}`);
    }

    order.status = status;
    if (additionalFields) {
      if (additionalFields.runId !== undefined) {
        order.runId = additionalFields.runId;
      }
      if (additionalFields.completedAt !== undefined) {
        order.completedAt = additionalFields.completedAt;
      }
      if (additionalFields.error !== undefined) {
        order.error = additionalFields.error;
      }
    }

    await this.save(order);
    log.debug({ id, status }, 'Work order status updated');
  }

  /**
   * Count work orders with optional status filter.
   */
  async count(status?: WorkOrderStatus): Promise<number> {
    await this.init();
    const dir = getWorkOrdersDir();

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return 0;
    }

    if (status === undefined) {
      return files.filter(f => f.endsWith('.json')).length;
    }

    let count = 0;
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await readFile(`${dir}/${file}`, 'utf-8');
        const data = JSON.parse(content) as SerializedWorkOrder;
        if (data.status === status) {
          count++;
        }
      } catch {
        // Skip invalid files
      }
    }

    return count;
  }
}

// Default singleton instance
export const workOrderStore = new WorkOrderStore();
