/**
 * Security Policy Engine - Zod Schemas
 *
 * Zod validation schemas for the Security Policy Engine types.
 * These schemas enable runtime validation of policy configurations.
 */

import { z } from 'zod';
import { SensitivityLevel, EnforcementAction, AuditDestination } from './types.js';

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * Schema for sensitivity levels.
 */
export const sensitivityLevelSchema = z.enum([
  SensitivityLevel.INFO,
  SensitivityLevel.WARNING,
  SensitivityLevel.SENSITIVE,
  SensitivityLevel.RESTRICTED,
]);

/**
 * Schema for enforcement actions.
 */
export const enforcementActionSchema = z.enum([
  EnforcementAction.LOG,
  EnforcementAction.WARN,
  EnforcementAction.BLOCK,
  EnforcementAction.DENY,
]);

/**
 * Schema for audit destinations.
 */
export const auditDestinationSchema = z.enum([
  AuditDestination.FILE,
  AuditDestination.STDOUT,
  AuditDestination.SYSLOG,
  AuditDestination.CUSTOM,
]);

// ============================================================================
// Detector Config Schema
// ============================================================================

/**
 * Schema for detector configuration.
 */
export const detectorConfigSchema = z.object({
  type: z.string(),
  enabled: z.boolean().default(true),
  sensitivity: sensitivityLevelSchema,
  options: z.record(z.unknown()).optional(),
});

// ============================================================================
// Allowlist Entry Schema
// ============================================================================

/**
 * Schema for allowlist entries.
 */
export const allowlistEntrySchema = z.object({
  pattern: z.string().min(1),
  reason: z.string().min(1),
  approvedBy: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  detectors: z.array(z.string()).optional(),
});

// ============================================================================
// Runtime Config Schema
// ============================================================================

/**
 * Schema for runtime configuration.
 */
export const runtimeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  blockAccess: z.boolean().default(true),
  logAccess: z.boolean().default(true),
});

// ============================================================================
// Audit Config Schema
// ============================================================================

/**
 * Schema for audit configuration.
 */
export const auditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  destination: auditDestinationSchema.default(AuditDestination.FILE),
  path: z.string().optional(),
  includeContent: z.boolean().default(false),
  retentionDays: z.number().int().min(1).max(365).default(90),
});

// ============================================================================
// Enforcement Map Schema
// ============================================================================

/**
 * Schema for enforcement mapping.
 */
export const enforcementMapSchema = z.object({
  [SensitivityLevel.INFO]: enforcementActionSchema,
  [SensitivityLevel.WARNING]: enforcementActionSchema,
  [SensitivityLevel.SENSITIVE]: enforcementActionSchema,
  [SensitivityLevel.RESTRICTED]: enforcementActionSchema,
});

// ============================================================================
// Security Policy Schema
// ============================================================================

/**
 * Schema for the main security policy.
 */
export const securityPolicySchema = z.object({
  version: z.literal('1.0'),
  name: z.string().min(1),
  extends: z.string().optional(),
  detectors: z.array(detectorConfigSchema).default([]),
  enforcement: enforcementMapSchema,
  allowlist: z.array(allowlistEntrySchema).default([]),
  excludes: z.array(z.string()).default([]),
  runtime: runtimeConfigSchema.optional(),
  audit: auditConfigSchema.optional(),
});

/**
 * Schema for partial security policy (for merging).
 * All fields are optional except version.
 */
export const partialSecurityPolicySchema = z.object({
  version: z.literal('1.0').optional(),
  name: z.string().min(1).optional(),
  extends: z.string().optional(),
  detectors: z.array(detectorConfigSchema).optional(),
  enforcement: enforcementMapSchema.partial().optional(),
  allowlist: z.array(allowlistEntrySchema).optional(),
  excludes: z.array(z.string()).optional(),
  runtime: runtimeConfigSchema.partial().optional(),
  audit: auditConfigSchema.partial().optional(),
});

// ============================================================================
// Secret Pattern Schema
// ============================================================================

/**
 * Schema for secret patterns.
 */
export const secretPatternSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),
  description: z.string().min(1),
});

// ============================================================================
// Finding Schema
// ============================================================================

/**
 * Schema for security findings.
 */
export const findingSchema = z.object({
  ruleId: z.string(),
  message: z.string(),
  file: z.string(),
  line: z.number().int().positive().optional(),
  column: z.number().int().positive().optional(),
  match: z.string().optional(),
  sensitivity: sensitivityLevelSchema,
  detector: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

/** Inferred type from detector config schema */
export type DetectorConfigInput = z.input<typeof detectorConfigSchema>;

/** Inferred type from allowlist entry schema */
export type AllowlistEntryInput = z.input<typeof allowlistEntrySchema>;

/** Inferred type from security policy schema */
export type SecurityPolicyInput = z.input<typeof securityPolicySchema>;

/** Inferred type from partial security policy schema */
export type PartialSecurityPolicyInput = z.input<typeof partialSecurityPolicySchema>;
