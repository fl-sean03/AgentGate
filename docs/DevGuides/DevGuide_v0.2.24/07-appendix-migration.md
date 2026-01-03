# Appendix A: Migration Path

## Overview

This appendix documents the migration strategy from the current `HarnessConfig` / loop-based architecture to the new `TaskSpec` / convergence-based architecture. The migration is designed to be **backwards compatible** and **incremental**.

---

## Migration Principles

### 1. No Breaking Changes
- Existing APIs continue working
- Old config formats auto-convert to TaskSpec
- New features are additive

### 2. Incremental Adoption
- Users can migrate one work order at a time
- No big-bang switchover required
- Old and new can coexist

### 3. Clear Deprecation Path
- Old types marked `@deprecated`
- Warning messages in logs
- Full removal in v0.3.0

---

## Phase 1: Type Coexistence

### Add TaskSpec Types Alongside Existing

```typescript
// packages/server/src/types/harness-config.ts

/**
 * @deprecated Use TaskSpec instead. Will be removed in v0.3.0.
 */
export interface HarnessConfig {
  // ... existing fields
}

// packages/server/src/types/task-spec.ts
export interface TaskSpec {
  // ... new fields
}
```

### Create Conversion Functions

```typescript
// packages/server/src/task-spec/converter.ts

/**
 * Convert legacy HarnessConfig to TaskSpec.
 * Used internally for backwards compatibility.
 */
export function harnessConfigToTaskSpec(
  harness: HarnessConfig,
  workOrder: Partial<WorkOrder>
): TaskSpec {
  // ... conversion logic (see Thrust 1)
}

/**
 * Convert TaskSpec to HarnessConfig for legacy code paths.
 * Temporary bridge during migration.
 */
export function taskSpecToHarnessConfig(spec: TaskSpec): HarnessConfig {
  return {
    version: '1.0',
    loopStrategy: convergenceToLoopStrategy(spec.spec.convergence),
    verification: gatesToVerification(spec.spec.convergence.gates),
    gitOps: deliveryToGitOps(spec.spec.delivery),
    executionLimits: convergenceLimitsToExecutionLimits(
      spec.spec.convergence.limits
    ),
    agentDriver: agentSpecToDriver(spec.spec.execution.agent),
  };
}
```

---

## Phase 2: API Compatibility Layer

### Accept Both Formats in API

```typescript
// packages/server/src/server/routes/work-orders.ts

const createWorkOrderSchema = z.union([
  // New TaskSpec format
  z.object({
    taskSpec: taskSpecSchema,
  }),
  // Legacy format (with harness field)
  z.object({
    taskPrompt: z.string(),
    workspaceSource: workspaceSourceSchema,
    harness: harnessRequestSchema.optional(),
    maxIterations: z.number().optional(),
    // ... other legacy fields
  }),
]);

async function createWorkOrder(request: FastifyRequest) {
  const body = request.body;

  let taskSpec: TaskSpec;

  if ('taskSpec' in body) {
    // New format - use directly
    taskSpec = body.taskSpec;
  } else {
    // Legacy format - convert
    taskSpec = legacyRequestToTaskSpec(body);
  }

  // Continue with TaskSpec...
}
```

### Log Deprecation Warnings

```typescript
function legacyRequestToTaskSpec(body: LegacyRequestBody): TaskSpec {
  logger.warn({
    msg: 'Using deprecated API format. Migrate to TaskSpec format.',
    docs: 'https://docs.agentgate.io/migration/v0.2.24',
  });

  // Convert...
}
```

---

## Phase 3: Internal Migration

### Update Orchestrator to Use TaskSpec

```typescript
// packages/server/src/orchestrator/orchestrator.ts

class Orchestrator {
  async execute(workOrder: WorkOrder): Promise<ExecutionResult> {
    // Load or convert to TaskSpec
    const taskSpec = await this.resolveTaskSpec(workOrder);

    // Use new convergence controller
    const controller = new ConvergenceController(taskSpec);

    // Execute
    return controller.run({
      // ... context
    });
  }

  private async resolveTaskSpec(workOrder: WorkOrder): Promise<TaskSpec> {
    if (workOrder.taskSpec) {
      // New format
      return workOrder.taskSpec;
    }

    if (workOrder.harnessProfile) {
      // Load profile and convert
      const harness = await this.loadProfile(workOrder.harnessProfile);
      return harnessConfigToTaskSpec(harness, workOrder);
    }

    // Default TaskSpec
    return this.createDefaultTaskSpec(workOrder);
  }
}
```

### Adapt Run Executor

```typescript
// packages/server/src/orchestrator/run-executor.ts

class RunExecutor {
  // Keep old interface for backwards compatibility
  async execute(config: HarnessConfig): Promise<RunResult>;
  // Add new interface
  async execute(spec: TaskSpec): Promise<RunResult>;

  async execute(configOrSpec: HarnessConfig | TaskSpec): Promise<RunResult> {
    const taskSpec = isTaskSpec(configOrSpec)
      ? configOrSpec
      : harnessConfigToTaskSpec(configOrSpec, {});

    // Use new gate-based execution
    return this.executeWithGates(taskSpec);
  }
}

function isTaskSpec(obj: any): obj is TaskSpec {
  return obj.apiVersion === 'agentgate.io/v1' && obj.kind === 'TaskSpec';
}
```

---

## Phase 4: Profile Migration

### Convert Profile Files

Users with existing profile files (`~/.agentgate/harnesses/*.yaml`) should migrate:

**Before (HarnessConfig format)**:
```yaml
# ~/.agentgate/harnesses/my-project.yaml
version: '1.0'
loopStrategy:
  mode: hybrid
  baseIterations: 3
  maxBonusIterations: 2
verification:
  skipLevels: []
gitOps:
  mode: github_pr
  branchPrefix: 'feature/'
```

**After (TaskSpec format)**:
```yaml
# ~/.agentgate/taskspecs/my-project.yaml
apiVersion: agentgate.io/v1
kind: TaskSpec
metadata:
  name: my-project

spec:
  goal:
    prompt: ""  # Will be filled from work order

  convergence:
    strategy: hybrid
    config:
      baseIterations: 3
      bonusIterations: 2
    gates:
      - name: verification
        check:
          type: verification-levels
          levels: [L0, L1, L2, L3]
        onFailure:
          action: iterate
          feedback: auto
    limits:
      maxIterations: 100

  execution:
    workspace:
      source: local
      path: ""  # Will be filled from work order
    agent:
      driver: claude-code-subscription

  delivery:
    git:
      mode: github-pr
      branchPrefix: 'feature/'
```

### Provide Migration Script

```bash
# packages/server/scripts/migrate-profiles.ts

#!/usr/bin/env tsx
import { glob } from 'fast-glob';
import { readFile, writeFile } from 'fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

async function migrateProfiles() {
  const oldDir = path.join(os.homedir(), '.agentgate/harnesses');
  const newDir = path.join(os.homedir(), '.agentgate/taskspecs');

  await fs.ensureDir(newDir);

  const profiles = await glob('*.yaml', { cwd: oldDir });

  for (const profile of profiles) {
    console.log(`Migrating ${profile}...`);

    const oldContent = await readFile(path.join(oldDir, profile), 'utf-8');
    const oldConfig = parseYaml(oldContent);

    const taskSpec = harnessConfigToTaskSpec(oldConfig, {});

    const newContent = stringifyYaml(taskSpec);
    await writeFile(path.join(newDir, profile), newContent);

    console.log(`  → ${path.join(newDir, profile)}`);
  }

  console.log('\nMigration complete!');
  console.log('Old profiles preserved in ~/.agentgate/harnesses/');
  console.log('New profiles created in ~/.agentgate/taskspecs/');
}

migrateProfiles().catch(console.error);
```

**Usage**:
```bash
npx agentgate migrate-profiles
```

---

## Phase 5: CLI Migration

### Update CLI Commands

```bash
# Old format (continues to work)
agentgate execute \
  --workspace /path \
  --task "Fix types" \
  --max-iterations 5 \
  --loop-strategy hybrid

# New format
agentgate execute \
  --task-spec ./my-task.yaml

# Or inline
agentgate execute \
  --workspace /path \
  --task "Fix types" \
  --strategy hybrid \
  --gate "verification:L0,L1,L2,L3" \
  --gate "ci:github-actions" \
  --max-iterations 100
```

### Add Migration Command

```bash
# Convert old config to new format
agentgate config migrate ./old-harness.yaml --output ./new-taskspec.yaml

# Validate TaskSpec
agentgate config validate ./new-taskspec.yaml
```

---

## Mapping Reference

### Loop Strategy → Convergence Strategy

| Old | New |
|-----|-----|
| `loopStrategy.mode: 'fixed'` | `convergence.strategy: 'fixed'` |
| `loopStrategy.mode: 'hybrid'` | `convergence.strategy: 'hybrid'` |
| `loopStrategy.mode: 'ralph'` | `convergence.strategy: 'ralph'` |
| `loopStrategy.mode: 'custom'` | `convergence.strategy: 'manual'` |
| `loopStrategy.maxIterations` | `convergence.limits.maxIterations` |
| `loopStrategy.baseIterations` | `convergence.config.baseIterations` |
| `loopStrategy.maxBonusIterations` | `convergence.config.bonusIterations` |
| `loopStrategy.convergenceThreshold` | `convergence.config.convergenceThreshold` |
| `loopStrategy.windowSize` | `convergence.config.windowSize` |

### Verification → Gates

| Old | New |
|-----|-----|
| `verification.skipLevels: []` | Gate with `levels: [L0, L1, L2, L3]` |
| `verification.skipLevels: ['L0']` | Gate with `levels: [L1, L2, L3]` |
| `verification.timeoutMs` | Gate check-specific timeout |
| `localRetryEnabled: true` | Gate `onFailure.action: 'iterate'` |
| `localRetryEnabled: false` | Gate `onFailure.action: 'stop'` |
| `waitForCI: true` | Add github-actions gate |

### GitOps → Delivery

| Old | New |
|-----|-----|
| `gitOps.mode: 'local'` | `delivery.git.mode: 'local'` |
| `gitOps.mode: 'push_only'` | `delivery.git.mode: 'push'` |
| `gitOps.mode: 'github_pr'` | `delivery.git.mode: 'github-pr'` |
| `gitOps.branchPrefix` | `delivery.git.branchPrefix` |
| `gitOps.commitMessagePrefix` | `delivery.git.commitPrefix` |
| `gitOps.autoCommit` | `delivery.git.autoCommit` |
| `gitOps.autoPush` | `delivery.git.autoPush` |
| `gitOps.createPR` | `delivery.pr.create` |
| `gitOps.prDraft` | `delivery.pr.draft` |
| `gitOps.prReviewers` | `delivery.pr.reviewers` |
| `gitOps.prLabels` | `delivery.pr.labels` |

### WorkOrder → TaskSpec

| Old | New |
|-----|-----|
| `workOrder.taskPrompt` | `spec.goal.prompt` |
| `workOrder.workspaceSource` | `spec.execution.workspace` |
| `workOrder.agentType` | `spec.execution.agent.driver` |
| `workOrder.maxIterations` | `spec.convergence.limits.maxIterations` |
| `workOrder.maxWallClockSeconds` | `spec.convergence.limits.maxWallClock` |
| `workOrder.harnessProfile` | Load and merge TaskSpec |
| `workOrder.skipVerification` | Modify gate levels |

---

## Deprecation Timeline

### v0.2.24 (This Release)
- Add TaskSpec types and converters
- Accept both formats in API
- Add deprecation warnings
- Provide migration tools

### v0.2.25-v0.2.29
- Continue supporting both formats
- Log deprecation warnings
- Update documentation

### v0.3.0
- Remove HarnessConfig type
- Remove legacy API format
- Remove conversion code
- TaskSpec-only

---

## Testing Migration

### Verify Conversion Accuracy

```typescript
// test/unit/migration/conversion.test.ts

describe('HarnessConfig to TaskSpec conversion', () => {
  it('converts fixed strategy correctly', () => {
    const harness: HarnessConfig = {
      version: '1.0',
      loopStrategy: {
        mode: 'fixed',
        maxIterations: 5,
      },
      // ...
    };

    const taskSpec = harnessConfigToTaskSpec(harness, {});

    expect(taskSpec.spec.convergence.strategy).toBe('fixed');
    expect(taskSpec.spec.convergence.config?.iterations).toBe(5);
  });

  it('converts gates correctly', () => {
    const harness: HarnessConfig = {
      // ... with all levels enabled
    };

    const taskSpec = harnessConfigToTaskSpec(harness, {});
    const gate = taskSpec.spec.convergence.gates[0];

    expect(gate.check.type).toBe('verification-levels');
    expect((gate.check as any).levels).toEqual(['L0', 'L1', 'L2', 'L3']);
  });

  // ... more conversion tests
});
```

### Verify API Compatibility

```typescript
// test/e2e/migration/api-compat.test.ts

describe('API backwards compatibility', () => {
  it('accepts legacy request format', async () => {
    const response = await api.post('/work-orders', {
      taskPrompt: 'Fix types',
      workspaceSource: { type: 'local', path: '/tmp/test' },
      maxIterations: 5,
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('accepts new TaskSpec format', async () => {
    const response = await api.post('/work-orders', {
      taskSpec: {
        apiVersion: 'agentgate.io/v1',
        kind: 'TaskSpec',
        metadata: { name: 'test' },
        spec: {
          // ... full TaskSpec
        },
      },
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

---

## Common Migration Issues

### Issue: Profile Not Found

**Symptom**: `ProfileNotFoundError: Profile 'my-project' not found`

**Cause**: Looking in old directory (`~/.agentgate/harnesses/`)

**Fix**: Run migration script or manually move to `~/.agentgate/taskspecs/`

### Issue: Invalid Gate Configuration

**Symptom**: `ValidationError: Gate check type 'verification' is invalid`

**Cause**: Old verification format doesn't map directly

**Fix**: Use `verification-levels` type with explicit levels array

### Issue: Missing Limits

**Symptom**: Task runs indefinitely

**Cause**: Old config didn't have explicit limits, relied on defaults

**Fix**: Add explicit `convergence.limits` in TaskSpec

---

## Support

For migration assistance:
- Documentation: https://docs.agentgate.io/migration/v0.2.24
- GitHub Issues: https://github.com/agentgate/agentgate/issues
- Tag issues with `migration` label
