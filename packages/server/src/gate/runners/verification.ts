/**
 * Verification Levels Gate Runner (v0.2.24)
 *
 * Runs L0-L3 verification levels as a gate check.
 *
 * @module gate/runners/verification
 */

import type {
  GateResult,
  GateFailure,
  VerificationLevelsCheck,
  LevelResult,
  VerificationLevel,
} from '../../types/index.js';
import type { GateContext, ValidationResult, VerificationDetails } from '../runner-types.js';
import { BaseGateRunner } from '../base-runner.js';
import { verify, type VerifyWithMetadataOptions } from '../../verifier/verifier.js';
import { resolveGatePlan } from '../resolver.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('verification-gate-runner');

/**
 * Gate runner for L0-L3 verification levels
 */
export class VerificationGateRunner extends BaseGateRunner {
  readonly name = 'verification-levels';
  readonly type = 'verification-levels' as const;

  /**
   * Run verification levels gate check
   */
  async run(context: GateContext): Promise<GateResult> {
    const startTime = Date.now();
    const gateName = context.currentGate || 'verification';

    // Get check configuration
    const gate = context.taskSpec.spec.convergence.gates.find(
      (g) => g.name === gateName
    );
    if (!gate || gate.check.type !== 'verification-levels') {
      return this.failedResult(
        gateName,
        { error: 'Gate configuration not found' },
        [{ message: 'Gate configuration not found or invalid type' }],
        Date.now() - startTime
      );
    }

    const check = gate.check as VerificationLevelsCheck;
    const levels = check.levels;
    const timeoutMs = check.timeout || 10 * 60 * 1000; // Default 10 minutes

    log.info({ gateName, levels, workspacePath: context.workspacePath }, 'Running verification gate');

    try {
      // Resolve gate plan from workspace
      const gatePlan = await resolveGatePlan(context.workspacePath);

      // Map level strings to VerificationLevel constants
      const skipLevels = (['L0', 'L1', 'L2', 'L3'] as const).filter(
        (l) => !levels.includes(l)
      );

      // Run verification
      const options: VerifyWithMetadataOptions = {
        snapshotPath: context.workspacePath,
        gatePlan,
        cleanRoom: false, // Use workspace directly
        timeoutMs,
        skip: skipLevels as VerificationLevel[],
        snapshotId: context.snapshot.id,
        runId: context.runId,
        iteration: context.iteration,
      };

      const report = await verify(options);
      const duration = Date.now() - startTime;

      // Build level results for details
      const levelResults: VerificationDetails['levels'] = [];
      const levelMap: Record<string, LevelResult> = {
        L0: report.l0Result,
        L1: report.l1Result,
        L2: report.l2Result,
        L3: report.l3Result,
      };

      for (const levelName of levels) {
        const result = levelMap[levelName];
        if (result) {
          const checkResults: Array<{ name: string; passed: boolean; message?: string }> = [];
          for (const c of result.checks) {
            const checkResult: { name: string; passed: boolean; message?: string } = {
              name: c.name,
              passed: c.passed,
            };
            if (c.message) {
              checkResult.message = c.message;
            }
            checkResults.push(checkResult);
          }
          levelResults.push({
            level: levelName,
            passed: result.passed,
            checks: checkResults,
            duration: result.duration,
          });
        }
      }

      if (report.passed) {
        return this.passedResult(gateName, { type: 'verification-levels', levels: levelResults }, duration);
      }

      // Collect failures from diagnostics and failed checks
      const failures: GateFailure[] = [];

      // Add diagnostics as failures
      for (const diagnostic of report.diagnostics) {
        const failure: GateFailure = {
          message: diagnostic.message,
          details: `[${diagnostic.level}] ${diagnostic.type}`,
        };
        if (diagnostic.file) {
          failure.file = diagnostic.file;
        }
        if (diagnostic.line !== null) {
          failure.line = diagnostic.line;
        }
        failures.push(failure);
      }

      // Add failed checks from each level
      for (const levelName of levels) {
        const result = levelMap[levelName];
        if (result && !result.passed) {
          for (const c of result.checks) {
            if (!c.passed) {
              const failure: GateFailure = {
                message: `[${levelName}] ${c.name}: ${c.message || 'Failed'}`,
              };
              if (c.details) {
                failure.details = c.details;
              }
              failures.push(failure);
            }
          }
        }
      }

      const gateResult = this.failedResult(
        gateName,
        { type: 'verification-levels', levels: levelResults },
        failures,
        duration
      );

      // Add level results to the result object
      gateResult.levelResults = levelResults.map((l) => ({
        level: l.level as VerificationLevel,
        passed: l.passed,
        checks: l.checks,
        duration: l.duration,
      }));

      return gateResult;
    } catch (error) {
      log.error({ error, gateName }, 'Verification gate failed with error');
      return this.failedResult(
        gateName,
        { error: error instanceof Error ? error.message : String(error) },
        [{ message: `Verification error: ${error instanceof Error ? error.message : String(error)}` }],
        Date.now() - startTime
      );
    }
  }

  /**
   * Validate verification gate configuration
   */
  validate(config: VerificationLevelsCheck): ValidationResult {
    if (config.type !== 'verification-levels') {
      return { valid: false, error: 'Invalid check type' };
    }

    if (!Array.isArray(config.levels) || config.levels.length === 0) {
      return { valid: false, error: 'At least one verification level required' };
    }

    const validLevels = ['L0', 'L1', 'L2', 'L3'];
    for (const level of config.levels) {
      if (!validLevels.includes(level)) {
        return { valid: false, error: `Invalid verification level: ${level}` };
      }
    }

    return { valid: true };
  }

  /**
   * Generate suggestions for verification failures
   */
  protected generateSuggestions(result: GateResult): string[] {
    const suggestions: string[] = [];

    if (result.levelResults) {
      for (const level of result.levelResults) {
        if (!level.passed) {
          switch (level.level) {
            case 'L0':
              suggestions.push('Fix syntax errors and contract violations');
              suggestions.push('Ensure all required files are present');
              break;
            case 'L1':
              suggestions.push('Fix failing unit tests');
              suggestions.push('Check test output for specific failures');
              break;
            case 'L2':
              suggestions.push('Fix blackbox test failures');
              suggestions.push('Verify expected outputs match actual outputs');
              break;
            case 'L3':
              suggestions.push('Fix sanity check failures');
              suggestions.push('Ensure code meets quality standards');
              break;
          }
        }
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('Review the verification report for details');
    }

    return suggestions;
  }
}

/**
 * Create a verification gate runner instance
 */
export function createVerificationGateRunner(): VerificationGateRunner {
  return new VerificationGateRunner();
}
