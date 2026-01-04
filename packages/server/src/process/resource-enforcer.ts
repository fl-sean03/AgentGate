/**
 * Resource Enforcer - Enforces resource limits on processes.
 * Monitors and enforces memory, CPU, and disk limits.
 *
 * (v0.2.27 - Thrust 10: Resource Limit Enforcement)
 */

import { createLogger } from '../utils/logger.js';
import { ResourceError } from '../errors/base.js';
import { ErrorCode } from '../errors/types.js';

const log = createLogger('resource-enforcer');

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
  /** Maximum memory in bytes (0 = unlimited) */
  maxMemoryBytes: number;
  /** Maximum CPU percentage (0-100, 0 = unlimited) */
  maxCpuPercent: number;
  /** Maximum disk space in bytes (0 = unlimited) */
  maxDiskBytes: number;
  /** Maximum number of open files (0 = unlimited) */
  maxOpenFiles: number;
  /** Maximum number of processes (0 = unlimited) */
  maxProcesses: number;
  /** Maximum execution time in milliseconds (0 = unlimited) */
  maxExecutionTimeMs: number;
}

/**
 * Current resource usage
 */
export interface ResourceUsage {
  /** Current memory usage in bytes */
  memoryBytes: number;
  /** Current CPU percentage */
  cpuPercent: number;
  /** Current disk usage in bytes */
  diskBytes: number;
  /** Current open file count */
  openFiles: number;
  /** Current process count */
  processes: number;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Timestamp of measurement */
  timestamp: number;
}

/**
 * Resource violation information
 */
export interface ResourceViolation {
  /** Resource type that was violated */
  resource: keyof ResourceLimits;
  /** Current usage */
  current: number;
  /** Limit that was exceeded */
  limit: number;
  /** Percentage over limit */
  overagePercent: number;
  /** Timestamp of violation */
  timestamp: number;
}

/**
 * Enforcement action
 */
export type EnforcementAction = 'warn' | 'throttle' | 'terminate';

/**
 * Enforcement result
 */
export interface EnforcementResult {
  /** Whether any limits were exceeded */
  exceeded: boolean;
  /** List of violations */
  violations: ResourceViolation[];
  /** Actions taken */
  actions: Array<{ action: EnforcementAction; resource: string; message: string }>;
}

/**
 * Options for resource enforcement
 */
export interface ResourceEnforcerOptions {
  /** Warning threshold as percentage of limit (default: 80) */
  warningThresholdPercent: number;
  /** Throttle threshold as percentage of limit (default: 90) */
  throttleThresholdPercent: number;
  /** Terminate threshold as percentage of limit (default: 100) */
  terminateThresholdPercent: number;
  /** Enable automatic enforcement (default: true) */
  autoEnforce: boolean;
  /** Check interval in milliseconds (default: 5000) */
  checkIntervalMs: number;
}

const DEFAULT_OPTIONS: ResourceEnforcerOptions = {
  warningThresholdPercent: 80,
  throttleThresholdPercent: 90,
  terminateThresholdPercent: 100,
  autoEnforce: true,
  checkIntervalMs: 5000,
};

const DEFAULT_LIMITS: ResourceLimits = {
  maxMemoryBytes: 0, // Unlimited
  maxCpuPercent: 0,
  maxDiskBytes: 0,
  maxOpenFiles: 0,
  maxProcesses: 0,
  maxExecutionTimeMs: 0,
};

/**
 * Resource Enforcer for a single process/sandbox
 */
export class ResourceEnforcer {
  private readonly limits: ResourceLimits;
  private readonly options: ResourceEnforcerOptions;
  private readonly startTime: number;
  private usageHistory: ResourceUsage[] = [];
  private violations: ResourceViolation[] = [];
  private checkTimer: NodeJS.Timeout | null = null;
  private onViolation?: (violation: ResourceViolation) => void;
  private onTerminate?: () => void;

  constructor(
    limits: Partial<ResourceLimits> = {},
    options: Partial<ResourceEnforcerOptions> = {}
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.startTime = Date.now();
  }

  /**
   * Set violation callback
   */
  onViolationCallback(callback: (violation: ResourceViolation) => void): void {
    this.onViolation = callback;
  }

  /**
   * Set termination callback
   */
  onTerminateCallback(callback: () => void): void {
    this.onTerminate = callback;
  }

  /**
   * Start automatic monitoring
   */
  startMonitoring(getUsage: () => Promise<ResourceUsage>): void {
    if (!this.options.autoEnforce) return;

    this.checkTimer = setInterval(async () => {
      try {
        const usage = await getUsage();
        this.checkAndEnforce(usage);
      } catch (error) {
        log.error({ error }, 'Failed to check resource usage');
      }
    }, this.options.checkIntervalMs);

    this.checkTimer.unref();
  }

  /**
   * Stop automatic monitoring
   */
  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check usage and enforce limits
   */
  checkAndEnforce(usage: ResourceUsage): EnforcementResult {
    const result: EnforcementResult = {
      exceeded: false,
      violations: [],
      actions: [],
    };

    // Add to history
    this.usageHistory.push(usage);
    if (this.usageHistory.length > 100) {
      this.usageHistory.shift();
    }

    // Check each limit
    this.checkLimit(result, 'maxMemoryBytes', usage.memoryBytes);
    this.checkLimit(result, 'maxCpuPercent', usage.cpuPercent);
    this.checkLimit(result, 'maxDiskBytes', usage.diskBytes);
    this.checkLimit(result, 'maxOpenFiles', usage.openFiles);
    this.checkLimit(result, 'maxProcesses', usage.processes);

    // Check execution time
    const executionTime = Date.now() - this.startTime;
    this.checkLimit(result, 'maxExecutionTimeMs', executionTime);

    // Log violations
    for (const violation of result.violations) {
      if (!this.violations.some(v =>
        v.resource === violation.resource &&
        Date.now() - v.timestamp < 60000
      )) {
        this.violations.push(violation);
        this.onViolation?.(violation);
        log.warn(
          { resource: violation.resource, current: violation.current, limit: violation.limit },
          'Resource limit violation'
        );
      }
    }

    // Execute terminate action if needed
    const terminateAction = result.actions.find(a => a.action === 'terminate');
    if (terminateAction) {
      this.onTerminate?.();
    }

    return result;
  }

  /**
   * Check a single limit
   */
  private checkLimit(
    result: EnforcementResult,
    limitKey: keyof ResourceLimits,
    current: number
  ): void {
    const limit = this.limits[limitKey];
    if (limit === 0) return; // Unlimited

    const percentage = (current / limit) * 100;

    if (percentage >= this.options.terminateThresholdPercent) {
      result.exceeded = true;
      result.violations.push({
        resource: limitKey,
        current,
        limit,
        overagePercent: percentage - 100,
        timestamp: Date.now(),
      });
      result.actions.push({
        action: 'terminate',
        resource: limitKey,
        message: `${limitKey} exceeded limit (${current} / ${limit})`,
      });
    } else if (percentage >= this.options.throttleThresholdPercent) {
      result.exceeded = true;
      result.violations.push({
        resource: limitKey,
        current,
        limit,
        overagePercent: 0,
        timestamp: Date.now(),
      });
      result.actions.push({
        action: 'throttle',
        resource: limitKey,
        message: `${limitKey} approaching limit (${percentage.toFixed(1)}%)`,
      });
    } else if (percentage >= this.options.warningThresholdPercent) {
      result.actions.push({
        action: 'warn',
        resource: limitKey,
        message: `${limitKey} at ${percentage.toFixed(1)}% of limit`,
      });
    }
  }

  /**
   * Get current limits
   */
  getLimits(): ResourceLimits {
    return { ...this.limits };
  }

  /**
   * Update limits
   */
  updateLimits(limits: Partial<ResourceLimits>): void {
    Object.assign(this.limits, limits);
  }

  /**
   * Get violation history
   */
  getViolations(): ResourceViolation[] {
    return [...this.violations];
  }

  /**
   * Get usage history
   */
  getUsageHistory(): ResourceUsage[] {
    return [...this.usageHistory];
  }

  /**
   * Get average usage
   */
  getAverageUsage(): Partial<ResourceUsage> | null {
    if (this.usageHistory.length === 0) return null;

    const sum = this.usageHistory.reduce(
      (acc, usage) => ({
        memoryBytes: acc.memoryBytes + usage.memoryBytes,
        cpuPercent: acc.cpuPercent + usage.cpuPercent,
        diskBytes: acc.diskBytes + usage.diskBytes,
        openFiles: acc.openFiles + usage.openFiles,
        processes: acc.processes + usage.processes,
        executionTimeMs: 0, // Not averaged
        timestamp: 0,
      }),
      {
        memoryBytes: 0,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: 0,
      }
    );

    const count = this.usageHistory.length;
    return {
      memoryBytes: sum.memoryBytes / count,
      cpuPercent: sum.cpuPercent / count,
      diskBytes: sum.diskBytes / count,
      openFiles: sum.openFiles / count,
      processes: sum.processes / count,
    };
  }

  /**
   * Get peak usage
   */
  getPeakUsage(): Partial<ResourceUsage> | null {
    if (this.usageHistory.length === 0) return null;

    return this.usageHistory.reduce((peak, usage) => ({
      memoryBytes: Math.max(peak.memoryBytes, usage.memoryBytes),
      cpuPercent: Math.max(peak.cpuPercent, usage.cpuPercent),
      diskBytes: Math.max(peak.diskBytes, usage.diskBytes),
      openFiles: Math.max(peak.openFiles, usage.openFiles),
      processes: Math.max(peak.processes, usage.processes),
      executionTimeMs: Math.max(peak.executionTimeMs, usage.executionTimeMs),
      timestamp: usage.timestamp,
    }));
  }

  /**
   * Check if within limits
   */
  isWithinLimits(usage: ResourceUsage): boolean {
    const result = this.checkAndEnforce(usage);
    return !result.exceeded;
  }

  /**
   * Create a resource error for a violation
   */
  static createViolationError(violation: ResourceViolation): ResourceError {
    const codeMap: Record<keyof ResourceLimits, ErrorCode> = {
      maxMemoryBytes: ErrorCode.MEMORY_LIMIT_EXCEEDED,
      maxCpuPercent: ErrorCode.CPU_LIMIT_EXCEEDED,
      maxDiskBytes: ErrorCode.DISK_LIMIT_EXCEEDED,
      maxOpenFiles: ErrorCode.RESOURCE_EXHAUSTED,
      maxProcesses: ErrorCode.RESOURCE_EXHAUSTED,
      maxExecutionTimeMs: ErrorCode.EXECUTION_TIMEOUT,
    };

    return new ResourceError(
      `${violation.resource} limit exceeded: ${violation.current} / ${violation.limit}`,
      codeMap[violation.resource] || ErrorCode.RESOURCE_EXHAUSTED
    );
  }

  /**
   * Get execution time
   */
  getExecutionTime(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Create a default resource enforcer
 */
export function createResourceEnforcer(
  limits?: Partial<ResourceLimits>,
  options?: Partial<ResourceEnforcerOptions>
): ResourceEnforcer {
  return new ResourceEnforcer(limits, options);
}

/**
 * Preset limits for different workload types
 */
export const RESOURCE_PRESETS = {
  light: {
    maxMemoryBytes: 256 * 1024 * 1024, // 256MB
    maxCpuPercent: 50,
    maxDiskBytes: 1024 * 1024 * 1024, // 1GB
    maxProcesses: 10,
    maxExecutionTimeMs: 5 * 60 * 1000, // 5 minutes
  } as Partial<ResourceLimits>,

  medium: {
    maxMemoryBytes: 1024 * 1024 * 1024, // 1GB
    maxCpuPercent: 80,
    maxDiskBytes: 5 * 1024 * 1024 * 1024, // 5GB
    maxProcesses: 50,
    maxExecutionTimeMs: 30 * 60 * 1000, // 30 minutes
  } as Partial<ResourceLimits>,

  heavy: {
    maxMemoryBytes: 4 * 1024 * 1024 * 1024, // 4GB
    maxCpuPercent: 100,
    maxDiskBytes: 20 * 1024 * 1024 * 1024, // 20GB
    maxProcesses: 100,
    maxExecutionTimeMs: 2 * 60 * 60 * 1000, // 2 hours
  } as Partial<ResourceLimits>,

  unlimited: {} as Partial<ResourceLimits>,
};
