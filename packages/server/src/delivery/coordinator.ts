/**
 * Delivery Coordinator (v0.2.24)
 *
 * Coordinates delivery operations: git, PR, and notifications.
 *
 * @module delivery/coordinator
 */

import type {
  DeliverySpec,
  DeliveryResult,
  NotificationResult,
} from '../types/delivery-spec.js';
import type { ResolvedTaskSpec, Workspace } from '../types/index.js';
import type { ConvergenceResult } from '../types/convergence.js';
import { createGitHandler, type GitHandler } from './git-handler.js';
import { createPRHandler, type PRHandler } from './pr-handler.js';
import { createNotificationHandler, type NotificationHandler } from './notification-handler.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('delivery-coordinator');

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Context for delivery operations
 */
export interface DeliveryContext {
  /** Resolved task specification */
  taskSpec: ResolvedTaskSpec;
  /** Work order ID */
  workOrderId: string;
  /** Run ID */
  runId: string;
  /** Workspace (must be provided if execution succeeded) */
  workspace: Workspace;
  /** Convergence result */
  convergenceResult: ConvergenceResult;
  /** Whether execution was successful */
  executionSuccess: boolean;
  /** Error message if execution failed */
  executionError?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY COORDINATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Delivery coordinator - orchestrates delivery operations
 */
export class DeliveryCoordinator {
  private readonly gitHandler: GitHandler;
  private readonly prHandler: PRHandler;
  private readonly notificationHandler: NotificationHandler;

  constructor() {
    this.gitHandler = createGitHandler();
    this.prHandler = createPRHandler();
    this.notificationHandler = createNotificationHandler();
  }

  /**
   * Execute delivery operations
   */
  async deliver(context: DeliveryContext): Promise<DeliveryResult> {
    const { taskSpec, workOrderId, workspace, executionSuccess, executionError } = context;
    const deliverySpec = taskSpec.spec.delivery;

    log.info(
      { workOrderId, mode: deliverySpec.git.mode, executionSuccess },
      'Starting delivery operations'
    );

    // If execution failed and mode is 'local', just send notifications
    if (!executionSuccess && deliverySpec.git.mode === 'local') {
      const result: DeliveryResult = {
        success: false,
        mode: deliverySpec.git.mode,
      };
      if (executionError) {
        result.error = executionError;
      }

      // Send failure notifications
      if (deliverySpec.notifications) {
        const notifications = await this.sendNotifications(
          deliverySpec,
          taskSpec.metadata.name,
          workOrderId,
          false,
          result,
          executionError
        );
        if (notifications.length > 0) {
          result.notifications = notifications;
        }
      }

      return result;
    }

    const taskName = taskSpec.metadata.name;
    let branchName = '';

    try {
      // Execute git operations
      const gitResult = await this.gitHandler.execute({
        workspace,
        gitSpec: deliverySpec.git,
        taskName,
        workOrderId,
      });

      branchName = gitResult.branchName;

      const result: DeliveryResult = {
        success: true,
        mode: deliverySpec.git.mode,
      };

      if (gitResult.commit) {
        result.commit = gitResult.commit;
        if (!gitResult.commit.success) {
          result.success = false;
        }
      }

      if (gitResult.push) {
        result.push = gitResult.push;
        if (!gitResult.push.success) {
          result.success = false;
        }
      }

      // Create PR if mode is 'github-pr' and push succeeded
      if (
        deliverySpec.git.mode === 'github-pr' &&
        deliverySpec.pr?.create &&
        gitResult.push?.success
      ) {
        const prResult = await this.prHandler.createPR({
          prSpec: deliverySpec.pr,
          workspaceSpec: taskSpec.spec.execution.workspace,
          branchName,
          taskName,
          workOrderId,
        });

        result.pr = prResult;
        if (!prResult.success) {
          result.success = false;
        }
      }

      // Send notifications
      if (deliverySpec.notifications) {
        const notifications = await this.sendNotifications(
          deliverySpec,
          taskName,
          workOrderId,
          result.success && executionSuccess,
          result
        );
        if (notifications.length > 0) {
          result.notifications = notifications;
        }
      }

      log.info(
        { workOrderId, success: result.success, mode: result.mode },
        'Delivery operations completed'
      );

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ error, workOrderId }, 'Delivery operations failed');

      const result: DeliveryResult = {
        success: false,
        mode: deliverySpec.git.mode,
        error: errorMessage,
      };

      // Send failure notifications
      if (deliverySpec.notifications) {
        const notifications = await this.sendNotifications(
          deliverySpec,
          taskName,
          workOrderId,
          false,
          result,
          errorMessage
        );
        if (notifications.length > 0) {
          result.notifications = notifications;
        }
      }

      return result;
    }
  }

  /**
   * Send notifications
   */
  private async sendNotifications(
    deliverySpec: DeliverySpec,
    taskName: string,
    workOrderId: string,
    success: boolean,
    deliveryResult: DeliveryResult,
    error?: string
  ): Promise<NotificationResult[]> {
    if (!deliverySpec.notifications) {
      return [];
    }

    const context: Parameters<NotificationHandler['sendNotifications']>[0] = {
      notificationSpec: deliverySpec.notifications,
      taskName,
      workOrderId,
      success,
      deliveryResult,
    };

    if (error) {
      context.error = error;
    }

    return this.notificationHandler.sendNotifications(context);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new delivery coordinator
 */
export function createDeliveryCoordinator(): DeliveryCoordinator {
  return new DeliveryCoordinator();
}
