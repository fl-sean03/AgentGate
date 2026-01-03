/**
 * Delivery Manager Types
 * v0.2.25: Pluggable delivery abstraction for VCS operations
 *
 * Supports:
 * - GitHub (primary)
 * - GitLab (planned)
 * - Local (for testing)
 */

import type { Run, Workspace, Snapshot } from '../types/index.js';
import type { IterationResult } from '../execution/phases/types.js';

/**
 * Delivery configuration
 */
export interface DeliveryConfig {
  /** Delivery type */
  type: 'github' | 'gitlab' | 'local';

  /** Whether to create PR */
  createPullRequest: boolean;

  /** Whether to run CI */
  runCI: boolean;

  /** Branch naming pattern */
  branchPattern?: string;

  /** PR title pattern */
  prTitlePattern?: string;

  /** PR body template */
  prBodyTemplate?: string;

  /** CI timeout in seconds */
  ciTimeoutSeconds?: number;

  /** CI poll interval in seconds */
  ciPollIntervalSeconds?: number;
}

/**
 * Input to delivery manager
 */
export interface DeliveryInput {
  /** Work order ID */
  workOrderId: string;

  /** Run ID */
  runId: string;

  /** Workspace with changes */
  workspace: Workspace;

  /** Final run state */
  run: Run;

  /** All iterations data */
  iterations: IterationResult[];

  /** Delivery configuration */
  config: DeliveryConfig;

  /** Final snapshot */
  snapshot?: Snapshot;
}

/**
 * PR creation result
 */
export interface PRResult {
  /** Whether PR was created successfully */
  success: boolean;

  /** PR URL */
  prUrl?: string;

  /** PR number */
  prNumber?: number;

  /** Branch name */
  branchName?: string;

  /** Error if failed */
  error?: string;
}

/**
 * CI result
 */
export interface CIResult {
  /** CI status */
  status: 'pending' | 'running' | 'passed' | 'failed' | 'timeout' | 'skipped';

  /** Workflow URL */
  workflowUrl?: string;

  /** CI duration in ms */
  durationMs?: number;

  /** Error if failed */
  error?: string;

  /** Logs URL */
  logsUrl?: string;
}

/**
 * Complete delivery result
 */
export interface DeliveryResult {
  /** Whether delivery succeeded */
  success: boolean;

  /** PR result if PR was created */
  prResult?: PRResult;

  /** CI result if CI was run */
  ciResult?: CIResult;

  /** Error message if failed */
  error?: string;

  /** Total delivery duration in ms */
  durationMs: number;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Delivery manager interface
 *
 * Implementations handle VCS-specific operations like:
 * - Pushing changes
 * - Creating pull requests
 * - Monitoring CI status
 */
export interface DeliveryManager {
  /** Manager type identifier */
  readonly type: string;

  /**
   * Deliver changes via VCS
   *
   * @param input - Delivery input with workspace and configuration
   * @returns Delivery result
   */
  deliver(input: DeliveryInput): Promise<DeliveryResult>;

  /**
   * Check if manager can handle this configuration
   *
   * @param config - Delivery configuration
   * @returns Whether this manager can handle the config
   */
  canHandle(config: DeliveryConfig): boolean;

  /**
   * Get CI status for a run
   *
   * @param runId - Run ID to check
   * @returns Current CI result
   */
  getCIStatus?(runId: string): Promise<CIResult | null>;

  /**
   * Cancel ongoing CI for a run
   *
   * @param runId - Run ID to cancel
   */
  cancelCI?(runId: string): Promise<void>;
}

/**
 * Delivery manager registry for looking up managers by type
 */
export interface DeliveryManagerRegistry {
  /**
   * Register a delivery manager
   */
  register(manager: DeliveryManager): void;

  /**
   * Get manager for a configuration
   */
  getManager(config: DeliveryConfig): DeliveryManager | null;

  /**
   * List all registered managers
   */
  listManagers(): string[];
}
