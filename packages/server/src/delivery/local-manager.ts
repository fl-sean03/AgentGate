/**
 * Local Delivery Manager
 * v0.2.25: Delivery manager for local/testing environments
 *
 * Skips PR creation and CI, just logs what would have been done.
 * Useful for:
 * - Local development
 * - Testing
 * - Dry-run mode
 */

import {
  type DeliveryManager,
  type DeliveryInput,
  type DeliveryResult,
  type DeliveryConfig,
} from './types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('local-delivery-manager');

/**
 * Local delivery manager options
 */
export interface LocalDeliveryManagerOptions {
  /** Whether to log detailed output */
  verbose?: boolean;

  /** Simulate delay in ms */
  simulateDelayMs?: number;
}

/**
 * Local Delivery Manager
 *
 * A no-op delivery manager that logs what would happen
 * without actually performing any VCS operations.
 */
export class LocalDeliveryManager implements DeliveryManager {
  readonly type = 'local';

  private readonly options: LocalDeliveryManagerOptions;

  constructor(options: LocalDeliveryManagerOptions = {}) {
    this.options = {
      verbose: false,
      simulateDelayMs: 0,
      ...options,
    };
  }

  /**
   * Check if this manager can handle the configuration
   */
  canHandle(config: DeliveryConfig): boolean {
    return config.type === 'local';
  }

  /**
   * "Deliver" changes locally (no-op with logging)
   */
  async deliver(input: DeliveryInput): Promise<DeliveryResult> {
    const startTime = Date.now();

    log.info(
      {
        workOrderId: input.workOrderId,
        runId: input.runId,
        workspacePath: input.workspace.rootPath,
        createPullRequest: input.config.createPullRequest,
        runCI: input.config.runCI,
      },
      'Local delivery started (dry-run mode)'
    );

    // Simulate delay if configured
    if (this.options.simulateDelayMs) {
      await this.delay(this.options.simulateDelayMs);
    }

    // Log what would have been done
    if (this.options.verbose) {
      log.info(
        {
          workOrderId: input.workOrderId,
          runId: input.runId,
          iterationCount: input.iterations.length,
          finalState: input.run.state,
          snapshotId: input.snapshot?.id,
        },
        'Delivery details'
      );

      if (input.config.createPullRequest) {
        const branchName = this.generateBranchName(input);
        log.info(
          {
            branchName,
            prTitle: this.generatePRTitle(input),
          },
          'Would create PR with'
        );
      }
    }

    const durationMs = Date.now() - startTime;

    log.info(
      {
        workOrderId: input.workOrderId,
        runId: input.runId,
        durationMs,
      },
      'Local delivery completed (no changes pushed)'
    );

    // Build result object conditionally to avoid undefined properties
    const result: DeliveryResult = {
      success: true,
      durationMs,
      metadata: {
        mode: 'local',
        dryRun: true,
      },
    };

    if (input.config.createPullRequest) {
      result.prResult = {
        success: true,
        prUrl: `local://pr/${input.runId}`,
        prNumber: 0,
        branchName: this.generateBranchName(input),
      };
    }

    if (input.config.runCI) {
      result.ciResult = {
        status: 'skipped',
      };
    }

    return result;
  }

  /**
   * Generate branch name for logging
   */
  private generateBranchName(input: DeliveryInput): string {
    const pattern =
      input.config.branchPattern ?? 'agentgate/${workOrderId}';
    return pattern.replace('${workOrderId}', input.workOrderId);
  }

  /**
   * Generate PR title for logging
   */
  private generatePRTitle(input: DeliveryInput): string {
    const pattern =
      input.config.prTitlePattern ?? '[AgentGate] ${workOrderId}';
    return pattern.replace('${workOrderId}', input.workOrderId);
  }

  /**
   * Helper to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
