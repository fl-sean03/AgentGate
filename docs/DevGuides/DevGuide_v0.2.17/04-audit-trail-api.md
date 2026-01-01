# 04: Audit Trail API

This document covers Thrust 3: implementing API endpoints for querying configuration audit trail data.

---

## Thrust 3: Audit Trail API

### 3.1 Objective

Expose the v0.2.16 audit trail system via read-only API endpoints, allowing external systems to query configuration history and changes for debugging and compliance.

### 3.2 Background

v0.2.16 introduced the `AuditTrail` system that captures config snapshots at run start, iteration changes, and run completion. This data is stored in `~/.agentgate/audit/runs/{runId}/`. This thrust exposes this data via API.

### 3.3 Subtasks

#### 3.3.1 Create Audit API Types

Create `packages/server/src/server/types/audit.ts`:

```typescript
import { z } from 'zod';

// Config snapshot (matches v0.2.16 ConfigSnapshot)
export const configSnapshotSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  runId: z.string(),
  iteration: z.number(),
  snapshotAt: z.string(), // ISO date
  configHash: z.string(),
  config: z.object({
    loopStrategy: z.object({
      mode: z.string(),
      maxIterations: z.number(),
    }),
    verification: z.object({
      waitForCI: z.boolean(),
      skipLevels: z.array(z.string()),
    }),
    gitOps: z.object({
      mode: z.string(),
    }),
    limits: z.object({
      maxWallClockSeconds: z.number(),
    }),
  }),
});

export type ConfigSnapshot = z.infer<typeof configSnapshotSchema>;

// Config change record
export const configChangeSchema = z.object({
  iteration: z.number(),
  path: z.string(),        // Dot-notation path to changed field
  previousValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string(),
  initiator: z.enum(['user', 'strategy', 'system']),
  changedAt: z.string(),   // ISO date
});

export type ConfigChange = z.infer<typeof configChangeSchema>;

// Full audit record for a run
export const auditRecordSchema = z.object({
  runId: z.string(),
  workOrderId: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  initialConfig: configSnapshotSchema,
  finalConfig: configSnapshotSchema.nullable(),
  snapshotCount: z.number(),
  changeCount: z.number(),
  configHashChanged: z.boolean(),
});

export type AuditRecord = z.infer<typeof auditRecordSchema>;

// Query parameters
export const auditQueryParamsSchema = z.object({
  runId: z.string().optional(),
  workOrderId: z.string().optional(),
  startDate: z.string().optional(),  // ISO date
  endDate: z.string().optional(),    // ISO date
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AuditQueryParams = z.infer<typeof auditQueryParamsSchema>;

// Run ID params
export const auditRunIdParamsSchema = z.object({
  runId: z.string(),
});

export type AuditRunIdParams = z.infer<typeof auditRunIdParamsSchema>;

// Snapshot query params
export const snapshotQueryParamsSchema = z.object({
  iteration: z.coerce.number().int().min(0).optional(),
});

export type SnapshotQueryParams = z.infer<typeof snapshotQueryParamsSchema>;
```

#### 3.3.2 Create Audit Routes

Create `packages/server/src/server/routes/audit.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCode } from '../types.js';
import {
  auditRunIdParamsSchema,
  snapshotQueryParamsSchema,
  type AuditRecord,
  type ConfigSnapshot,
  type ConfigChange,
  type AuditRunIdParams,
  type SnapshotQueryParams,
} from '../types/audit.js';
import { auditStore } from '../../harness/audit-trail.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('routes:audit');

export function registerAuditRoutes(app: FastifyInstance): void {
  // Implementation in subtasks below
}
```

#### 3.3.3 Implement GET /api/v1/audit/runs/:runId

Get audit record summary for a run:

```typescript
app.get<{ Params: AuditRunIdParams }>(
  '/api/v1/audit/runs/:runId',
  async (request, reply) => {
    try {
      const paramsResult = auditRunIdParamsSchema.safeParse(request.params);
      if (!paramsResult.success) {
        return reply.status(400).send(createErrorResponse(
          ErrorCode.BAD_REQUEST,
          'Invalid run ID',
          { errors: paramsResult.error.errors },
          request.id
        ));
      }

      const { runId } = paramsResult.data;

      // Load audit record from store
      const record = await auditStore.getAuditRecord(runId);
      if (!record) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Audit record not found for run: ${runId}`,
          undefined,
          request.id
        ));
      }

      const response: AuditRecord = {
        runId: record.runId,
        workOrderId: record.workOrderId,
        startedAt: record.initialConfig.snapshotAt.toISOString(),
        completedAt: record.finalConfig?.snapshotAt.toISOString() ?? null,
        initialConfig: mapConfigSnapshot(record.initialConfig),
        finalConfig: record.finalConfig ? mapConfigSnapshot(record.finalConfig) : null,
        snapshotCount: record.iterationSnapshots.length + 2, // initial + iterations + final
        changeCount: countTotalChanges(record),
        configHashChanged: record.initialConfig.configHash !== record.finalConfig?.configHash,
      };

      return reply.send(createSuccessResponse(response, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get audit record');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get audit record',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 3.3.4 Implement GET /api/v1/audit/runs/:runId/snapshots

Get config snapshots for a run:

```typescript
app.get<{ Params: AuditRunIdParams; Querystring: SnapshotQueryParams }>(
  '/api/v1/audit/runs/:runId/snapshots',
  async (request, reply) => {
    try {
      const { runId } = auditRunIdParamsSchema.parse(request.params);
      const queryResult = snapshotQueryParamsSchema.safeParse(request.query);
      const { iteration } = queryResult.success ? queryResult.data : {};

      const record = await auditStore.getAuditRecord(runId);
      if (!record) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Audit record not found for run: ${runId}`,
          undefined,
          request.id
        ));
      }

      // Build list of all snapshots
      let snapshots: ConfigSnapshot[] = [];

      // Add initial snapshot (iteration 0)
      snapshots.push(mapConfigSnapshot(record.initialConfig));

      // Add iteration snapshots
      for (const snapshot of record.iterationSnapshots) {
        snapshots.push(mapConfigSnapshot(snapshot));
      }

      // Add final snapshot if present
      if (record.finalConfig) {
        snapshots.push(mapConfigSnapshot(record.finalConfig));
      }

      // Filter by iteration if specified
      if (iteration !== undefined) {
        snapshots = snapshots.filter(s => s.iteration === iteration);
      }

      return reply.send(createSuccessResponse({
        items: snapshots,
        total: snapshots.length,
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get snapshots');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get snapshots',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 3.3.5 Implement GET /api/v1/audit/runs/:runId/changes

Get config changes for a run:

```typescript
app.get<{ Params: AuditRunIdParams }>(
  '/api/v1/audit/runs/:runId/changes',
  async (request, reply) => {
    try {
      const { runId } = auditRunIdParamsSchema.parse(request.params);

      const record = await auditStore.getAuditRecord(runId);
      if (!record) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Audit record not found for run: ${runId}`,
          undefined,
          request.id
        ));
      }

      // Collect all changes from all snapshots
      const changes: ConfigChange[] = [];

      for (const snapshot of record.iterationSnapshots) {
        if (snapshot.changesFromPrevious) {
          for (const change of snapshot.changesFromPrevious) {
            changes.push({
              iteration: snapshot.iteration,
              path: change.path,
              previousValue: change.previousValue,
              newValue: change.newValue,
              reason: change.reason,
              initiator: change.initiator,
              changedAt: snapshot.snapshotAt.toISOString(),
            });
          }
        }
      }

      return reply.send(createSuccessResponse({
        items: changes,
        total: changes.length,
        summary: {
          totalChanges: changes.length,
          byInitiator: {
            user: changes.filter(c => c.initiator === 'user').length,
            strategy: changes.filter(c => c.initiator === 'strategy').length,
            system: changes.filter(c => c.initiator === 'system').length,
          },
        },
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get changes');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get changes',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 3.3.6 Implement GET /api/v1/work-orders/:id/audit

Add audit endpoint to work orders route for convenience:

```typescript
// In packages/server/src/server/routes/work-orders.ts

app.get<{ Params: WorkOrderIdParams }>(
  '/api/v1/work-orders/:id/audit',
  async (request, reply) => {
    try {
      const { id } = workOrderIdParamsSchema.parse(request.params);

      // Get work order
      const order = await workOrderService.get(id);
      if (!order) {
        return reply.status(404).send(createErrorResponse(
          ErrorCode.NOT_FOUND,
          `Work order not found: ${id}`,
          undefined,
          request.id
        ));
      }

      // Get all runs for this work order
      const runs = await getRunsForWorkOrder(id);

      // Get audit records for all runs
      const auditRecords = await Promise.all(
        runs.map(async (run) => {
          const record = await auditStore.getAuditRecord(run.id);
          return record ? {
            runId: run.id,
            iteration: run.iteration,
            startedAt: record.initialConfig.snapshotAt.toISOString(),
            configHash: record.initialConfig.configHash,
            changesCount: countTotalChanges(record),
          } : null;
        })
      );

      return reply.send(createSuccessResponse({
        workOrderId: id,
        runs: auditRecords.filter(Boolean),
      }, request.id));
    } catch (error) {
      logger.error({ err: error }, 'Failed to get work order audit');
      return reply.status(500).send(createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Failed to get work order audit',
        undefined,
        request.id
      ));
    }
  }
);
```

#### 3.3.7 Helper Functions

```typescript
function mapConfigSnapshot(snapshot: InternalConfigSnapshot): ConfigSnapshot {
  return {
    id: snapshot.id,
    workOrderId: snapshot.workOrderId,
    runId: snapshot.runId,
    iteration: snapshot.iteration,
    snapshotAt: snapshot.snapshotAt.toISOString(),
    configHash: snapshot.configHash,
    config: {
      loopStrategy: {
        mode: snapshot.config.loopStrategy.mode,
        maxIterations: snapshot.config.loopStrategy.maxIterations,
      },
      verification: {
        waitForCI: snapshot.config.verification.waitForCI,
        skipLevels: snapshot.config.verification.skipLevels ?? [],
      },
      gitOps: {
        mode: snapshot.config.gitOps.mode,
      },
      limits: {
        maxWallClockSeconds: snapshot.config.limits.maxWallClockSeconds,
      },
    },
  };
}

function countTotalChanges(record: InternalAuditRecord): number {
  return record.iterationSnapshots.reduce((sum, snapshot) => {
    return sum + (snapshot.changesFromPrevious?.length ?? 0);
  }, 0);
}
```

#### 3.3.8 Register Routes

Update `packages/server/src/server/index.ts`:

```typescript
import { registerAuditRoutes } from './routes/audit.js';

// In server setup
registerAuditRoutes(app);
```

### 3.4 Verification Steps

1. Test get audit record for valid run
2. Test 404 for non-existent run
3. Test get snapshots returns all snapshots
4. Test get snapshots with iteration filter
5. Test get changes returns all changes
6. Test work order audit endpoint
7. Verify response matches schema

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/types/audit.ts` | Created |
| `packages/server/src/server/routes/audit.ts` | Created |
| `packages/server/src/server/routes/work-orders.ts` | Modified - add audit endpoint |
| `packages/server/src/server/index.ts` | Modified - register routes |
| `packages/server/test/server/audit.test.ts` | Created |

---

## API Reference

### Get Audit Record

```
GET /api/v1/audit/runs/:runId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "runId": "run-abc123",
    "workOrderId": "wo-xyz789",
    "startedAt": "2025-01-15T10:00:00Z",
    "completedAt": "2025-01-15T10:30:00Z",
    "initialConfig": {
      "id": "snap-001",
      "workOrderId": "wo-xyz789",
      "runId": "run-abc123",
      "iteration": 0,
      "snapshotAt": "2025-01-15T10:00:00Z",
      "configHash": "abc123",
      "config": {
        "loopStrategy": {
          "mode": "hybrid",
          "maxIterations": 5
        },
        "verification": {
          "waitForCI": true,
          "skipLevels": []
        },
        "gitOps": {
          "mode": "github-pr"
        },
        "limits": {
          "maxWallClockSeconds": 3600
        }
      }
    },
    "finalConfig": { ... },
    "snapshotCount": 4,
    "changeCount": 2,
    "configHashChanged": true
  }
}
```

### Get Snapshots

```
GET /api/v1/audit/runs/:runId/snapshots
GET /api/v1/audit/runs/:runId/snapshots?iteration=2
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "snap-001",
        "runId": "run-abc123",
        "iteration": 0,
        "snapshotAt": "2025-01-15T10:00:00Z",
        "configHash": "abc123",
        "config": { ... }
      },
      {
        "id": "snap-002",
        "runId": "run-abc123",
        "iteration": 1,
        "snapshotAt": "2025-01-15T10:10:00Z",
        "configHash": "abc123",
        "config": { ... }
      }
    ],
    "total": 2
  }
}
```

### Get Changes

```
GET /api/v1/audit/runs/:runId/changes
```

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "iteration": 2,
        "path": "loopStrategy.maxIterations",
        "previousValue": 5,
        "newValue": 8,
        "reason": "Strategy increased iterations due to slow progress",
        "initiator": "strategy",
        "changedAt": "2025-01-15T10:20:00Z"
      }
    ],
    "total": 1,
    "summary": {
      "totalChanges": 1,
      "byInitiator": {
        "user": 0,
        "strategy": 1,
        "system": 0
      }
    }
  }
}
```

### Work Order Audit

```
GET /api/v1/work-orders/:id/audit
```

**Response:**
```json
{
  "success": true,
  "data": {
    "workOrderId": "wo-xyz789",
    "runs": [
      {
        "runId": "run-abc123",
        "iteration": 3,
        "startedAt": "2025-01-15T10:00:00Z",
        "configHash": "abc123",
        "changesCount": 2
      }
    ]
  }
}
```

---

## Use Cases

### Debugging Failed Run

```bash
# Get audit record
curl /api/v1/audit/runs/run-abc123

# Check what config was used at each iteration
curl /api/v1/audit/runs/run-abc123/snapshots

# See what changed during the run
curl /api/v1/audit/runs/run-abc123/changes
```

### Compliance Reporting

```bash
# Get all audit records for a work order
curl /api/v1/work-orders/wo-xyz789/audit

# Verify no unauthorized config changes
curl /api/v1/audit/runs/run-abc123/changes | jq '.data.summary.byInitiator'
```

### Comparing Runs

```bash
# Get config hashes for comparison
curl /api/v1/audit/runs/run-001 | jq '.data.initialConfig.configHash'
curl /api/v1/audit/runs/run-002 | jq '.data.initialConfig.configHash'
```
