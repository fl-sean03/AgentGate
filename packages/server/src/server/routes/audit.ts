/**
 * Audit Routes
 *
 * RESTful API endpoints for querying configuration audit trail data.
 * v0.2.17 - Thrust 3
 *
 * @module server/routes/audit
 */

import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import {
  auditRunIdParamsSchema,
  snapshotQueryParamsSchema,
  type ApiAuditRecord,
  type ApiConfigSnapshot,
  type ApiConfigChange,
  type AuditRunIdParams,
  type SnapshotQueryParams,
} from '../types/audit.js';
import {
  loadAuditRecord,
  type ConfigAuditRecord,
  type ConfigSnapshot,
} from '../../harness/audit-trail.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:audit');

/**
 * Map internal ConfigSnapshot to API format
 */
function mapConfigSnapshot(snapshot: ConfigSnapshot): ApiConfigSnapshot {
  // Get maxIterations - field name varies by strategy mode
  let maxIterations: number | undefined;
  const strategy = snapshot.config.loopStrategy;
  if ('maxIterations' in strategy && typeof strategy.maxIterations === 'number') {
    maxIterations = strategy.maxIterations;
  } else if ('baseIterations' in strategy && typeof strategy.baseIterations === 'number') {
    maxIterations = strategy.baseIterations;
  }

  return {
    id: snapshot.id,
    workOrderId: snapshot.workOrderId,
    runId: snapshot.runId,
    iteration: snapshot.iteration,
    snapshotAt: snapshot.timestamp instanceof Date ? snapshot.timestamp.toISOString() : String(snapshot.timestamp),
    configHash: snapshot.configHash,
    config: {
      loopStrategy: {
        mode: snapshot.config.loopStrategy.mode,
        maxIterations,
      },
      verification: {
        skipLevels: snapshot.config.verification.skipLevels ?? [],
      },
      gitOps: {
        mode: snapshot.config.gitOps.mode,
      },
      executionLimits: {
        maxWallClockSeconds: snapshot.config.executionLimits.maxWallClockSeconds,
      },
    },
  };
}

/**
 * Count total changes in an audit record
 */
function countTotalChanges(record: ConfigAuditRecord): number {
  return record.iterationSnapshots.reduce((sum, snapshot) => {
    return sum + (snapshot.changesFromPrevious?.length ?? 0);
  }, 0);
}

/**
 * Register audit API routes
 */
export function registerAuditRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/audit/runs/:runId - Get audit record summary for a run
   */
  app.get<{ Params: AuditRunIdParams }>(
    '/api/v1/audit/runs/:runId',
    async (request, reply) => {
      try {
        const paramsResult = auditRunIdParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid run ID',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { runId } = paramsResult.data;

        // Load audit record from disk
        const record = await loadAuditRecord(runId);
        if (!record) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Audit record not found for run: ${runId}`,
              undefined,
              request.id
            )
          );
        }

        const response: ApiAuditRecord = {
          runId: record.runId,
          workOrderId: record.workOrderId,
          startedAt:
            record.initialConfig.timestamp instanceof Date
              ? record.initialConfig.timestamp.toISOString()
              : String(record.initialConfig.timestamp),
          completedAt: record.finalConfig
            ? record.finalConfig.timestamp instanceof Date
              ? record.finalConfig.timestamp.toISOString()
              : String(record.finalConfig.timestamp)
            : null,
          initialConfig: mapConfigSnapshot(record.initialConfig),
          finalConfig: record.finalConfig ? mapConfigSnapshot(record.finalConfig) : null,
          snapshotCount: record.iterationSnapshots.length + (record.finalConfig ? 2 : 1), // initial + iterations + final
          changeCount: countTotalChanges(record),
          configHashChanged: record.initialConfig.configHash !== record.finalConfig?.configHash,
        };

        return reply.send(createSuccessResponse(response, request.id));
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to get audit record');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get audit record', undefined, request.id)
        );
      }
    }
  );

  /**
   * GET /api/v1/audit/runs/:runId/snapshots - Get config snapshots for a run
   */
  app.get<{ Params: AuditRunIdParams; Querystring: SnapshotQueryParams }>(
    '/api/v1/audit/runs/:runId/snapshots',
    async (request, reply) => {
      try {
        const paramsResult = auditRunIdParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid run ID',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { runId } = paramsResult.data;
        const queryResult = snapshotQueryParamsSchema.safeParse(request.query);
        const iteration = queryResult.success ? queryResult.data.iteration : undefined;

        const record = await loadAuditRecord(runId);
        if (!record) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Audit record not found for run: ${runId}`,
              undefined,
              request.id
            )
          );
        }

        // Build list of all snapshots
        let snapshots: ApiConfigSnapshot[] = [];

        // Add initial snapshot (iteration 0)
        snapshots.push(mapConfigSnapshot(record.initialConfig));

        // Add iteration snapshots
        for (const snapshot of record.iterationSnapshots) {
          snapshots.push(mapConfigSnapshot(snapshot));
        }

        // Add final snapshot if present and different from last iteration
        if (record.finalConfig && record.finalConfig.id !== record.iterationSnapshots.at(-1)?.id) {
          snapshots.push(mapConfigSnapshot(record.finalConfig));
        }

        // Filter by iteration if specified
        if (iteration !== undefined) {
          snapshots = snapshots.filter((s) => s.iteration === iteration);
        }

        return reply.send(
          createSuccessResponse(
            {
              items: snapshots,
              total: snapshots.length,
            },
            request.id
          )
        );
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to get snapshots');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get snapshots', undefined, request.id)
        );
      }
    }
  );

  /**
   * GET /api/v1/audit/runs/:runId/changes - Get config changes for a run
   */
  app.get<{ Params: AuditRunIdParams }>(
    '/api/v1/audit/runs/:runId/changes',
    async (request, reply) => {
      try {
        const paramsResult = auditRunIdParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send(
            createErrorResponse(
              ErrorCode.BAD_REQUEST,
              'Invalid run ID',
              { errors: paramsResult.error.errors },
              request.id
            )
          );
        }

        const { runId } = paramsResult.data;

        const record = await loadAuditRecord(runId);
        if (!record) {
          return reply.status(404).send(
            createErrorResponse(
              ErrorCode.NOT_FOUND,
              `Audit record not found for run: ${runId}`,
              undefined,
              request.id
            )
          );
        }

        // Collect all changes from all snapshots
        const changes: ApiConfigChange[] = [];
        const changedPaths = new Set<string>();

        for (const snapshot of record.iterationSnapshots) {
          if (snapshot.changesFromPrevious) {
            for (const change of snapshot.changesFromPrevious) {
              changes.push({
                iteration: snapshot.iteration,
                path: change.path,
                previousValue: change.previousValue,
                newValue: change.newValue,
                changedAt:
                  snapshot.timestamp instanceof Date
                    ? snapshot.timestamp.toISOString()
                    : String(snapshot.timestamp),
              });
              changedPaths.add(change.path);
            }
          }
        }

        return reply.send(
          createSuccessResponse(
            {
              items: changes,
              total: changes.length,
              summary: {
                totalChanges: changes.length,
                changedPaths: Array.from(changedPaths),
              },
            },
            request.id
          )
        );
      } catch (error) {
        logger.error({ err: error, requestId: request.id }, 'Failed to get changes');
        return reply.status(500).send(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to get changes', undefined, request.id)
        );
      }
    }
  );
}
