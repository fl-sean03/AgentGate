/**
 * Audit API Types
 *
 * Types and schemas for the Audit Trail API endpoints.
 * v0.2.17 - Thrust 3
 *
 * @module server/types/audit
 */

import { z } from 'zod';

/**
 * Config snapshot in API response format
 */
export const apiConfigSnapshotSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string(),
  iteration: z.number(),
  snapshotAt: z.string(), // ISO date
  configHash: z.string(),
  config: z.object({
    loopStrategy: z.object({
      mode: z.string(),
      maxIterations: z.number().optional(),
    }),
    verification: z.object({
      skipLevels: z.array(z.string()),
    }),
    gitOps: z.object({
      mode: z.string(),
    }),
    executionLimits: z.object({
      maxWallClockSeconds: z.number(),
    }),
  }),
});

export type ApiConfigSnapshot = z.infer<typeof apiConfigSnapshotSchema>;

/**
 * Config change record in API response format
 */
export const apiConfigChangeSchema = z.object({
  iteration: z.number(),
  path: z.string(), // Dot-notation path to changed field
  previousValue: z.unknown(),
  newValue: z.unknown(),
  changedAt: z.string(), // ISO date
});

export type ApiConfigChange = z.infer<typeof apiConfigChangeSchema>;

/**
 * Full audit record for a run in API response format
 */
export const apiAuditRecordSchema = z.object({
  runId: z.string(),
  workOrderId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  initialConfig: apiConfigSnapshotSchema,
  finalConfig: apiConfigSnapshotSchema.nullable(),
  snapshotCount: z.number(),
  changeCount: z.number(),
  configHashChanged: z.boolean(),
});

export type ApiAuditRecord = z.infer<typeof apiAuditRecordSchema>;

/**
 * Run ID URL parameter
 */
export const auditRunIdParamsSchema = z.object({
  runId: z.string().min(1),
});

export type AuditRunIdParams = z.infer<typeof auditRunIdParamsSchema>;

/**
 * Snapshot query parameters
 */
export const snapshotQueryParamsSchema = z.object({
  iteration: z.coerce.number().int().min(0).optional(),
});

export type SnapshotQueryParams = z.infer<typeof snapshotQueryParamsSchema>;

/**
 * Changes response summary
 */
export const changesSummarySchema = z.object({
  totalChanges: z.number(),
  changedPaths: z.array(z.string()),
});

export type ChangesSummary = z.infer<typeof changesSummarySchema>;

/**
 * Work order audit summary (for work order audit endpoint)
 */
export const workOrderAuditRunSchema = z.object({
  runId: z.string(),
  iteration: z.number(),
  startedAt: z.string(),
  configHash: z.string(),
  changesCount: z.number(),
});

export type WorkOrderAuditRun = z.infer<typeof workOrderAuditRunSchema>;
