# Thrust 1: TaskSpec Type System

## 1.1 Objective

Define the `TaskSpec` type system that replaces `HarnessConfig` as the primary configuration unit for AgentGate. TaskSpec uses a Kubernetes-style resource definition to declaratively specify goals, convergence behavior, execution environment, and delivery configuration.

---

## 1.2 Background

### Current State

The existing configuration is spread across multiple types:

```typescript
// packages/server/src/types/harness-config.ts
interface HarnessConfig {
  version: '1.0';
  loopStrategy: LoopStrategyConfig;      // How to iterate
  agentDriver?: AgentDriverConfig;       // Which agent to use
  verification: VerificationConfig;       // How to verify
  gitOps: GitOpsConfig;                   // How to commit/push
  executionLimits: ExecutionLimits;       // Resource limits
  metadata?: Record<string, unknown>;
}

// packages/server/src/types/work-order.ts
interface WorkOrder {
  // ... runtime state ...
  maxIterations: number;                  // Duplicates loopStrategy
  loopStrategyMode?: LoopStrategyMode;    // Overrides loopStrategy
  harnessProfile?: string;                // References harness
  skipVerification?: VerificationLevel[]; // Modifies verification
  waitForCI?: boolean;                    // CI behavior
}
```

### Problems

1. **Duplication**: `maxIterations` exists in both WorkOrder and HarnessConfig
2. **Unclear Ownership**: Is CI behavior in harness or work order?
3. **Mixed Concerns**: `loopStrategy` mixes iteration count with completion detection
4. **Naming Confusion**: "Harness" doesn't convey purpose

---

## 1.3 Subtasks

### 1.3.1 Define TaskSpec Core Types

**Files Created**:
- `packages/server/src/types/task-spec.ts`

**Specification**:

The `TaskSpec` type follows Kubernetes resource conventions with `apiVersion`, `kind`, `metadata`, and `spec`:

```typescript
interface TaskSpec {
  apiVersion: 'agentgate.io/v1';
  kind: 'TaskSpec';
  metadata: TaskMetadata;
  spec: TaskSpecBody;
}

interface TaskMetadata {
  name: string;                    // Unique identifier
  namespace?: string;              // Optional grouping
  labels?: Record<string, string>; // Key-value labels
  annotations?: Record<string, string>; // Extended metadata
}

interface TaskSpecBody {
  goal: GoalSpec;
  convergence: ConvergenceSpec;
  execution: ExecutionSpec;
  delivery: DeliverySpec;
}
```

The `GoalSpec` captures what we're trying to achieve:

```typescript
interface GoalSpec {
  prompt: string;                  // Task description for agent
  context?: string;                // Additional context
  desiredState?: DesiredState;     // What "done" looks like
}

interface DesiredState {
  allGatesPassed?: boolean;        // All gates must pass
  specificGates?: string[];        // Only these gates must pass
  custom?: Record<string, unknown>; // Custom state definition
}
```

**Verification**:
- [ ] Types compile without errors
- [ ] Types exported from `packages/server/src/types/index.ts`
- [ ] All fields have JSDoc comments

---

### 1.3.2 Define Spec Sub-Types

**Files Created**:
- `packages/server/src/types/convergence.ts`
- `packages/server/src/types/gate.ts`
- `packages/server/src/types/execution.ts`
- `packages/server/src/types/delivery.ts`

**Specification**:

**ConvergenceSpec** (in `convergence.ts`):
```typescript
interface ConvergenceSpec {
  strategy: ConvergenceStrategy;
  config?: ConvergenceConfig;
  gates: Gate[];
  limits: ConvergenceLimits;
}

type ConvergenceStrategy = 'fixed' | 'hybrid' | 'ralph' | 'adaptive' | 'manual';

interface ConvergenceConfig {
  // Strategy-specific configuration
  iterations?: number;           // fixed
  baseIterations?: number;       // hybrid
  bonusIterations?: number;      // hybrid
  progressThreshold?: number;    // hybrid (0-1)
  convergenceThreshold?: number; // ralph (0-1)
  windowSize?: number;           // ralph (2-10)
  promptHotReload?: boolean;     // ralph
  tuningSignsPath?: string;      // ralph
}

interface ConvergenceLimits {
  maxIterations?: number;        // Hard cap on iterations
  maxWallClock?: string;         // e.g., "2h", "30m", "1d"
  maxCost?: string;              // e.g., "$50", "$100"
  maxTokens?: number;            // Total token budget
}
```

**Gate** (in `gate.ts`):
```typescript
interface Gate {
  name: string;                  // Unique within TaskSpec
  check: GateCheck;              // What to check
  onFailure: FailurePolicy;      // What to do if failed
  onSuccess?: SuccessPolicy;     // What to do if passed
  condition?: GateCondition;     // When to run this gate
}

type GateCheck =
  | VerificationLevelsCheck
  | GitHubActionsCheck
  | CustomCommandCheck
  | ApprovalCheck
  | ConvergenceCheck;

interface VerificationLevelsCheck {
  type: 'verification-levels';
  levels: ('L0' | 'L1' | 'L2' | 'L3')[];
}

interface GitHubActionsCheck {
  type: 'github-actions';
  workflows?: string[];          // Specific workflows, or all
  pollInterval?: string;         // e.g., "30s"
  timeout?: string;              // e.g., "30m"
}

interface CustomCommandCheck {
  type: 'custom';
  command: string;               // Shell command to run
  expectedExit?: number;         // Expected exit code (default: 0)
  timeout?: string;              // e.g., "5m"
}

interface ApprovalCheck {
  type: 'approval';
  approvers: string[];           // GitHub usernames
  minApprovals?: number;         // Default: 1
}

interface ConvergenceCheck {
  type: 'convergence';
  strategy: 'similarity' | 'fingerprint';
  threshold?: number;            // Similarity threshold
}

interface FailurePolicy {
  action: 'iterate' | 'stop' | 'escalate';
  maxAttempts?: number;          // Max retries for this gate
  feedback?: FeedbackConfig;     // How to generate feedback
  backoff?: BackoffConfig;       // Delay between retries
}

type FeedbackConfig =
  | 'auto'                       // Use built-in feedback generator
  | 'manual'                     // No automatic feedback
  | { generator: string };       // Custom generator

interface BackoffConfig {
  initial?: string;              // e.g., "1s"
  max?: string;                  // e.g., "1m"
  multiplier?: number;           // e.g., 2
}

interface SuccessPolicy {
  action: 'continue' | 'skip-remaining';
}

interface GateCondition {
  when?: 'always' | 'on-change' | 'manual';
  skipIf?: string;               // Condition expression
}
```

**ExecutionSpec** (in `execution.ts`):
```typescript
interface ExecutionSpec {
  workspace: WorkspaceSpec;
  sandbox?: SandboxSpec;
  agent: AgentSpec;
}

interface WorkspaceSpec {
  source: WorkspaceSource;
  // Source-specific fields are discriminated by source type
}

type WorkspaceSource = 'local' | 'git' | 'github' | 'github-new' | 'fresh';

interface LocalWorkspace {
  source: 'local';
  path: string;
}

interface GitWorkspace {
  source: 'git';
  url: string;
  ref?: string;
}

interface GitHubWorkspace {
  source: 'github';
  owner: string;
  repo: string;
  ref?: string;
}

interface GitHubNewWorkspace {
  source: 'github-new';
  owner: string;
  repoName: string;
  private?: boolean;
  template?: string;
}

interface FreshWorkspace {
  source: 'fresh';
  destPath: string;
  template?: string;
  projectName?: string;
}

interface SandboxSpec {
  provider: 'docker' | 'subprocess' | 'none';
  image?: string;
  resources?: ResourceSpec;
  network?: 'none' | 'bridge' | 'host';
  mounts?: MountSpec[];
}

interface ResourceSpec {
  cpu?: number;
  memory?: string;               // e.g., "4Gi"
  disk?: string;                 // e.g., "10Gi"
}

interface MountSpec {
  source: string;
  target: string;
  readonly?: boolean;
}

interface AgentSpec {
  driver: AgentDriver;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
  mcpServers?: Record<string, unknown>;
}

type AgentDriver =
  | 'claude-code-subscription'
  | 'claude-code-api'
  | 'claude-agent-sdk'
  | 'opencode'
  | 'openai-codex';
```

**DeliverySpec** (in `delivery.ts`):
```typescript
interface DeliverySpec {
  git: GitSpec;
  pr?: PRSpec;
}

interface GitSpec {
  mode: GitMode;
  branchPrefix?: string;         // Default: 'agentgate/'
  commitPrefix?: string;         // Default: '[AgentGate]'
  autoCommit?: boolean;          // Default: true
  autoPush?: boolean;            // Default: false
}

type GitMode = 'local' | 'push' | 'github-pr';

interface PRSpec {
  create: boolean;
  draft?: boolean;               // Default: false
  title?: string;                // Template with {task}, {date}
  body?: string;                 // Template
  labels?: string[];
  reviewers?: string[];
  assignees?: string[];
  autoMerge?: boolean;           // Default: false
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}
```

**Verification**:
- [ ] All sub-types compile without errors
- [ ] Discriminated unions work correctly for GateCheck
- [ ] Types exported from index

---

### 1.3.3 Create Zod Schemas for Validation

**Files Created**:
- `packages/shared/src/schemas/task-spec.schema.ts`

**Specification**:

Create Zod schemas that mirror the TypeScript types for runtime validation:

```typescript
import { z } from 'zod';

// Metadata schema
const taskMetadataSchema = z.object({
  name: z.string().min(1).max(128),
  namespace: z.string().optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

// Goal schema
const desiredStateSchema = z.object({
  allGatesPassed: z.boolean().optional(),
  specificGates: z.array(z.string()).optional(),
  custom: z.record(z.unknown()).optional(),
});

const goalSpecSchema = z.object({
  prompt: z.string().min(10),
  context: z.string().optional(),
  desiredState: desiredStateSchema.optional(),
});

// Gate check schemas (discriminated union)
const verificationLevelsCheckSchema = z.object({
  type: z.literal('verification-levels'),
  levels: z.array(z.enum(['L0', 'L1', 'L2', 'L3'])).min(1),
});

const githubActionsCheckSchema = z.object({
  type: z.literal('github-actions'),
  workflows: z.array(z.string()).optional(),
  pollInterval: z.string().optional(),
  timeout: z.string().optional(),
});

// ... additional check schemas ...

const gateCheckSchema = z.discriminatedUnion('type', [
  verificationLevelsCheckSchema,
  githubActionsCheckSchema,
  // ... other check types
]);

// Full TaskSpec schema
export const taskSpecSchema = z.object({
  apiVersion: z.literal('agentgate.io/v1'),
  kind: z.literal('TaskSpec'),
  metadata: taskMetadataSchema,
  spec: z.object({
    goal: goalSpecSchema,
    convergence: convergenceSpecSchema,
    execution: executionSpecSchema,
    delivery: deliverySpecSchema,
  }),
});

// Type inference
export type TaskSpecInput = z.input<typeof taskSpecSchema>;
export type TaskSpec = z.output<typeof taskSpecSchema>;
```

**Verification**:
- [ ] Schema validates correct TaskSpec documents
- [ ] Schema rejects invalid documents with clear error messages
- [ ] Type inference matches TypeScript types

---

### 1.3.4 Create TaskSpec Loader

**Files Created**:
- `packages/server/src/task-spec/loader.ts`

**Specification**:

The loader reads TaskSpec from various sources:

```typescript
interface TaskSpecLoader {
  // Load from file path (YAML or JSON)
  loadFromFile(path: string): Promise<TaskSpec>;

  // Load from inline object
  loadFromObject(obj: unknown): TaskSpec;

  // Load from named profile
  loadFromProfile(name: string): Promise<TaskSpec>;

  // List available profiles
  listProfiles(): Promise<string[]>;

  // Save as profile
  saveProfile(name: string, spec: TaskSpec): Promise<void>;
}
```

Implementation should:
- Support YAML and JSON formats
- Look for profiles in `~/.agentgate/taskspecs/`
- Validate against Zod schema
- Provide clear error messages for validation failures

**Verification**:
- [ ] Loads YAML TaskSpec files correctly
- [ ] Loads JSON TaskSpec files correctly
- [ ] Validates against schema during load
- [ ] Lists available profiles

---

### 1.3.5 Create TaskSpec Resolver

**Files Created**:
- `packages/server/src/task-spec/resolver.ts`

**Specification**:

The resolver applies defaults and resolves inheritance:

```typescript
interface TaskSpecResolver {
  // Resolve with defaults and inheritance
  resolve(spec: TaskSpec, overrides?: Partial<TaskSpec>): Promise<ResolvedTaskSpec>;

  // Convert from legacy HarnessConfig
  fromHarnessConfig(config: HarnessConfig): TaskSpec;

  // Convert from API request
  fromApiRequest(request: CreateWorkOrderBody): TaskSpec;
}

interface ResolvedTaskSpec extends TaskSpec {
  _resolved: true;
  _hash: string;           // SHA256 of resolved spec
  _resolvedAt: Date;
  _source: TaskSpecSource;
}

type TaskSpecSource =
  | { type: 'file'; path: string }
  | { type: 'profile'; name: string }
  | { type: 'inline' }
  | { type: 'api-request' }
  | { type: 'legacy-harness' };
```

Default values to apply:

| Field | Default |
|-------|---------|
| `convergence.strategy` | `'hybrid'` |
| `convergence.config.baseIterations` | `3` |
| `convergence.config.bonusIterations` | `2` |
| `convergence.limits.maxIterations` | `100` |
| `convergence.limits.maxWallClock` | `'1h'` |
| `execution.sandbox.provider` | `'docker'` |
| `execution.agent.driver` | `'claude-code-subscription'` |
| `delivery.git.mode` | `'local'` |
| `delivery.git.autoCommit` | `true` |

**Verification**:
- [ ] Applies defaults correctly
- [ ] Converts HarnessConfig to TaskSpec
- [ ] Generates consistent hash
- [ ] Tracks source information

---

### 1.3.6 Create HarnessConfig Converter

**Files Created**:
- `packages/server/src/task-spec/converter.ts`

**Specification**:

Convert legacy `HarnessConfig` to `TaskSpec` for backwards compatibility:

```typescript
function convertHarnessToTaskSpec(
  harness: HarnessConfig,
  workOrder: Partial<WorkOrder>
): TaskSpec {
  return {
    apiVersion: 'agentgate.io/v1',
    kind: 'TaskSpec',
    metadata: {
      name: workOrder.id || 'unnamed-task',
    },
    spec: {
      goal: {
        prompt: workOrder.taskPrompt || '',
      },
      convergence: convertLoopStrategy(harness.loopStrategy),
      execution: convertExecution(harness, workOrder),
      delivery: convertGitOps(harness.gitOps),
    },
  };
}

function convertLoopStrategy(loop: LoopStrategyConfig): ConvergenceSpec {
  // Map loop strategy mode to convergence strategy
  const strategyMap: Record<LoopStrategyMode, ConvergenceStrategy> = {
    fixed: 'fixed',
    hybrid: 'hybrid',
    ralph: 'ralph',
    custom: 'manual',
  };

  return {
    strategy: strategyMap[loop.mode],
    config: {
      iterations: loop.mode === 'fixed' ? loop.maxIterations : undefined,
      baseIterations: loop.mode === 'hybrid' ? loop.baseIterations : undefined,
      bonusIterations: loop.mode === 'hybrid' ? loop.maxBonusIterations : undefined,
      progressThreshold: loop.mode === 'hybrid' ? loop.progressThreshold : undefined,
      convergenceThreshold: loop.mode === 'ralph' ? loop.convergenceThreshold : undefined,
      windowSize: loop.mode === 'ralph' ? loop.windowSize : undefined,
    },
    gates: convertToGates(harness.verification, loop.completionDetection),
    limits: {
      maxIterations: harness.executionLimits?.maxIterations,
      maxWallClock: harness.executionLimits?.maxWallClockSeconds
        ? `${harness.executionLimits.maxWallClockSeconds}s`
        : undefined,
    },
  };
}
```

**Verification**:
- [ ] Converts all loop strategy modes correctly
- [ ] Preserves verification configuration
- [ ] Converts git ops to delivery spec
- [ ] Handles missing optional fields

---

## 1.4 Verification Steps

### Per-Subtask Verification

1. **Type Compilation**
   ```bash
   pnpm --filter @agentgate/server typecheck
   ```

2. **Schema Validation Tests**
   ```bash
   pnpm --filter @agentgate/shared test -- --grep "TaskSpec schema"
   ```

3. **Loader Tests**
   ```bash
   pnpm --filter @agentgate/server test -- --grep "TaskSpecLoader"
   ```

4. **Resolver Tests**
   ```bash
   pnpm --filter @agentgate/server test -- --grep "TaskSpecResolver"
   ```

5. **Converter Tests**
   ```bash
   pnpm --filter @agentgate/server test -- --grep "HarnessConfig converter"
   ```

### Integration Verification

```bash
# Full type check
pnpm typecheck

# Full test suite
pnpm test

# Build verification
pnpm build
```

---

## 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/task-spec.ts` | Created |
| `packages/server/src/types/convergence.ts` | Created |
| `packages/server/src/types/gate.ts` | Created |
| `packages/server/src/types/execution.ts` | Created |
| `packages/server/src/types/delivery.ts` | Created |
| `packages/server/src/types/index.ts` | Modified (exports) |
| `packages/shared/src/schemas/task-spec.schema.ts` | Created |
| `packages/shared/src/schemas/index.ts` | Modified (exports) |
| `packages/server/src/task-spec/loader.ts` | Created |
| `packages/server/src/task-spec/resolver.ts` | Created |
| `packages/server/src/task-spec/converter.ts` | Created |
| `packages/server/src/task-spec/index.ts` | Created |
| `packages/server/test/unit/task-spec/` | Created (tests) |
| `packages/shared/test/unit/schemas/task-spec.schema.test.ts` | Created |

---

## 1.6 Example TaskSpec Documents

### Minimal TaskSpec

```yaml
apiVersion: agentgate.io/v1
kind: TaskSpec
metadata:
  name: fix-types

spec:
  goal:
    prompt: "Fix all TypeScript type errors in the project"

  convergence:
    strategy: hybrid
    gates:
      - name: local-verify
        check:
          type: verification-levels
          levels: [L0, L1]
        onFailure:
          action: iterate

  execution:
    workspace:
      source: local
      path: /path/to/project
    agent:
      driver: claude-code-subscription

  delivery:
    git:
      mode: local
```

### Full-Featured TaskSpec

```yaml
apiVersion: agentgate.io/v1
kind: TaskSpec
metadata:
  name: implement-auth
  namespace: backend
  labels:
    priority: high
    type: feature
  annotations:
    description: "Complete authentication system with JWT"
    ticket: "JIRA-1234"

spec:
  goal:
    prompt: |
      Implement user authentication with JWT tokens.

      Requirements:
      - POST /auth/login - authenticate user, return JWT
      - POST /auth/logout - invalidate token
      - POST /auth/refresh - refresh expired token
      - Middleware for protected routes

      Use bcrypt for password hashing.
      Store refresh tokens in Redis.
    context: |
      The project uses Express.js with TypeScript.
      Database is PostgreSQL with Prisma ORM.
      Redis is available at localhost:6379.
    desiredState:
      allGatesPassed: true

  convergence:
    strategy: ralph
    config:
      convergenceThreshold: 0.05
      windowSize: 3
      promptHotReload: true
    gates:
      - name: lint-and-types
        check:
          type: verification-levels
          levels: [L0, L1]
        onFailure:
          action: iterate
          maxAttempts: 15
          feedback: auto
      - name: tests
        check:
          type: verification-levels
          levels: [L2, L3]
        onFailure:
          action: iterate
          maxAttempts: 10
          feedback: auto
      - name: ci
        check:
          type: github-actions
          workflows: [ci.yml, test.yml]
          timeout: "30m"
        onFailure:
          action: iterate
          maxAttempts: 3
          feedback: auto
    limits:
      maxIterations: 100
      maxWallClock: "4h"
      maxCost: "$200"
      maxTokens: 2000000

  execution:
    workspace:
      source: github
      owner: mycompany
      repo: backend-api
      ref: main
    sandbox:
      provider: docker
      image: node:20-slim
      resources:
        cpu: 4
        memory: "8Gi"
        disk: "20Gi"
      network: bridge
      mounts:
        - source: ~/.npm
          target: /root/.npm
          readonly: false
    agent:
      driver: claude-code-subscription
      model: claude-sonnet-4-20250514
      maxTokens: 200000
      systemPrompt: |
        You are an expert backend developer.
        Follow the project's coding conventions.
        Write comprehensive tests for all new code.

  delivery:
    git:
      mode: github-pr
      branchPrefix: "feature/"
      commitPrefix: "[Auth]"
      autoCommit: true
    pr:
      create: true
      draft: false
      title: "feat(auth): implement JWT authentication"
      labels: [feature, backend, auth]
      reviewers: [lead-dev, security-team]
      autoMerge: false
```

---

## 1.7 Dependencies

- This thrust has no dependencies on other thrusts
- Thrusts 2-5 depend on this thrust completing first
- Required external packages: `zod`, `yaml` (already installed)

---

## 1.8 Notes

### Naming Rationale

- **TaskSpec** chosen over alternatives:
  - "WorkSpec" - too similar to WorkOrder
  - "JobSpec" - too similar to Kubernetes Job
  - "AgentSpec" - conflicts with agent driver config
  - "TaskConfig" - "Config" implies mutable state

- **Convergence** chosen over "Loop":
  - Better describes the goal (reaching desired state)
  - Avoids confusion with programmatic loops
  - Aligns with control theory terminology

### Future Extensions

The TaskSpec format is designed for future extensions:
- Additional gate types (security scanning, performance testing)
- Custom convergence strategies
- Multi-agent coordination
- Cost tracking and budgeting
