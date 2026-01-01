# 02: Extended Work Order Schema

This document covers Thrust 1: extending the work order API schema to support all CLI harness options.

---

## Thrust 1: Extended Work Order Schema

### 1.1 Objective

Extend the `POST /api/v1/work-orders` endpoint to accept all harness configuration options available in the CLI, enabling full feature parity for programmatic work order submission.

### 1.2 Background

The current work order API accepts only basic options (taskPrompt, workspaceSource, agentType, maxIterations, maxTime). The CLI supports rich harness configuration via `--harness`, `--loop-strategy`, `--wait-for-ci`, and other flags. This thrust brings those capabilities to the API.

### 1.3 Subtasks

#### 1.3.1 Define Extended Request Schema

Create Zod schemas for the extended work order request body in `packages/server/src/server/types/api.ts`:

**HarnessOptionsSchema:**
```typescript
export const apiHarnessOptionsSchema = z.object({
  // Profile selection
  profile: z.string().optional(),

  // Loop strategy inline options
  loopStrategy: z.object({
    mode: z.enum(['fixed', 'hybrid', 'ralph', 'custom']).optional(),
    maxIterations: z.number().int().min(1).max(100).optional(),
    // Hybrid-specific
    completionCriteria: z.array(z.enum([
      'verification-pass', 'ci-pass', 'no-changes', 'agent-signal'
    ])).optional(),
    requireCI: z.boolean().optional(),
    // Ralph-specific
    loopDetection: z.boolean().optional(),
    similarityThreshold: z.number().min(0).max(1).optional(),
  }).optional(),

  // Verification options
  verification: z.object({
    gatePlanSource: z.enum(['auto', 'inline', 'workspace', 'ci-workflow']).optional(),
    waitForCI: z.boolean().optional(),
    skipLevels: z.array(z.enum(['L0', 'L1', 'L2', 'L3'])).optional(),
    ci: z.object({
      timeoutSeconds: z.number().int().min(60).max(7200).optional(),
      pollIntervalSeconds: z.number().int().min(10).max(300).optional(),
      maxIterations: z.number().int().min(1).max(10).optional(),
    }).optional(),
  }).optional(),

  // Git ops options
  gitOps: z.object({
    mode: z.enum(['local', 'push-only', 'github-pr']).optional(),
    branchPattern: z.string().optional(),
    draftPR: z.boolean().optional(),
    prTitlePattern: z.string().optional(),
  }).optional(),

  // Execution limits
  limits: z.object({
    maxWallClockSeconds: z.number().int().min(60).max(86400).optional(),
    networkAllowed: z.boolean().optional(),
  }).optional(),
}).optional();

export type ApiHarnessOptions = z.infer<typeof apiHarnessOptionsSchema>;
```

#### 1.3.2 Extend CreateWorkOrderBody Schema

Update the existing `createWorkOrderBodySchema`:

```typescript
export const createWorkOrderBodySchema = z.object({
  taskPrompt: z.string().min(1).max(50000),
  workspaceSource: workspaceSourceSchema,
  agentType: z.enum(['claude-code-subscription']).default('claude-code-subscription'),

  // Existing fields (kept for backwards compatibility)
  maxIterations: z.number().int().min(1).max(100).optional(),
  maxTime: z.number().int().min(60).max(86400).optional(),

  // New harness options
  harness: apiHarnessOptionsSchema,
});
```

#### 1.3.3 Update Work Order Response Schema

Extend the work order response to include resolved harness config:

```typescript
export const workOrderDetailSchema = z.object({
  // Existing fields
  id: z.string(),
  taskPrompt: z.string(),
  status: workOrderStatusSchema,
  workspaceSource: apiWorkspaceSourceSchema,
  agentType: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  runCount: z.number(),
  maxIterations: z.number(),
  maxTime: z.number(),
  runs: z.array(runSummarySchema),

  // New: resolved harness config
  harness: z.object({
    profile: z.string().nullable(),
    loopStrategy: z.object({
      mode: z.string(),
      maxIterations: z.number(),
    }),
    verification: z.object({
      waitForCI: z.boolean(),
      skipLevels: z.array(z.string()),
    }),
  }).optional(),
});
```

#### 1.3.4 Implement Request Mapping

Create helper function to map API harness options to internal HarnessConfig:

```typescript
// In packages/server/src/server/routes/work-orders.ts

function mapApiHarnessToConfig(
  apiHarness: ApiHarnessOptions | undefined
): Partial<HarnessConfig> | undefined {
  if (!apiHarness) return undefined;

  const config: Partial<HarnessConfig> = {};

  // Map loop strategy
  if (apiHarness.loopStrategy) {
    config.loopStrategy = {
      mode: apiHarness.loopStrategy.mode ?? 'hybrid',
      maxIterations: apiHarness.loopStrategy.maxIterations,
      // Mode-specific options mapped based on mode
      ...(apiHarness.loopStrategy.mode === 'hybrid' && {
        completionCriteria: apiHarness.loopStrategy.completionCriteria,
        requireCI: apiHarness.loopStrategy.requireCI,
      }),
      ...(apiHarness.loopStrategy.mode === 'ralph' && {
        loopDetection: apiHarness.loopStrategy.loopDetection,
        similarityThreshold: apiHarness.loopStrategy.similarityThreshold,
      }),
    };
  }

  // Map verification
  if (apiHarness.verification) {
    config.verification = {
      gatePlanSource: apiHarness.verification.gatePlanSource,
      waitForCI: apiHarness.verification.waitForCI,
      skipLevels: apiHarness.verification.skipLevels,
      ci: apiHarness.verification.ci,
    };
  }

  // Map git ops
  if (apiHarness.gitOps) {
    config.gitOps = {
      mode: apiHarness.gitOps.mode,
      branchPattern: apiHarness.gitOps.branchPattern,
      draftPR: apiHarness.gitOps.draftPR,
      prTitlePattern: apiHarness.gitOps.prTitlePattern,
    };
  }

  // Map limits
  if (apiHarness.limits) {
    config.limits = {
      maxWallClockSeconds: apiHarness.limits.maxWallClockSeconds,
      networkAllowed: apiHarness.limits.networkAllowed,
    };
  }

  return config;
}
```

#### 1.3.5 Update POST Handler

Modify the work order POST handler to use harness configuration:

```typescript
app.post<{ Body: CreateWorkOrderBody }>(
  '/api/v1/work-orders',
  { preHandler: [apiKeyAuth] },
  async (request, reply) => {
    // Validate body
    const bodyResult = createWorkOrderBodySchema.safeParse(request.body);
    if (!bodyResult.success) {
      return reply.status(400).send(createErrorResponse(...));
    }

    const body = bodyResult.data;

    // Resolve harness configuration
    let harnessConfig: ResolvedHarnessConfig | undefined;
    if (body.harness) {
      try {
        harnessConfig = await resolveHarnessConfig({
          profileName: body.harness.profile,
          cliOverrides: mapApiHarnessToConfig(body.harness),
        });
      } catch (error) {
        return reply.status(400).send(createErrorResponse(
          ErrorCode.BAD_REQUEST,
          `Invalid harness configuration: ${error.message}`,
          { errors: [error.message] },
          request.id
        ));
      }
    }

    // Create submit request
    const submitRequest: SubmitRequest = {
      taskPrompt: body.taskPrompt,
      workspaceSource: mapWorkspaceSource(body.workspaceSource),
      agentType: mapAgentType(body.agentType),
      // Use harness config or legacy options
      maxIterations: harnessConfig?.loopStrategy.maxIterations
        ?? body.maxIterations
        ?? 3,
      maxWallClockSeconds: harnessConfig?.limits.maxWallClockSeconds
        ?? body.maxTime
        ?? 3600,
      // Pass through harness config
      harnessConfig,
    };

    const order = await workOrderService.submit(submitRequest);

    // Return extended response
    const summary = toWorkOrderSummary(order, 0);
    return reply.status(201).send(createSuccessResponse(summary, request.id));
  }
);
```

#### 1.3.6 Add Harness Info to GET Response

Update the GET work order handler to include harness info:

```typescript
function toWorkOrderDetail(order: WorkOrder, runs: Run[]): WorkOrderDetail {
  return {
    ...toWorkOrderSummary(order, runs.length),
    maxIterations: order.maxIterations,
    maxTime: order.maxWallClockSeconds,
    runs: runs.map(toRunSummary),
    // Add harness info if available
    harness: order.harnessConfig ? {
      profile: order.harnessConfig.source,
      loopStrategy: {
        mode: order.harnessConfig.loopStrategy.mode,
        maxIterations: order.harnessConfig.loopStrategy.maxIterations,
      },
      verification: {
        waitForCI: order.harnessConfig.verification.waitForCI,
        skipLevels: order.harnessConfig.verification.skipLevels ?? [],
      },
    } : undefined,
  };
}
```

### 1.4 Verification Steps

1. Create unit tests for new schemas
2. Test backwards compatibility - old requests still work
3. Test profile loading via API
4. Test inline harness options
5. Test profile + inline override combination
6. Verify error messages for invalid harness config
7. Run full API test suite

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/server/types/api.ts` | Modified - add harness schemas |
| `packages/server/src/server/routes/work-orders.ts` | Modified - use harness config |
| `packages/server/src/types/work-order.ts` | Modified - add harnessConfig field |
| `packages/server/test/server/work-orders.test.ts` | Modified - add harness tests |

---

## Request Examples

### Minimal Request (Backwards Compatible)

```json
{
  "taskPrompt": "Implement feature X",
  "workspaceSource": { "type": "github", "repo": "owner/repo" }
}
```

### Using Named Profile

```json
{
  "taskPrompt": "Implement feature X",
  "workspaceSource": { "type": "github", "repo": "owner/repo" },
  "harness": {
    "profile": "ci-focused"
  }
}
```

### Full Inline Configuration

```json
{
  "taskPrompt": "Implement feature X",
  "workspaceSource": { "type": "github", "repo": "owner/repo" },
  "harness": {
    "loopStrategy": {
      "mode": "hybrid",
      "maxIterations": 8,
      "completionCriteria": ["verification-pass", "ci-pass"],
      "requireCI": true
    },
    "verification": {
      "gatePlanSource": "ci-workflow",
      "waitForCI": true,
      "skipLevels": ["L3"],
      "ci": {
        "timeoutSeconds": 1800,
        "pollIntervalSeconds": 60
      }
    },
    "gitOps": {
      "mode": "github-pr",
      "draftPR": true
    },
    "limits": {
      "maxWallClockSeconds": 7200,
      "networkAllowed": false
    }
  }
}
```

### Profile with Overrides

```json
{
  "taskPrompt": "Implement feature X",
  "workspaceSource": { "type": "github", "repo": "owner/repo" },
  "harness": {
    "profile": "ci-focused",
    "loopStrategy": {
      "maxIterations": 10
    },
    "verification": {
      "waitForCI": false
    }
  }
}
```

---

## Response Examples

### Create Work Order Response

```json
{
  "success": true,
  "data": {
    "id": "wo-abc123",
    "taskPrompt": "Implement feature X",
    "status": "queued",
    "workspaceSource": {
      "type": "github",
      "repo": "owner/repo"
    },
    "agentType": "claude-code-subscription",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "runCount": 0
  },
  "requestId": "req-123"
}
```

### Get Work Order Detail Response

```json
{
  "success": true,
  "data": {
    "id": "wo-abc123",
    "taskPrompt": "Implement feature X",
    "status": "running",
    "workspaceSource": {
      "type": "github",
      "repo": "owner/repo"
    },
    "agentType": "claude-code-subscription",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:05:00Z",
    "runCount": 1,
    "maxIterations": 8,
    "maxTime": 7200,
    "runs": [
      {
        "id": "run-xyz789",
        "status": "running",
        "startedAt": "2025-01-15T10:01:00Z",
        "iterationCount": 2
      }
    ],
    "harness": {
      "profile": "ci-focused",
      "loopStrategy": {
        "mode": "hybrid",
        "maxIterations": 8
      },
      "verification": {
        "waitForCI": true,
        "skipLevels": []
      }
    }
  },
  "requestId": "req-456"
}
```

---

## Error Handling

### Profile Not Found

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid harness configuration: Profile 'unknown-profile' not found",
    "details": {
      "errors": ["Profile 'unknown-profile' not found"]
    }
  },
  "requestId": "req-789"
}
```

### Invalid Loop Strategy

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request body",
    "details": {
      "errors": [
        {
          "code": "invalid_enum_value",
          "path": ["harness", "loopStrategy", "mode"],
          "message": "Invalid enum value. Expected 'fixed' | 'hybrid' | 'ralph' | 'custom'"
        }
      ]
    }
  },
  "requestId": "req-012"
}
```

### Conflicting Options

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid harness configuration: Ralph-specific options cannot be used with hybrid strategy",
    "details": {
      "errors": ["similarityThreshold is only valid for ralph strategy"]
    }
  },
  "requestId": "req-345"
}
```

---

## Backwards Compatibility

### Legacy Field Mapping

For backwards compatibility, legacy fields are still accepted and mapped:

| Legacy Field | Maps To |
|--------------|---------|
| `maxIterations` | `harness.loopStrategy.maxIterations` |
| `maxTime` | `harness.limits.maxWallClockSeconds` |

### Priority Order

When both legacy and new fields are present:
1. `harness.loopStrategy.maxIterations` takes priority over `maxIterations`
2. `harness.limits.maxWallClockSeconds` takes priority over `maxTime`
3. Warning logged when both are present

### Deprecation Plan

Legacy fields will be deprecated in v0.3.0:
- v0.2.17: Both accepted, new preferred
- v0.2.18+: Deprecation warning in response
- v0.3.0: Legacy fields removed
