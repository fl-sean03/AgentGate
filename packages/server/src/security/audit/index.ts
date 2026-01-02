/**
 * Security Audit Module
 *
 * Public API for security audit logging including event types,
 * logger, and query functions.
 */

// Types
export {
  AuditEventType,
  type AuditEvent,
  type BaseAuditEvent,
  type EnforcementAuditEvent,
  type AllowlistUsedEvent,
  type PolicyLoadedEvent,
  type RuntimeAccessEvent,
  type DetectorErrorEvent,
  type AuditLoggerOptions,
  type AuditQueryOptions,
} from './types.js';

// Logger
export {
  SecurityAuditLogger,
  auditLogger,
  queryAuditEvents,
  getEnforcementHistory,
  getBlockedRuns,
} from './logger.js';
