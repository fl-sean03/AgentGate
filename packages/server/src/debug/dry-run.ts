/**
 * Dry Run System
 * Simulates execution without making actual changes.
 *
 * (v0.2.27 - Thrust 19: Debug Mode & Dry Runs)
 */

import { createLogger } from '../utils/logger.js';
import type { WorkOrder } from '../types/work-order.js';
import type { GatePlan, GateCheck } from '../types/gate.js';

const log = createLogger('dry-run');

/**
 * Dry run options
 */
export interface DryRunOptions {
  /** Simulate file operations */
  simulateFiles: boolean;
  /** Simulate git operations */
  simulateGit: boolean;
  /** Simulate API calls */
  simulateApi: boolean;
  /** Simulate agent execution */
  simulateAgent: boolean;
  /** Custom simulation handlers */
  handlers?: DryRunHandlers;
}

/**
 * Custom dry run handlers
 */
export interface DryRunHandlers {
  onFileWrite?: (path: string, content: string) => void;
  onFileDelete?: (path: string) => void;
  onGitCommit?: (message: string, files: string[]) => void;
  onGitPush?: (branch: string) => void;
  onApiCall?: (method: string, url: string, body?: unknown) => unknown;
  onAgentExecute?: (task: string) => string;
}

/**
 * Dry run action types
 */
export type DryRunActionType =
  | 'file:write'
  | 'file:delete'
  | 'file:read'
  | 'git:commit'
  | 'git:push'
  | 'git:checkout'
  | 'api:call'
  | 'agent:execute'
  | 'gate:run'
  | 'verification:run';

/**
 * Recorded dry run action
 */
export interface DryRunAction {
  type: DryRunActionType;
  timestamp: Date;
  details: Record<string, unknown>;
  wouldAffect?: string[];
}

/**
 * Dry run result
 */
export interface DryRunResult {
  workOrderId: string;
  success: boolean;
  actions: DryRunAction[];
  estimatedDuration: number;
  warnings: string[];
  errors: string[];
  summary: DryRunSummary;
}

/**
 * Dry run summary
 */
export interface DryRunSummary {
  totalActions: number;
  fileWrites: number;
  fileDeletes: number;
  gitOperations: number;
  apiCalls: number;
  gateChecks: number;
}

/**
 * Dry run controller
 */
export class DryRun {
  private static instance: DryRun | null = null;
  private enabled: boolean = false;
  private options: DryRunOptions;
  private actions: DryRunAction[] = [];
  private warnings: string[] = [];
  private errors: string[] = [];

  private constructor(options: Partial<DryRunOptions> = {}) {
    this.options = {
      simulateFiles: true,
      simulateGit: true,
      simulateApi: true,
      simulateAgent: true,
      ...options,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(options?: Partial<DryRunOptions>): DryRun {
    if (!DryRun.instance) {
      DryRun.instance = new DryRun(options);
    }
    return DryRun.instance;
  }

  /**
   * Reset singleton for testing
   */
  static resetInstance(): void {
    DryRun.instance = null;
  }

  /**
   * Check if dry run is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable dry run mode
   */
  enable(options?: Partial<DryRunOptions>): void {
    this.enabled = true;
    if (options) {
      this.options = { ...this.options, ...options };
    }
    this.actions = [];
    this.warnings = [];
    this.errors = [];
    log.info({ options: this.options }, 'Dry run mode enabled');
  }

  /**
   * Disable dry run mode
   */
  disable(): void {
    this.enabled = false;
    log.info('Dry run mode disabled');
  }

  /**
   * Get current options
   */
  getOptions(): Readonly<DryRunOptions> {
    return this.options;
  }

  /**
   * Record an action
   */
  record(action: Omit<DryRunAction, 'timestamp'>): void {
    this.actions.push({
      ...action,
      timestamp: new Date(),
    });

    log.debug({ type: action.type, details: action.details }, 'Action recorded');
  }

  /**
   * Add a warning
   */
  warn(message: string): void {
    this.warnings.push(message);
    log.warn(message);
  }

  /**
   * Add an error
   */
  error(message: string): void {
    this.errors.push(message);
    log.error(message);
  }

  /**
   * Simulate file write
   */
  simulateFileWrite(path: string, content: string): boolean {
    if (!this.enabled) return false;

    this.record({
      type: 'file:write',
      details: { path, size: content.length },
      wouldAffect: [path],
    });

    this.options.handlers?.onFileWrite?.(path, content);
    return true;
  }

  /**
   * Simulate file delete
   */
  simulateFileDelete(path: string): boolean {
    if (!this.enabled) return false;

    this.record({
      type: 'file:delete',
      details: { path },
      wouldAffect: [path],
    });

    this.options.handlers?.onFileDelete?.(path);
    return true;
  }

  /**
   * Simulate git commit
   */
  simulateGitCommit(message: string, files: string[]): boolean {
    if (!this.enabled) return false;

    this.record({
      type: 'git:commit',
      details: { message, fileCount: files.length },
      wouldAffect: files,
    });

    this.options.handlers?.onGitCommit?.(message, files);
    return true;
  }

  /**
   * Simulate git push
   */
  simulateGitPush(branch: string): boolean {
    if (!this.enabled) return false;

    this.record({
      type: 'git:push',
      details: { branch },
    });

    this.options.handlers?.onGitPush?.(branch);
    return true;
  }

  /**
   * Simulate API call
   */
  simulateApiCall(method: string, url: string, body?: unknown): unknown {
    if (!this.enabled) return undefined;

    this.record({
      type: 'api:call',
      details: { method, url },
    });

    return this.options.handlers?.onApiCall?.(method, url, body);
  }

  /**
   * Simulate agent execution
   */
  simulateAgentExecute(task: string): string {
    if (!this.enabled) return '';

    this.record({
      type: 'agent:execute',
      details: { task: task.slice(0, 100) + (task.length > 100 ? '...' : '') },
    });

    return this.options.handlers?.onAgentExecute?.(task) ?? '[DRY RUN] Agent would execute task';
  }

  /**
   * Simulate gate check
   */
  simulateGateCheck(check: GateCheck): void {
    if (!this.enabled) return;

    this.record({
      type: 'gate:run',
      details: { type: check.type, config: check.config },
    });
  }

  /**
   * Get all recorded actions
   */
  getActions(): readonly DryRunAction[] {
    return this.actions;
  }

  /**
   * Get all warnings
   */
  getWarnings(): readonly string[] {
    return this.warnings;
  }

  /**
   * Get all errors
   */
  getErrors(): readonly string[] {
    return this.errors;
  }

  /**
   * Generate summary
   */
  getSummary(): DryRunSummary {
    const summary: DryRunSummary = {
      totalActions: this.actions.length,
      fileWrites: 0,
      fileDeletes: 0,
      gitOperations: 0,
      apiCalls: 0,
      gateChecks: 0,
    };

    for (const action of this.actions) {
      switch (action.type) {
        case 'file:write':
          summary.fileWrites++;
          break;
        case 'file:delete':
          summary.fileDeletes++;
          break;
        case 'git:commit':
        case 'git:push':
        case 'git:checkout':
          summary.gitOperations++;
          break;
        case 'api:call':
          summary.apiCalls++;
          break;
        case 'gate:run':
        case 'verification:run':
          summary.gateChecks++;
          break;
      }
    }

    return summary;
  }

  /**
   * Generate dry run result
   */
  getResult(workOrderId: string): DryRunResult {
    return {
      workOrderId,
      success: this.errors.length === 0,
      actions: [...this.actions],
      estimatedDuration: this.estimateDuration(),
      warnings: [...this.warnings],
      errors: [...this.errors],
      summary: this.getSummary(),
    };
  }

  /**
   * Estimate execution duration
   */
  private estimateDuration(): number {
    let duration = 0;

    for (const action of this.actions) {
      switch (action.type) {
        case 'file:write':
        case 'file:delete':
          duration += 10; // 10ms per file op
          break;
        case 'git:commit':
          duration += 500; // 500ms per commit
          break;
        case 'git:push':
          duration += 2000; // 2s per push
          break;
        case 'api:call':
          duration += 100; // 100ms per API call
          break;
        case 'agent:execute':
          duration += 60000; // 60s per agent execution
          break;
        case 'gate:run':
          duration += 5000; // 5s per gate check
          break;
      }
    }

    return duration;
  }

  /**
   * Format result for display
   */
  formatResult(workOrderId: string): string {
    const result = this.getResult(workOrderId);
    const lines = [
      '=== Dry Run Report ===',
      '',
      `Work Order: ${result.workOrderId}`,
      `Status: ${result.success ? 'Would Succeed' : 'Would Fail'}`,
      `Estimated Duration: ${Math.round(result.estimatedDuration / 1000)}s`,
      '',
      '--- Summary ---',
      `Total Actions: ${result.summary.totalActions}`,
      `File Writes: ${result.summary.fileWrites}`,
      `File Deletes: ${result.summary.fileDeletes}`,
      `Git Operations: ${result.summary.gitOperations}`,
      `API Calls: ${result.summary.apiCalls}`,
      `Gate Checks: ${result.summary.gateChecks}`,
    ];

    if (result.warnings.length > 0) {
      lines.push('', '--- Warnings ---');
      for (const warning of result.warnings) {
        lines.push(`  ⚠ ${warning}`);
      }
    }

    if (result.errors.length > 0) {
      lines.push('', '--- Errors ---');
      for (const error of result.errors) {
        lines.push(`  ✗ ${error}`);
      }
    }

    lines.push('', '--- Actions ---');
    for (const action of result.actions) {
      const time = action.timestamp.toISOString().split('T')[1].split('.')[0];
      lines.push(`  [${time}] ${action.type}: ${JSON.stringify(action.details)}`);
    }

    return lines.join('\n');
  }

  /**
   * Clear all recorded data
   */
  clear(): void {
    this.actions = [];
    this.warnings = [];
    this.errors = [];
  }
}

/**
 * Get dry run instance
 */
export function getDryRun(options?: Partial<DryRunOptions>): DryRun {
  return DryRun.getInstance(options);
}

/**
 * Check if dry run is enabled
 */
export function isDryRunEnabled(): boolean {
  return getDryRun().isEnabled();
}

/**
 * Reset dry run for testing
 */
export function resetDryRun(): void {
  DryRun.resetInstance();
}

/**
 * Analyze a work order for dry run
 */
export function analyzeWorkOrder(workOrder: WorkOrder): DryRunAction[] {
  const actions: DryRunAction[] = [];
  const now = new Date();

  // Agent execution
  actions.push({
    type: 'agent:execute',
    timestamp: now,
    details: { task: workOrder.task.slice(0, 100) },
  });

  // Gate checks
  if (workOrder.gate?.checks) {
    for (const check of workOrder.gate.checks) {
      actions.push({
        type: 'gate:run',
        timestamp: now,
        details: { type: check.type },
      });
    }
  }

  // Git operations
  actions.push({
    type: 'git:commit',
    timestamp: now,
    details: { message: 'Agent changes' },
  });

  if (workOrder.prDelivery) {
    actions.push({
      type: 'git:push',
      timestamp: now,
      details: { branch: workOrder.branch ?? 'feature-branch' },
    });
  }

  return actions;
}
