import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  getWorkOrdersDir,
  getWorkOrderPath,
  ensureDir,
} from '../artifacts/paths.js';
import type { WorkOrder, WorkOrderStatus, ListFilters } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('work-order-store');

/**
 * Result of validating a single work order file.
 */
export interface FileValidationResult {
  /** File name (e.g., 'abc123.json') */
  fileName: string;
  /** Full file path */
  filePath: string;
  /** Whether the file is valid */
  valid: boolean;
  /** Work order ID if successfully parsed */
  workOrderId?: string;
  /** Error message if validation failed */
  error?: string;
  /** Error type for categorization */
  errorType?: 'json_parse' | 'schema_invalid' | 'io_error';
}

/**
 * Result of validating all work order storage.
 */
export interface StorageValidationResult {
  /** Whether the storage directory exists */
  directoryExists: boolean;
  /** Total number of files scanned */
  totalFiles: number;
  /** Number of valid work order files */
  validCount: number;
  /** Number of invalid/corrupted files */
  invalidCount: number;
  /** Detailed results for each file */
  files: FileValidationResult[];
  /** List of corrupted file paths for cleanup */
  corruptedFiles: string[];
  /** Validation duration in milliseconds */
  durationMs: number;
}

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
  // Tree-related fields (v0.2.10)
  parentId?: string;
  childIds?: string[];
  rootId?: string;
  depth?: number;
  siblingIndex?: number;
  integrationStatus?: WorkOrder['integrationStatus'];
  integrationWorkOrderId?: string;
  // CI options (v0.2.16 / Issue #71)
  waitForCI?: boolean;
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

  // Tree-related fields (v0.2.10)
  if (order.parentId !== undefined) {
    result.parentId = order.parentId;
  }
  if (order.childIds !== undefined) {
    result.childIds = order.childIds;
  }
  if (order.rootId !== undefined) {
    result.rootId = order.rootId;
  }
  if (order.depth !== undefined) {
    result.depth = order.depth;
  }
  if (order.siblingIndex !== undefined) {
    result.siblingIndex = order.siblingIndex;
  }
  if (order.integrationStatus !== undefined) {
    result.integrationStatus = order.integrationStatus;
  }
  if (order.integrationWorkOrderId !== undefined) {
    result.integrationWorkOrderId = order.integrationWorkOrderId;
  }

  // CI options (v0.2.16 / Issue #71)
  if (order.waitForCI !== undefined) {
    result.waitForCI = order.waitForCI;
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

  // Tree-related fields (v0.2.10)
  if (data.parentId !== undefined) {
    result.parentId = data.parentId;
  }
  if (data.childIds !== undefined) {
    result.childIds = data.childIds;
  }
  if (data.rootId !== undefined) {
    result.rootId = data.rootId;
  }
  if (data.depth !== undefined) {
    result.depth = data.depth;
  }
  if (data.siblingIndex !== undefined) {
    result.siblingIndex = data.siblingIndex;
  }
  if (data.integrationStatus !== undefined) {
    result.integrationStatus = data.integrationStatus;
  }
  if (data.integrationWorkOrderId !== undefined) {
    result.integrationWorkOrderId = data.integrationWorkOrderId;
  }

  // CI options (v0.2.16 / Issue #71)
  if (data.waitForCI !== undefined) {
    result.waitForCI = data.waitForCI;
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
        const content = await readFile(join(dir, file), 'utf-8');
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
        const content = await readFile(join(dir, file), 'utf-8');
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

  /**
   * Get all work order IDs.
   * Returns a Set of all work order IDs for efficient lookup.
   * (v0.2.23 - Wave 1.6: Orphan cleanup)
   */
  async getAllIds(): Promise<Set<string>> {
    await this.init();
    const dir = getWorkOrdersDir();

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return new Set();
    }

    const ids = new Set<string>();
    for (const file of files.filter(f => f.endsWith('.json'))) {
      // Extract ID from filename (remove .json extension)
      const id = file.slice(0, -5);
      ids.add(id);
    }

    return ids;
  }

  /**
   * Validate all work order files in storage.
   * This should be called on startup to detect corrupted files.
   *
   * @returns Validation result with details about valid and invalid files
   */
  async validateStorage(): Promise<StorageValidationResult> {
    const startTime = Date.now();
    await this.init();
    const dir = getWorkOrdersDir();

    // Check if directory exists
    if (!existsSync(dir)) {
      log.debug('Work orders directory does not exist');
      return {
        directoryExists: false,
        totalFiles: 0,
        validCount: 0,
        invalidCount: 0,
        files: [],
        corruptedFiles: [],
        durationMs: Date.now() - startTime,
      };
    }

    let fileNames: string[];
    try {
      fileNames = await readdir(dir);
    } catch (error) {
      log.error({ error, dir }, 'Failed to read work orders directory');
      return {
        directoryExists: true,
        totalFiles: 0,
        validCount: 0,
        invalidCount: 0,
        files: [],
        corruptedFiles: [],
        durationMs: Date.now() - startTime,
      };
    }

    const jsonFiles = fileNames.filter(f => f.endsWith('.json'));
    const results: FileValidationResult[] = [];
    const corruptedFiles: string[] = [];

    for (const fileName of jsonFiles) {
      const filePath = join(dir, fileName);
      const result = await this.validateFile(fileName, filePath);
      results.push(result);

      if (!result.valid) {
        corruptedFiles.push(filePath);
      }
    }

    const validCount = results.filter(r => r.valid).length;
    const invalidCount = results.filter(r => !r.valid).length;

    const validationResult: StorageValidationResult = {
      directoryExists: true,
      totalFiles: jsonFiles.length,
      validCount,
      invalidCount,
      files: results,
      corruptedFiles,
      durationMs: Date.now() - startTime,
    };

    // Log summary
    if (invalidCount > 0) {
      log.warn(
        {
          totalFiles: jsonFiles.length,
          validCount,
          invalidCount,
          corruptedFiles,
        },
        'Storage validation found corrupted work order files'
      );
    } else {
      log.debug(
        { totalFiles: jsonFiles.length, validCount },
        'Storage validation completed successfully'
      );
    }

    return validationResult;
  }

  /**
   * Validate a single work order file.
   *
   * @param fileName The file name (e.g., 'abc123.json')
   * @param filePath The full file path
   * @returns Validation result for the file
   */
  private async validateFile(
    fileName: string,
    filePath: string
  ): Promise<FileValidationResult> {
    try {
      const content = await readFile(filePath, 'utf-8');

      // Try to parse JSON
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch {
        return {
          fileName,
          filePath,
          valid: false,
          error: 'Invalid JSON format',
          errorType: 'json_parse',
        };
      }

      // Validate structure (SerializedWorkOrder has required fields)
      const serialized = data as Record<string, unknown>;

      // Check required fields
      const requiredFields = [
        'id',
        'taskPrompt',
        'workspaceSource',
        'agentType',
        'maxIterations',
        'maxWallClockSeconds',
        'gatePlanSource',
        'policies',
        'createdAt',
        'status',
      ];

      const missingFields = requiredFields.filter(
        field => !(field in serialized) || serialized[field] === undefined
      );

      if (missingFields.length > 0) {
        return {
          fileName,
          filePath,
          valid: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
          errorType: 'schema_invalid',
        };
      }

      // Validate specific field types
      if (typeof serialized['id'] !== 'string') {
        return {
          fileName,
          filePath,
          valid: false,
          error: 'Field "id" must be a string',
          errorType: 'schema_invalid',
        };
      }

      if (typeof serialized['taskPrompt'] !== 'string') {
        return {
          fileName,
          filePath,
          valid: false,
          error: 'Field "taskPrompt" must be a string',
          errorType: 'schema_invalid',
        };
      }

      if (typeof serialized['createdAt'] !== 'string') {
        return {
          fileName,
          filePath,
          valid: false,
          error: 'Field "createdAt" must be a string',
          errorType: 'schema_invalid',
        };
      }

      // Validate createdAt is a valid ISO date
      // At this point we've verified serialized['createdAt'] is a string
      const createdAtDate = new Date(String(serialized['createdAt']));
      if (isNaN(createdAtDate.getTime())) {
        return {
          fileName,
          filePath,
          valid: false,
          error: 'Field "createdAt" is not a valid ISO date string',
          errorType: 'schema_invalid',
        };
      }

      // Try to deserialize to ensure full compatibility
      try {
        deserialize(data as SerializedWorkOrder);
      } catch (error) {
        return {
          fileName,
          filePath,
          valid: false,
          error: `Deserialization failed: ${error instanceof Error ? error.message : String(error)}`,
          errorType: 'schema_invalid',
        };
      }

      // At this point we've verified serialized['id'] is a string
      return {
        fileName,
        filePath,
        valid: true,
        workOrderId: String(serialized['id']),
      };
    } catch (error) {
      return {
        fileName,
        filePath,
        valid: false,
        error: `IO error: ${error instanceof Error ? error.message : String(error)}`,
        errorType: 'io_error',
      };
    }
  }

  /**
   * Get list of corrupted files from last validation.
   * This is a convenience method that runs validateStorage and returns just the corrupted files.
   */
  async getCorruptedFiles(): Promise<string[]> {
    const result = await this.validateStorage();
    return result.corruptedFiles;
  }

  /**
   * Purge work orders based on criteria.
   *
   * @param options - Purge options (statuses, age, dry run)
   * @returns Result containing count and IDs of deleted work orders
   */
  async purge(options: PurgeOptions = {}): Promise<PurgeResult> {
    await this.init();
    const dir = getWorkOrdersDir();

    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return { deletedCount: 0, deletedIds: [] };
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const matchingIds: string[] = [];

    for (const file of jsonFiles) {
      try {
        const content = await readFile(join(dir, file), 'utf-8');
        const data = JSON.parse(content) as SerializedWorkOrder;
        const order = deserialize(data);

        // Check status filter
        if (options.statuses && options.statuses.length > 0) {
          if (!options.statuses.includes(order.status)) {
            continue;
          }
        }

        // Check age filter
        if (options.olderThan) {
          if (order.createdAt >= options.olderThan) {
            continue;
          }
        }

        matchingIds.push(order.id);
      } catch (error) {
        log.warn({ file, error }, 'Failed to read work order file during purge');
      }
    }

    // Dry run - just return what would be deleted
    if (options.dryRun) {
      log.debug({ matchingIds, options }, 'Dry run purge - no files deleted');
      return {
        deletedCount: 0,
        deletedIds: [],
        wouldDelete: matchingIds.length,
      };
    }

    // Actually delete the files
    const deletedIds: string[] = [];
    for (const id of matchingIds) {
      try {
        const deleted = await this.delete(id);
        if (deleted) {
          deletedIds.push(id);
        }
      } catch (error) {
        log.warn({ id, error }, 'Failed to delete work order during purge');
      }
    }

    log.info({ deletedCount: deletedIds.length, deletedIds, options }, 'Purge completed');

    return {
      deletedCount: deletedIds.length,
      deletedIds,
    };
  }
}

/**
 * Options for purging work orders.
 */
export interface PurgeOptions {
  /** Only purge work orders in these statuses */
  statuses?: WorkOrderStatus[];
  /** Only purge work orders older than this date */
  olderThan?: Date;
  /** If true, perform a dry run without actually deleting */
  dryRun?: boolean;
}

/**
 * Result of a purge operation.
 */
export interface PurgeResult {
  /** Number of work orders deleted */
  deletedCount: number;
  /** IDs of deleted work orders */
  deletedIds: string[];
  /** Number of work orders that would have been deleted (for dry run) */
  wouldDelete?: number;
}

// Default singleton instance
export const workOrderStore = new WorkOrderStore();
