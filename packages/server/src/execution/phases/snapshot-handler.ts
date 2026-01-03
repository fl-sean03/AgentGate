/**
 * Snapshot Phase Handler
 * v0.2.25: Captures git state after agent execution
 *
 * Responsibilities:
 * - Capture workspace state (git diff, changed files)
 * - Create snapshot record
 * - Handle snapshot failures with proper error classification
 */

import {
  type PhaseHandler,
  type PhaseContext,
  type SnapshotPhaseInput,
  type SnapshotPhaseResult,
  type ValidationResult,
  Phase,
} from './types.js';

/**
 * Snapshot phase handler options
 */
export interface SnapshotPhaseOptions {
  /** Whether to include full file contents in snapshot */
  includeFileContents?: boolean;
}

/**
 * Snapshot Phase Handler
 *
 * Captures the state of the workspace after agent execution,
 * including git diff and file changes.
 */
export class SnapshotPhaseHandler
  implements PhaseHandler<SnapshotPhaseInput, SnapshotPhaseResult>
{
  readonly name = 'snapshot';
  readonly phase = Phase.SNAPSHOT;

  private readonly options: SnapshotPhaseOptions;

  constructor(options: SnapshotPhaseOptions = {}) {
    this.options = options;
  }

  /**
   * Validate snapshot phase inputs
   */
  validate(
    context: PhaseContext,
    input: SnapshotPhaseInput
  ): ValidationResult {
    const errors: string[] = [];

    if (!input.beforeState) {
      errors.push('Before state is required');
    }

    if (!context.workspace?.rootPath) {
      errors.push('Workspace path is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute the snapshot phase
   */
  async execute(
    context: PhaseContext,
    input: SnapshotPhaseInput
  ): Promise<SnapshotPhaseResult> {
    const startTime = Date.now();
    const { services, workspace, taskSpec, logger } = context;

    logger.info(
      {
        runId: context.runId,
        iteration: context.iteration,
        workspacePath: workspace.rootPath,
      },
      'Snapshot phase started'
    );

    try {
      // Validate inputs
      const validation = this.validate(context, input);
      if (!validation.valid) {
        return {
          success: false,
          duration: Date.now() - startTime,
          error: {
            type: 'validation_error',
            message: `Validation failed: ${validation.errors.join(', ')}`,
          },
        };
      }

      // Capture snapshot
      const snapshot = await services.snapshotter.capture(
        workspace.rootPath,
        input.beforeState,
        {
          runId: context.runId,
          iteration: context.iteration,
          taskPrompt: taskSpec.spec.goal.prompt,
        }
      );

      // Log snapshot details
      logger.info(
        {
          runId: context.runId,
          iteration: context.iteration,
          snapshotId: snapshot.id,
          filesChanged: snapshot.filesChanged,
          beforeSha: snapshot.beforeSha,
          afterSha: snapshot.afterSha,
        },
        'Snapshot captured'
      );

      // Persist snapshot
      await this.persistSnapshot(context, snapshot);

      return {
        success: true,
        snapshot,
        duration: Date.now() - startTime,
        metadata: {
          filesChanged: snapshot.filesChanged,
          beforeSha: snapshot.beforeSha,
          afterSha: snapshot.afterSha,
        },
      };
    } catch (error) {
      logger.error(
        {
          runId: context.runId,
          iteration: context.iteration,
          error,
        },
        'Snapshot phase failed'
      );

      return {
        success: false,
        duration: Date.now() - startTime,
        error: {
          type: 'snapshot_failed',
          message: error instanceof Error ? error.message : String(error),
          details: {
            workspacePath: workspace.rootPath,
          },
        },
      };
    }
  }

  /**
   * Persist snapshot to storage
   */
  private async persistSnapshot(
    context: PhaseContext,
    snapshot: import('../../types/index.js').Snapshot
  ): Promise<string | null> {
    try {
      return await context.services.resultPersister.saveSnapshot(
        context.runId,
        context.iteration,
        snapshot
      );
    } catch (error) {
      context.logger.error(
        {
          runId: context.runId,
          iteration: context.iteration,
          error,
        },
        'Failed to persist snapshot'
      );
      // Don't fail the phase due to persistence issues
      return null;
    }
  }
}
