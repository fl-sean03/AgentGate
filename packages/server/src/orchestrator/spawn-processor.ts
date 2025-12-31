/**
 * Spawn Processor - Handles agent spawning logic.
 *
 * Detects, validates, and processes spawn requests from child agents.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  type WorkOrder,
  type Workspace,
  type SubmitRequest,
} from '../types/index.js';
import {
  type SpawnRequest,
  type SpawnLimits,
  type ChildWorkOrderRequest,
  spawnRequestSchema,
  IntegrationStrategy,
} from '../types/spawn.js';
import { workOrderService } from '../control-plane/work-order-service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('spawn-processor');

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Spawn Processor class.
 *
 * Responsible for detecting spawn requests in workspaces,
 * validating them against limits, and creating child work orders.
 */
export class SpawnProcessor {
  /**
   * Check for spawn request file in workspace.
   *
   * @param workspacePath - Root path of the workspace
   * @returns Parsed spawn request or null if not found
   */
  async checkForSpawnRequest(workspacePath: string): Promise<SpawnRequest | null> {
    const spawnFilePath = join(workspacePath, '.agentgate', 'spawn-requests.json');

    try {
      const content = await fs.readFile(spawnFilePath, 'utf-8');
      const parsed = JSON.parse(content);
      const validated = spawnRequestSchema.parse(parsed);

      log.info({ workspacePath, childCount: validated.children.length }, 'Spawn request found');
      return validated;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - this is normal, not an error
        return null;
      }

      // Parse or validation error - log warning and return null
      log.warn(
        { workspacePath, error: error instanceof Error ? error.message : String(error) },
        'Failed to parse spawn request, ignoring'
      );
      return null;
    }
  }

  /**
   * Validate spawn request against limits.
   *
   * @param request - The spawn request to validate
   * @param parent - Parent work order
   * @param limits - Spawn limits to enforce
   * @returns Validation result with errors if any
   */
  validateSpawnRequest(
    request: SpawnRequest,
    parent: WorkOrder,
    limits: SpawnLimits
  ): ValidationResult {
    const errors: string[] = [];

    // Calculate current depth (parent depth + 1)
    const currentDepth = (parent.depth ?? 0) + 1;

    // Check depth limit
    if (currentDepth > limits.maxDepth) {
      errors.push(
        `Depth limit exceeded: current depth ${currentDepth} > max depth ${limits.maxDepth}`
      );
    }

    // Check children count limit
    if (request.children.length > limits.maxChildren) {
      errors.push(
        `Children count limit exceeded: ${request.children.length} > max ${limits.maxChildren}`
      );
    }

    // Check total descendants limit
    // For simplicity, we check if adding these children would exceed the limit
    // In a full implementation, we'd traverse the tree to count all descendants
    const currentChildCount = parent.childIds?.length ?? 0;
    const newTotalChildren = currentChildCount + request.children.length;

    if (newTotalChildren > limits.maxTotalDescendants) {
      errors.push(
        `Total descendants limit exceeded: ${newTotalChildren} > max ${limits.maxTotalDescendants}`
      );
    }

    // Validate parentWorkOrderId matches
    if (request.parentWorkOrderId !== parent.id) {
      errors.push(
        `Parent work order ID mismatch: request has ${request.parentWorkOrderId}, expected ${parent.id}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create child work orders from spawn request.
   *
   * @param parent - Parent work order
   * @param request - Validated spawn request
   * @param workspace - Workspace for child work orders
   * @returns Array of created work orders
   */
  async createChildWorkOrders(
    parent: WorkOrder,
    request: SpawnRequest,
    workspace: Workspace
  ): Promise<WorkOrder[]> {
    const childOrders: WorkOrder[] = [];
    const childIds: string[] = [];

    // Calculate parent depth (default to 0 if not set)
    const parentDepth = parent.depth ?? 0;
    const childDepth = parentDepth + 1;

    // Get root ID (if parent is root, use parent.id; otherwise use parent.rootId)
    const rootId = parent.rootId ?? parent.id;

    log.debug(
      { parentId: parent.id, childCount: request.children.length, depth: childDepth },
      'Creating child work orders'
    );

    // Create each child work order
    for (let i = 0; i < request.children.length; i++) {
      const childRequest = request.children[i];
      if (!childRequest) {
        continue;
      }

      // Build submit request for child
      const submitRequest: SubmitRequest = {
        taskPrompt: childRequest.taskPrompt,
        workspaceSource: parent.workspaceSource,
        agentType: parent.agentType,
        maxIterations: childRequest.maxIterations ?? parent.maxIterations,
        maxWallClockSeconds: childRequest.maxWallClockSeconds ?? parent.maxWallClockSeconds,
        gatePlanSource: parent.gatePlanSource,
        policies: parent.policies,
        // Set recursive agent fields
        parentId: parent.id,
        rootId,
        depth: childDepth,
        siblingIndex: childRequest.siblingIndex ?? i,
      };

      // Submit child work order
      const childOrder = await workOrderService.submit(submitRequest);
      childOrders.push(childOrder);
      childIds.push(childOrder.id);

      log.info(
        {
          childId: childOrder.id,
          parentId: parent.id,
          siblingIndex: childOrder.siblingIndex,
          depth: childDepth,
        },
        'Child work order created'
      );
    }

    // Update parent with child IDs
    // Note: This requires adding an update method to work order store
    // For now, we'll just set it on the parent object
    parent.childIds = [...(parent.childIds ?? []), ...childIds];

    log.info(
      { parentId: parent.id, childCount: childOrders.length },
      'All child work orders created'
    );

    return childOrders;
  }

  /**
   * Delete spawn request file from workspace.
   *
   * @param workspacePath - Root path of the workspace
   */
  async deleteSpawnRequestFile(workspacePath: string): Promise<void> {
    const spawnFilePath = join(workspacePath, '.agentgate', 'spawn-requests.json');

    try {
      await fs.unlink(spawnFilePath);
      log.debug({ workspacePath }, 'Spawn request file deleted');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist - that's fine
        return;
      }

      log.warn(
        { workspacePath, error: error instanceof Error ? error.message : String(error) },
        'Failed to delete spawn request file'
      );
    }
  }
}

/**
 * Default singleton instance.
 */
export const spawnProcessor = new SpawnProcessor();
