/**
 * Base Gate Runner (v0.2.24)
 *
 * Abstract base class for gate runner implementations.
 *
 * @module gate/base-runner
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type { GateCheck, GateCheckType, GateResult, GateFeedback, GateFailure } from '../types/index.js';
import type { GateRunner, GateContext, ValidationResult, FormattedFailure } from './runner-types.js';

/**
 * Abstract base class for gate runners
 */
export abstract class BaseGateRunner implements GateRunner {
  abstract readonly name: string;
  abstract readonly type: GateCheckType;

  /**
   * Execute the gate check
   */
  abstract run(context: GateContext): Promise<GateResult>;

  /**
   * Generate feedback for failures
   */
  async generateFeedback(result: GateResult): Promise<GateFeedback> {
    const failures = result.failures || [];
    const formatted = this.formatFailuresForAgent(failures);

    return {
      summary: `Gate '${result.gate}' failed with ${failures.length} issue(s)`,
      failures: failures.map((f) => this.toFormattedFailure(f)),
      suggestions: this.generateSuggestions(result),
      formatted,
    };
  }

  /**
   * Validate gate configuration - default implementation
   */
  validate(config: GateCheck): ValidationResult {
    if (config.type !== this.type) {
      return { valid: false, error: `Expected type '${this.type}', got '${config.type}'` };
    }
    return { valid: true };
  }

  /**
   * Format failures for agent consumption
   */
  protected formatFailuresForAgent(failures: GateFailure[]): string {
    if (failures.length === 0) {
      return 'No failures recorded.';
    }

    const lines = [`## Gate Check Failed\n`];
    for (const failure of failures) {
      let line = `- ${failure.message}`;
      if (failure.file) {
        line += ` (${failure.file}`;
        if (failure.line !== undefined) {
          line += `:${failure.line}`;
        }
        line += ')';
      }
      lines.push(line);
      if (failure.details) {
        lines.push(`  > ${failure.details}`);
      }
    }
    lines.push('');
    lines.push('Please fix the issues above and try again.');

    return lines.join('\n');
  }

  /**
   * Convert GateFailure to FormattedFailure
   */
  protected toFormattedFailure(failure: GateFailure): FormattedFailure {
    const result: FormattedFailure = {
      type: this.type,
      message: failure.message,
    };
    if (failure.file) {
      result.file = failure.file;
    }
    if (failure.line !== undefined) {
      result.line = failure.line;
    }
    if (failure.command) {
      result.command = failure.command;
    }
    if (failure.details) {
      result.details = failure.details;
    }
    return result;
  }

  /**
   * Generate suggestions for fixing failures
   */
  protected generateSuggestions(result: GateResult): string[] {
    return ['Fix the issues reported above', 'Run the gate check again'];
  }

  /**
   * Helper: Parse timeout string to milliseconds
   */
  protected parseTimeout(timeout: string): number {
    const match = timeout.match(/^(\d+)([smh])$/);
    if (!match || !match[1] || !match[2]) {
      return 5 * 60 * 1000; // Default 5 minutes
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      default:
        return 5 * 60 * 1000;
    }
  }

  /**
   * Helper: Create a passed gate result
   */
  protected passedResult(name: string, details: Record<string, unknown>, duration: number): GateResult {
    return {
      gate: name,
      type: this.type,
      passed: true,
      timestamp: new Date(),
      duration,
      details,
    };
  }

  /**
   * Helper: Create a failed gate result
   */
  protected failedResult(
    name: string,
    details: Record<string, unknown>,
    failures: GateFailure[],
    duration: number
  ): GateResult {
    return {
      gate: name,
      type: this.type,
      passed: false,
      timestamp: new Date(),
      duration,
      details,
      failures,
    };
  }
}
