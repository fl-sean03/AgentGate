/**
 * Approval Gate Runner (v0.2.24)
 *
 * Requires human approval before proceeding.
 * This is a stub implementation - actual approval would integrate
 * with GitHub PR reviews or a custom approval system.
 *
 * @module gate/runners/approval
 */

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/explicit-function-return-type, @typescript-eslint/await-thenable, no-console */


import type {
  GateResult,
  GateFailure,
  ApprovalCheck,
} from '../../types/index.js';
import type { GateContext, ValidationResult, ApprovalDetails } from '../runner-types.js';
import { BaseGateRunner } from '../base-runner.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('approval-gate-runner');

/**
 * Gate runner for human approval
 */
export class ApprovalGateRunner extends BaseGateRunner {
  readonly name = 'approval';
  readonly type = 'approval' as const;

  // In-memory approval tracking (would be persisted in production)
  private approvals: Map<string, Array<{ user: string; timestamp: Date }>> = new Map();

  /**
   * Run approval gate check
   */
  async run(context: GateContext): Promise<GateResult> {
    const startTime = Date.now();
    const gateName = context.currentGate || 'approval';

    // Get check configuration
    const gate = context.taskSpec.spec.convergence.gates.find(
      (g) => g.name === gateName
    );
    if (!gate || gate.check.type !== 'approval') {
      return this.failedResult(
        gateName,
        { error: 'Gate configuration not found' },
        [{ message: 'Gate configuration not found or invalid type' }],
        Date.now() - startTime
      );
    }

    const check = gate.check as ApprovalCheck;
    const requiredApprovers = check.approvers;
    const minApprovals = check.minApprovals ?? 1;

    log.info(
      { gateName, requiredApprovers, minApprovals },
      'Running approval gate'
    );

    const duration = Date.now() - startTime;

    try {
      // Get current approvals for this work order
      const approvalKey = `${context.workOrderId}:${gateName}`;
      const currentApprovals = this.approvals.get(approvalKey) || [];

      // Filter to only valid approvers
      const validApprovals = currentApprovals.filter(
        (a) => requiredApprovers.includes(a.user)
      );

      // Build details
      const details: ApprovalDetails = {
        type: 'approval',
        approvers: requiredApprovers,
        approvals: validApprovals.map((a) => ({
          user: a.user,
          approved: true,
          timestamp: a.timestamp,
        })),
      };

      // Check if we have enough approvals
      if (validApprovals.length >= minApprovals) {
        log.info(
          { gateName, approvalCount: validApprovals.length, minApprovals },
          'Approval gate passed'
        );
        return this.passedResult(gateName, details as unknown as Record<string, unknown>, duration);
      }

      // Not enough approvals
      const failures: GateFailure[] = [{
        message: `Awaiting approval: ${validApprovals.length}/${minApprovals} required approvals`,
        details: `Required approvers: ${requiredApprovers.join(', ')}`,
      }];

      return this.failedResult(gateName, details as unknown as Record<string, unknown>, failures, duration);
    } catch (error) {
      log.error({ error, gateName }, 'Approval gate failed with error');
      return this.failedResult(
        gateName,
        { error: error instanceof Error ? error.message : String(error) },
        [{ message: `Approval check error: ${error instanceof Error ? error.message : String(error)}` }],
        Date.now() - startTime
      );
    }
  }

  /**
   * Record an approval
   * @param workOrderId Work order ID
   * @param gateName Gate name
   * @param user User who approved
   */
  recordApproval(workOrderId: string, gateName: string, user: string): void {
    const approvalKey = `${workOrderId}:${gateName}`;
    const approvals = this.approvals.get(approvalKey) || [];

    // Check if user already approved
    if (!approvals.some((a) => a.user === user)) {
      approvals.push({ user, timestamp: new Date() });
      this.approvals.set(approvalKey, approvals);
      log.info({ workOrderId, gateName, user }, 'Approval recorded');
    }
  }

  /**
   * Revoke an approval
   * @param workOrderId Work order ID
   * @param gateName Gate name
   * @param user User who revoked
   */
  revokeApproval(workOrderId: string, gateName: string, user: string): void {
    const approvalKey = `${workOrderId}:${gateName}`;
    const approvals = this.approvals.get(approvalKey) || [];

    const filtered = approvals.filter((a) => a.user !== user);
    this.approvals.set(approvalKey, filtered);
    log.info({ workOrderId, gateName, user }, 'Approval revoked');
  }

  /**
   * Get current approvals for a gate
   * @param workOrderId Work order ID
   * @param gateName Gate name
   */
  getApprovals(workOrderId: string, gateName: string): Array<{ user: string; timestamp: Date }> {
    const approvalKey = `${workOrderId}:${gateName}`;
    return this.approvals.get(approvalKey) || [];
  }

  /**
   * Clear all approvals for a work order
   * @param workOrderId Work order ID
   */
  clearApprovals(workOrderId: string): void {
    for (const key of this.approvals.keys()) {
      if (key.startsWith(`${workOrderId}:`)) {
        this.approvals.delete(key);
      }
    }
  }

  /**
   * Validate approval gate configuration
   */
  validate(config: ApprovalCheck): ValidationResult {
    if (config.type !== 'approval') {
      return { valid: false, error: 'Invalid check type' };
    }

    if (!Array.isArray(config.approvers) || config.approvers.length === 0) {
      return { valid: false, error: 'At least one approver is required' };
    }

    if (config.minApprovals !== undefined) {
      if (typeof config.minApprovals !== 'number' || config.minApprovals < 1) {
        return { valid: false, error: 'minApprovals must be a positive integer' };
      }

      if (config.minApprovals > config.approvers.length) {
        return { valid: false, error: 'minApprovals cannot exceed number of approvers' };
      }
    }

    return { valid: true };
  }

  /**
   * Generate suggestions for approval failures
   */
  protected generateSuggestions(result: GateResult): string[] {
    const details = result.details as ApprovalDetails | undefined;
    const approvers = details?.approvers || [];

    return [
      `Request approval from: ${approvers.join(', ')}`,
      'Ensure the PR description clearly explains the changes',
      'Wait for the required number of approvals before proceeding',
    ];
  }
}

/**
 * Create an approval gate runner instance
 */
export function createApprovalGateRunner(): ApprovalGateRunner {
  return new ApprovalGateRunner();
}
