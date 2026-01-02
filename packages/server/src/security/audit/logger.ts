/**
 * Security Audit Logger
 *
 * Logs security events for compliance tracking, debugging, and forensic analysis.
 * Supports file, stdout, and syslog destinations with log rotation.
 */

import { mkdir, appendFile, stat, rename, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../../utils/logger.js';
import type { ResolvedSecurityPolicy } from '../types.js';
import type { EnforcementResult } from '../enforcement/types.js';
import {
  AuditEventType,
  type AuditEvent,
  type EnforcementAuditEvent,
  type AllowlistUsedEvent,
  type RuntimeAccessEvent,
  type DetectorErrorEvent,
  type PolicyLoadedEvent,
  type AuditLoggerOptions,
  type AuditQueryOptions,
} from './types.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_LOG_PATH = join(homedir(), '.agentgate', 'audit', 'security.jsonl');
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_RETENTION_DAYS = 90;

// ============================================================================
// Security Audit Logger
// ============================================================================

/**
 * Logger for security audit events.
 */
export class SecurityAuditLogger {
  private readonly logPath: string;
  private readonly destination: 'file' | 'stdout' | 'syslog';
  private readonly includeContent: boolean;
  private readonly maxFileSize: number;
  private readonly retentionDays: number;
  private initialized = false;

  constructor(options: AuditLoggerOptions = {}) {
    this.logPath = options.logPath ?? DEFAULT_LOG_PATH;
    this.destination = options.destination ?? 'file';
    this.includeContent = options.includeContent ?? false;
    this.maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  /**
   * Log an enforcement decision.
   */
  async logEnforcement(data: {
    result: EnforcementResult;
    runId?: string;
    workOrderId?: string;
  }): Promise<void> {
    const { result, runId, workOrderId } = data;

    const event: EnforcementAuditEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.ENFORCEMENT,
      workspaceDir: '', // Will be set from policy
      policy: result.policy.name,
      policyHash: result.policy.hash,
      allowed: result.allowed,
      findingCount: result.summary.total,
      blockedCount: result.blockedFindings.length,
      warnedCount: result.warnedFindings.length,
      duration: result.summary.scanDuration,
      filesScanned: result.summary.filesScanned,
      ...(runId !== undefined && { runId }),
      ...(workOrderId !== undefined && { workOrderId }),
      ...(this.includeContent && { findings: result.findings }),
    };

    await this.writeEvent(event);
  }

  /**
   * Log allowlist usage.
   */
  async logAllowlistUsed(data: {
    workspaceDir: string;
    pattern: string;
    file: string;
    reason: string;
    approvedBy?: string;
    detector: string;
    runId?: string;
    workOrderId?: string;
  }): Promise<void> {
    const event: AllowlistUsedEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.ALLOWLIST_USED,
      workspaceDir: data.workspaceDir,
      pattern: data.pattern,
      file: data.file,
      reason: data.reason,
      detector: data.detector,
      ...(data.runId !== undefined && { runId: data.runId }),
      ...(data.workOrderId !== undefined && { workOrderId: data.workOrderId }),
      ...(data.approvedBy !== undefined && { approvedBy: data.approvedBy }),
    };

    await this.writeEvent(event);
  }

  /**
   * Log policy loaded event.
   */
  async logPolicyLoaded(data: {
    policy: ResolvedSecurityPolicy;
    workspaceDir: string;
    runId?: string;
    workOrderId?: string;
  }): Promise<void> {
    const event: PolicyLoadedEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.POLICY_LOADED,
      workspaceDir: data.workspaceDir,
      policy: data.policy.name,
      policyHash: data.policy.hash,
      source: data.policy.source,
      inheritanceChain: data.policy.inheritanceChain,
      ...(data.runId !== undefined && { runId: data.runId }),
      ...(data.workOrderId !== undefined && { workOrderId: data.workOrderId }),
    };

    await this.writeEvent(event);
  }

  /**
   * Log runtime file access.
   */
  async logRuntimeAccess(data: {
    workspaceDir: string;
    operation: 'read' | 'write' | 'delete';
    path: string;
    allowed: boolean;
    reason?: string;
    runId?: string;
    workOrderId?: string;
  }): Promise<void> {
    const event: RuntimeAccessEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.RUNTIME_ACCESS,
      workspaceDir: data.workspaceDir,
      operation: data.operation,
      path: data.path,
      allowed: data.allowed,
      ...(data.runId !== undefined && { runId: data.runId }),
      ...(data.workOrderId !== undefined && { workOrderId: data.workOrderId }),
      ...(data.reason !== undefined && { reason: data.reason }),
    };

    await this.writeEvent(event);
  }

  /**
   * Log detector error.
   */
  async logDetectorError(data: {
    workspaceDir: string;
    detector: string;
    error: Error | string;
    runId?: string;
    workOrderId?: string;
  }): Promise<void> {
    const errorMessage = data.error instanceof Error ? data.error.message : data.error;
    const stack = data.error instanceof Error ? data.error.stack : undefined;

    const event: DetectorErrorEvent = {
      timestamp: new Date().toISOString(),
      type: AuditEventType.DETECTOR_ERROR,
      workspaceDir: data.workspaceDir,
      detector: data.detector,
      error: errorMessage,
      ...(data.runId !== undefined && { runId: data.runId }),
      ...(data.workOrderId !== undefined && { workOrderId: data.workOrderId }),
      ...(stack !== undefined && { stack }),
    };

    await this.writeEvent(event);
  }

  /**
   * Write an event to the audit log.
   */
  private async writeEvent(event: AuditEvent): Promise<void> {
    const json = JSON.stringify(event) + '\n';

    switch (this.destination) {
      case 'stdout':
        process.stdout.write(json);
        break;

      case 'syslog':
        // For syslog, we'd typically use a library like posix-syslog
        // For now, fall back to stdout with a marker
        process.stdout.write(`[SECURITY_AUDIT] ${json}`);
        break;

      case 'file':
      default:
        await this.writeToFile(json);
        break;
    }
  }

  /**
   * Write to the log file with rotation handling.
   */
  private async writeToFile(content: string): Promise<void> {
    try {
      // Ensure log directory exists
      if (!this.initialized) {
        await this.ensureLogDirectory();
        this.initialized = true;
      }

      // Check if rotation is needed
      await this.checkAndRotate();

      // Append to log file
      await appendFile(this.logPath, content, 'utf-8');
    } catch (error) {
      logger.error({ error, logPath: this.logPath }, 'Failed to write audit event');
    }
  }

  /**
   * Ensure the log directory exists with appropriate permissions.
   */
  private async ensureLogDirectory(): Promise<void> {
    const dir = dirname(this.logPath);
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      // Directory may already exist
      logger.debug({ dir, error }, 'Could not create audit directory (may already exist)');
    }
  }

  /**
   * Check if log rotation is needed and perform it.
   */
  private async checkAndRotate(): Promise<void> {
    try {
      const stats = await stat(this.logPath);
      if (stats.size >= this.maxFileSize) {
        await this.rotateLogFile();
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }

  /**
   * Rotate the log file.
   */
  private async rotateLogFile(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = this.logPath.replace('.jsonl', `.${timestamp}.jsonl`);

    try {
      await rename(this.logPath, rotatedPath);
      logger.debug({ from: this.logPath, to: rotatedPath }, 'Rotated audit log');

      // Clean up old files beyond retention
      await this.cleanupOldLogs();
    } catch (error) {
      logger.error({ error }, 'Failed to rotate audit log');
    }
  }

  /**
   * Remove log files older than retention period.
   */
  private async cleanupOldLogs(): Promise<void> {
    const dir = dirname(this.logPath);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.startsWith('security.') || !file.endsWith('.jsonl')) {
          continue;
        }
        if (file === 'security.jsonl') {
          continue;
        }

        const filePath = join(dir, file);
        try {
          const stats = await stat(filePath);
          if (stats.mtime < cutoffDate) {
            await unlink(filePath);
            logger.debug({ file: filePath }, 'Deleted old audit log');
          }
        } catch {
          // File may have been deleted by another process
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Could not cleanup old audit logs');
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default audit logger instance.
 * Configurable via environment variables.
 */
function createAuditLoggerOptions(): AuditLoggerOptions {
  const options: AuditLoggerOptions = {
    destination:
      (process.env.AGENTGATE_AUDIT_DESTINATION as 'file' | 'stdout' | 'syslog') || 'file',
    includeContent: process.env.AGENTGATE_AUDIT_CONTENT === 'true',
  };

  const logPath = process.env.AGENTGATE_AUDIT_PATH;
  if (logPath !== undefined) {
    options.logPath = logPath;
  }

  return options;
}

export const auditLogger = new SecurityAuditLogger(createAuditLoggerOptions());

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Query audit events from the log file.
 * Note: This is a simple implementation that reads the entire file.
 * For production, consider using a proper database or log aggregation service.
 */
export async function queryAuditEvents(
  options: AuditQueryOptions = {}
): Promise<AuditEvent[]> {
  const { readFile } = await import('node:fs/promises');

  const logPath = process.env.AGENTGATE_AUDIT_PATH ?? DEFAULT_LOG_PATH;
  let content: string;

  try {
    content = await readFile(logPath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.trim().split('\n').filter(Boolean);
  let events: AuditEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as AuditEvent;
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  // Apply filters
  if (options.type) {
    events = events.filter((e) => e.type === options.type);
  }

  if (options.runId) {
    events = events.filter((e) => e.runId === options.runId);
  }

  if (options.workOrderId) {
    events = events.filter((e) => e.workOrderId === options.workOrderId);
  }

  if (options.startDate) {
    const startTime = options.startDate.getTime();
    events = events.filter((e) => new Date(e.timestamp).getTime() >= startTime);
  }

  if (options.endDate) {
    const endTime = options.endDate.getTime();
    events = events.filter((e) => new Date(e.timestamp).getTime() <= endTime);
  }

  // Apply limit
  if (options.limit && options.limit > 0) {
    events = events.slice(-options.limit);
  }

  return events;
}

/**
 * Get enforcement history for a workspace.
 */
export async function getEnforcementHistory(
  workspaceDir: string,
  limit = 10
): Promise<EnforcementAuditEvent[]> {
  const events = await queryAuditEvents({
    type: AuditEventType.ENFORCEMENT,
    limit,
  });

  return events.filter(
    (e): e is EnforcementAuditEvent =>
      e.type === AuditEventType.ENFORCEMENT && e.workspaceDir === workspaceDir
  );
}

/**
 * Get all blocked runs in a date range.
 */
export async function getBlockedRuns(
  startDate: Date,
  endDate: Date
): Promise<EnforcementAuditEvent[]> {
  const events = await queryAuditEvents({
    type: AuditEventType.ENFORCEMENT,
    startDate,
    endDate,
  });

  return events.filter(
    (e): e is EnforcementAuditEvent =>
      e.type === AuditEventType.ENFORCEMENT && !e.allowed
  );
}
