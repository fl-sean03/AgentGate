/**
 * Feedback Phase Handler
 * v0.2.25: Generates feedback from verification failures
 *
 * Responsibilities:
 * - Analyze verification failures
 * - Generate actionable feedback for agent retry
 * - Provide fallback feedback if generator fails
 */

import {
  type PhaseHandler,
  type PhaseContext,
  type FeedbackPhaseInput,
  type FeedbackPhaseResult,
  type ValidationResult,
  Phase,
} from './types.js';
import type { VerificationReport } from '../../types/index.js';

/**
 * Feedback phase handler options
 */
export interface FeedbackPhaseOptions {
  /** Maximum feedback length in characters */
  maxFeedbackLength?: number;

  /** Whether to include raw output in feedback */
  includeRawOutput?: boolean;
}

/**
 * Feedback Phase Handler
 *
 * Generates feedback from verification failures to guide
 * the agent in the next iteration.
 */
export class FeedbackPhaseHandler
  implements PhaseHandler<FeedbackPhaseInput, FeedbackPhaseResult>
{
  readonly name = 'feedback';
  readonly phase = Phase.FEEDBACK;

  private readonly options: FeedbackPhaseOptions;

  constructor(options: FeedbackPhaseOptions = {}) {
    this.options = {
      maxFeedbackLength: 10000,
      includeRawOutput: true,
      ...options,
    };
  }

  /**
   * Validate feedback phase inputs
   */
  validate(
    context: PhaseContext,
    input: FeedbackPhaseInput
  ): ValidationResult {
    const errors: string[] = [];

    if (!input.snapshot) {
      errors.push('Snapshot is required');
    }

    if (!input.verificationReport) {
      errors.push('Verification report is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute the feedback phase
   */
  async execute(
    context: PhaseContext,
    input: FeedbackPhaseInput
  ): Promise<FeedbackPhaseResult> {
    const startTime = Date.now();
    const { services, logger } = context;

    logger.info(
      {
        runId: context.runId,
        iteration: context.iteration,
        verificationPassed: input.verificationReport.passed,
      },
      'Feedback phase started'
    );

    try {
      // Validate inputs
      const validation = this.validate(context, input);
      if (!validation.valid) {
        // Return fallback feedback for validation errors
        const fallback = this.createFallbackFeedback(input.verificationReport);
        return {
          success: true,
          feedback: fallback,
          duration: Date.now() - startTime,
          metadata: {
            fallback: true,
            reason: 'validation_error',
          },
        };
      }

      // Generate feedback using the feedback generator
      const feedback = await services.feedbackGenerator.generate(
        input.snapshot,
        input.verificationReport,
        input.gatePlan,
        {
          runId: context.runId,
          iteration: context.iteration,
        }
      );

      // Truncate if too long
      const truncatedFeedback = this.truncateFeedback(feedback);

      logger.info(
        {
          runId: context.runId,
          iteration: context.iteration,
          feedbackLength: truncatedFeedback.length,
          truncated: truncatedFeedback.length < feedback.length,
        },
        'Feedback generated'
      );

      return {
        success: true,
        feedback: truncatedFeedback,
        duration: Date.now() - startTime,
        metadata: {
          originalLength: feedback.length,
          truncated: truncatedFeedback.length < feedback.length,
        },
      };
    } catch (error) {
      logger.error(
        {
          runId: context.runId,
          iteration: context.iteration,
          error,
        },
        'Feedback generation failed, using fallback'
      );

      // Provide fallback feedback on error
      const fallbackFeedback = this.createFallbackFeedback(
        input.verificationReport
      );

      return {
        success: true, // Still success - we have fallback
        feedback: fallbackFeedback,
        duration: Date.now() - startTime,
        metadata: {
          fallback: true,
          reason: error instanceof Error ? error.message : 'unknown',
        },
      };
    }
  }

  /**
   * Create fallback feedback when generator fails
   */
  private createFallbackFeedback(report: VerificationReport): string {
    const lines: string[] = [
      'Verification failed. Please review and fix the following issues:',
      '',
    ];

    // L0 failures (contracts - types, lint)
    if (report.l0Result && !report.l0Result.passed) {
      lines.push('## L0 Contract Failures (Types/Lint)');
      if (report.l0Result.checks) {
        for (const check of report.l0Result.checks) {
          if (!check.passed) {
            lines.push(`- ${check.name}: ${check.message || 'Failed'}`);
            if (this.options.includeRawOutput && check.details) {
              lines.push('```');
              lines.push(this.truncateOutput(check.details, 500));
              lines.push('```');
            }
          }
        }
      }
      lines.push('');
    }

    // L1 failures (unit tests)
    if (report.l1Result && !report.l1Result.passed) {
      lines.push('## L1 Unit Test Failures');
      if (report.l1Result.checks) {
        for (const check of report.l1Result.checks) {
          if (!check.passed) {
            lines.push(`- ${check.name}: ${check.message || 'Failed'}`);
            if (this.options.includeRawOutput && check.details) {
              lines.push('```');
              lines.push(this.truncateOutput(check.details, 500));
              lines.push('```');
            }
          }
        }
      }
      lines.push('');
    }

    // L2 failures (integration/blackbox tests)
    if (report.l2Result && !report.l2Result.passed) {
      lines.push('## L2 Integration Test Failures');
      if (report.l2Result.checks) {
        for (const check of report.l2Result.checks) {
          if (!check.passed) {
            lines.push(`- ${check.name}: ${check.message || 'Failed'}`);
            if (this.options.includeRawOutput && check.details) {
              lines.push('```');
              lines.push(this.truncateOutput(check.details, 500));
              lines.push('```');
            }
          }
        }
      }
      lines.push('');
    }

    // L3 failures (CI)
    if (report.l3Result && !report.l3Result.passed) {
      lines.push('## L3 CI Failures');
      if (report.l3Result.checks) {
        for (const check of report.l3Result.checks) {
          if (!check.passed) {
            lines.push(`- ${check.name}: ${check.message || 'Failed'}`);
          }
        }
      }
      lines.push('');
    }

    // If no specific failures found, provide generic message
    if (lines.length === 2) {
      lines.push('No specific failure details available.');
      lines.push('Please review the verification report for more information.');
    }

    return lines.join('\n');
  }

  /**
   * Truncate feedback to max length
   */
  private truncateFeedback(feedback: string): string {
    const maxLength = this.options.maxFeedbackLength ?? 10000;
    if (feedback.length <= maxLength) {
      return feedback;
    }

    const truncated = feedback.slice(0, maxLength - 100);
    return truncated + '\n\n... (feedback truncated due to length)';
  }

  /**
   * Truncate output for inclusion in feedback
   */
  private truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) {
      return output;
    }

    return output.slice(0, maxLength) + '\n... (output truncated)';
  }
}
