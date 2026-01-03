/**
 * Verify Phase Handler
 * v0.2.25: Executes verification gates
 *
 * Responsibilities:
 * - Execute verification gates (L0, L1, L2, L3)
 * - Collect gate results
 * - Persist verification report
 * - Return structured result with pass/fail status
 */

import {
  type PhaseHandler,
  type PhaseContext,
  type VerifyPhaseInput,
  type VerifyPhaseResult,
  type GateResult,
  type ValidationResult,
  Phase,
} from './types.js';
import type { VerificationReport } from '../../types/index.js';

/**
 * Verify phase handler options
 */
export interface VerifyPhaseOptions {
  /** Whether to continue after first gate failure */
  continueOnFailure?: boolean;
}

/**
 * Verify Phase Handler
 *
 * Executes verification gates against the snapshot to validate
 * that the agent's changes meet quality criteria.
 */
export class VerifyPhaseHandler
  implements PhaseHandler<VerifyPhaseInput, VerifyPhaseResult>
{
  readonly name = 'verify';
  readonly phase = Phase.VERIFY;

  private readonly options: VerifyPhaseOptions;

  constructor(options: VerifyPhaseOptions = {}) {
    this.options = {
      continueOnFailure: false,
      ...options,
    };
  }

  /**
   * Validate verify phase inputs
   */
  validate(context: PhaseContext, input: VerifyPhaseInput): ValidationResult {
    const errors: string[] = [];

    if (!input.snapshot) {
      errors.push('Snapshot is required');
    }

    if (!input.gatePlan) {
      errors.push('Gate plan is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute the verify phase
   */
  async execute(
    context: PhaseContext,
    input: VerifyPhaseInput
  ): Promise<VerifyPhaseResult> {
    const startTime = Date.now();
    const { services, taskSpec, logger } = context;

    const gateCount = this.countGates(input.gatePlan);

    logger.info(
      {
        runId: context.runId,
        iteration: context.iteration,
        gateCount,
        snapshotId: input.snapshot.id,
      },
      'Verify phase started'
    );

    try {
      // Validate inputs
      const validation = this.validate(context, input);
      if (!validation.valid) {
        return {
          success: false,
          allPassed: false,
          duration: Date.now() - startTime,
          error: {
            type: 'validation_error',
            message: `Validation failed: ${validation.errors.join(', ')}`,
          },
        };
      }

      // Check if verification should be skipped (based on gate conditions)
      const skip = taskSpec.spec.convergence?.gates?.some(
        (g: import('../../types/index.js').Gate) => g.condition?.skipIf !== undefined
      ) ?? false;

      // Execute verification
      const report = await services.verifier.verify(
        input.snapshot,
        input.gatePlan,
        {
          runId: context.runId,
          iteration: context.iteration,
          skip,
        }
      );

      // Persist verification report
      await this.persistReport(context, report);

      // Extract gate results
      const gateResults = this.extractGateResults(report);

      // Log completion
      logger.info(
        {
          runId: context.runId,
          iteration: context.iteration,
          passed: report.passed,
          l0Passed: report.l0Result?.passed,
          l1Passed: report.l1Result?.passed,
          l2Passed: report.l2Result?.passed,
          l3Passed: report.l3Result?.passed,
          duration: Date.now() - startTime,
        },
        'Verify phase completed'
      );

      return {
        success: true,
        report,
        gateResults,
        allPassed: report.passed,
        duration: Date.now() - startTime,
        metadata: {
          levelsRun: this.extractLevelsRun(report),
          totalDuration: report.totalDuration,
        },
      };
    } catch (error) {
      logger.error(
        {
          runId: context.runId,
          iteration: context.iteration,
          error,
        },
        'Verify phase failed'
      );

      return {
        success: false,
        allPassed: false,
        duration: Date.now() - startTime,
        error: {
          type: 'verification_exception',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Persist verification report to storage
   */
  private async persistReport(
    context: PhaseContext,
    report: VerificationReport
  ): Promise<string | null> {
    try {
      return await context.services.resultPersister.saveVerificationReport(
        context.runId,
        context.iteration,
        report
      );
    } catch (error) {
      context.logger.error(
        {
          runId: context.runId,
          iteration: context.iteration,
          error,
        },
        'Failed to persist verification report'
      );
      // Don't fail the phase due to persistence issues
      return null;
    }
  }

  /**
   * Count total gates in the gate plan
   */
  private countGates(gatePlan: import('../../types/index.js').GatePlan): number {
    let count = 0;
    // Count tests (L1)
    if (gatePlan.tests?.length) count += gatePlan.tests.length;
    // Count blackbox tests (L2)
    if (gatePlan.blackbox?.length) count += gatePlan.blackbox.length;
    // Count contracts (L0)
    count += gatePlan.contracts?.requiredFiles?.length ?? 0;
    count += gatePlan.contracts?.forbiddenPatterns?.length ?? 0;
    return count;
  }

  /**
   * Extract individual gate results from verification report
   */
  private extractGateResults(report: VerificationReport): GateResult[] {
    const results: GateResult[] = [];

    // L0 results
    if (report.l0Result?.checks) {
      for (const check of report.l0Result.checks) {
        results.push({
          gate: `L0:${check.name}`,
          passed: check.passed,
          duration: 0, // CheckResult doesn't have individual duration
          output: check.details,
          error: check.message,
        });
      }
    }

    // L1 results
    if (report.l1Result?.checks) {
      for (const check of report.l1Result.checks) {
        results.push({
          gate: `L1:${check.name}`,
          passed: check.passed,
          duration: 0,
          output: check.details,
          error: check.message,
        });
      }
    }

    // L2 results
    if (report.l2Result?.checks) {
      for (const check of report.l2Result.checks) {
        results.push({
          gate: `L2:${check.name}`,
          passed: check.passed,
          duration: 0,
          output: check.details,
          error: check.message,
        });
      }
    }

    // L3 results
    if (report.l3Result?.checks) {
      for (const check of report.l3Result.checks) {
        results.push({
          gate: `L3:${check.name}`,
          passed: check.passed,
          duration: 0,
          output: check.details,
          error: check.message,
        });
      }
    }

    return results;
  }

  /**
   * Extract which verification levels were run
   */
  private extractLevelsRun(report: VerificationReport): string[] {
    const levels: string[] = [];
    if (report.l0Result?.checks?.length) levels.push('L0');
    if (report.l1Result?.checks?.length) levels.push('L1');
    if (report.l2Result?.checks?.length) levels.push('L2');
    if (report.l3Result?.checks?.length) levels.push('L3');
    return levels;
  }
}
