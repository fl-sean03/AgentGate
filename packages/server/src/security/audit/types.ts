/**
 * Security Audit Layer - Types
 *
 * Type definitions for audit events including enforcement decisions,
 * allowlist usage, runtime access, and detector errors.
 */

import type { Finding } from '../types.js';

// ============================================================================
// Audit Event Types
// ============================================================================

/**
 * Types of audit events that can be logged.
 */
export const AuditEventType = {
  /** Security enforcement decision */
  ENFORCEMENT: 'enforcement',
  /** Allowlist entry was applied */
  ALLOWLIST_USED: 'allowlist_used',
  /** Security policy was loaded */
  POLICY_LOADED: 'policy_loaded',
  /** Runtime file access attempt */
  RUNTIME_ACCESS: 'runtime_access',
  /** Detector threw an error */
  DETECTOR_ERROR: 'detector_error',
} as const;

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

// ============================================================================
// Base Audit Event
// ============================================================================

/**
 * Base interface for all audit events.
 */
export interface BaseAuditEvent {
  /** ISO timestamp of the event */
  timestamp: string;
  /** Type of audit event */
  type: AuditEventType;
  /** Workspace directory being scanned */
  workspaceDir: string;
  /** Associated run ID (if applicable) */
  runId?: string;
  /** Associated work order ID (if applicable) */
  workOrderId?: string;
}

// ============================================================================
// Enforcement Audit Event
// ============================================================================

/**
 * Audit event for security enforcement decisions.
 */
export interface EnforcementAuditEvent extends BaseAuditEvent {
  type: typeof AuditEventType.ENFORCEMENT;
  /** Policy name used */
  policy: string;
  /** Policy hash for verification */
  policyHash: string;
  /** Whether execution was allowed */
  allowed: boolean;
  /** Total findings count */
  findingCount: number;
  /** Blocked findings count */
  blockedCount: number;
  /** Warned findings count */
  warnedCount: number;
  /** Scan duration in milliseconds */
  duration: number;
  /** Number of files scanned */
  filesScanned: number;
  /** Findings details (if includeContent is true) */
  findings?: Finding[];
}

// ============================================================================
// Allowlist Used Event
// ============================================================================

/**
 * Audit event for when an allowlist entry is applied.
 */
export interface AllowlistUsedEvent extends BaseAuditEvent {
  type: typeof AuditEventType.ALLOWLIST_USED;
  /** Allowlist pattern that matched */
  pattern: string;
  /** File that was allowed */
  file: string;
  /** Reason from allowlist entry */
  reason: string;
  /** Who approved the allowlist entry */
  approvedBy?: string;
  /** Which detector's finding was filtered */
  detector: string;
}

// ============================================================================
// Policy Loaded Event
// ============================================================================

/**
 * Audit event for policy loading.
 */
export interface PolicyLoadedEvent extends BaseAuditEvent {
  type: typeof AuditEventType.POLICY_LOADED;
  /** Policy name */
  policy: string;
  /** Policy hash */
  policyHash: string;
  /** Source of the policy (default, profile, project) */
  source: string;
  /** Inheritance chain */
  inheritanceChain: string[];
}

// ============================================================================
// Runtime Access Event
// ============================================================================

/**
 * Audit event for runtime file access attempts.
 */
export interface RuntimeAccessEvent extends BaseAuditEvent {
  type: typeof AuditEventType.RUNTIME_ACCESS;
  /** Operation type */
  operation: 'read' | 'write' | 'delete';
  /** File path accessed */
  path: string;
  /** Whether access was allowed */
  allowed: boolean;
  /** Reason if denied */
  reason?: string;
}

// ============================================================================
// Detector Error Event
// ============================================================================

/**
 * Audit event for detector errors.
 */
export interface DetectorErrorEvent extends BaseAuditEvent {
  type: typeof AuditEventType.DETECTOR_ERROR;
  /** Detector that failed */
  detector: string;
  /** Error message */
  error: string;
  /** Stack trace (if available) */
  stack?: string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all audit event types.
 */
export type AuditEvent =
  | EnforcementAuditEvent
  | AllowlistUsedEvent
  | PolicyLoadedEvent
  | RuntimeAccessEvent
  | DetectorErrorEvent;

// ============================================================================
// Audit Logger Options
// ============================================================================

/**
 * Configuration options for the audit logger.
 */
export interface AuditLoggerOptions {
  /** Log file path (default: ~/.agentgate/audit/security.jsonl) */
  logPath?: string;
  /** Output destination */
  destination?: 'file' | 'stdout' | 'syslog';
  /** Include finding details in audit */
  includeContent?: boolean;
  /** Max log file size before rotation (default: 10MB) */
  maxFileSize?: number;
  /** Retention period in days */
  retentionDays?: number;
}

// ============================================================================
// Audit Query Options
// ============================================================================

/**
 * Options for querying audit events.
 */
export interface AuditQueryOptions {
  /** Events after this date */
  startDate?: Date;
  /** Events before this date */
  endDate?: Date;
  /** Filter by event type */
  type?: AuditEventType;
  /** Filter by run ID */
  runId?: string;
  /** Filter by work order ID */
  workOrderId?: string;
  /** Max events to return */
  limit?: number;
}
