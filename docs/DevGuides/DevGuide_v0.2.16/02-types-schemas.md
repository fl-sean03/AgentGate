# 02: Types and Schemas

This document covers Thrusts 1-2: defining the core type definitions and Zod schemas for the harness configuration system.

---

## Thrust 1: Harness Config Types

### 1.1 Objective

Define the complete HarnessConfig type system with Zod schemas for validation, supporting loop strategies, agent configuration, verification settings, git operations, and execution limits.

### 1.2 Background

The harness config consolidates all run-loop configuration into a single, well-typed structure. It uses discriminated unions for strategy-specific options and Zod schemas for runtime validation.

### 1.3 Subtasks

#### 1.3.1 Create harness-config.ts

Create `packages/server/src/types/harness-config.ts` with the following type definitions:

**Loop Strategy Mode Enum:**
- Define `LoopStrategyMode` const object with values: `FIXED`, `RALPH`, `HYBRID`, `CUSTOM`
- Export as const and type

**Completion Detection Enum:**
- Define `CompletionDetection` with values: `AGENT_SIGNAL`, `VERIFICATION_PASS`, `NO_CHANGES`, `LOOP_DETECTION`, `CI_PASS`

**Progress Tracking Mode Enum:**
- Define `ProgressTrackingMode` with values: `GIT_HISTORY`, `PROGRESS_FILE`, `FEATURE_LIST`, `VERIFICATION_LEVELS`

**Git Operation Mode Enum:**
- Define `GitOperationMode` with values: `LOCAL`, `PUSH_ONLY`, `GITHUB_PR`

#### 1.3.2 Define Strategy-Specific Config Schemas

**Fixed Strategy Config:**
- `mode: literal('fixed')`
- `maxIterations: number (1-100, default 3)`

**Ralph Strategy Config:**
- `mode: literal('ralph')`
- `maxIterations: number (1-100, default 10)`
- `blockingExitCode: number (default 2)`
- `loopDetection: boolean (default true)`
- `similarityThreshold: number (0-1, default 0.9)`
- `stateDir: string (default '.agent')`

**Hybrid Strategy Config:**
- `mode: literal('hybrid')`
- `maxIterations: number (1-100, default 5)`
- `progressTracking: ProgressTrackingMode (default VERIFICATION_LEVELS)`
- `completionCriteria: CompletionDetection[] (default [VERIFICATION_PASS, NO_CHANGES])`
- `minVerificationLevel: VerificationLevel (default L1)`
- `acceptPartialAfter: number (optional)`
- `requireCI: boolean (default false)`
- `maxCIIterations: number (0-10, default 3)`

**Custom Strategy Config:**
- `mode: literal('custom')`
- `maxIterations: number (1-100, default 10)`
- `modulePath: string (required)`
- `strategyName: string (default 'default')`
- `config: Record<string, unknown> (optional)`

**Union Schema:**
- Create `loopStrategyConfigSchema` as discriminated union on `mode`

#### 1.3.3 Define Component Config Schemas

**Agent Driver Config:**
- `type: AgentType (default CLAUDE_CODE_SUBSCRIPTION)`
- `maxTurns: number (1-500, default 100)`
- `permissionMode: enum (default 'bypassPermissions')`
- `timeoutSeconds: number (60-86400, default 3600)`

**Verification Config:**
- `gatePlanSource: GatePlanSource (default AUTO)`
- `skipLevels: VerificationLevel[] (optional)`
- `waitForCI: boolean (default false)`
- `ci: { timeoutSeconds, pollIntervalSeconds, maxIterations } (optional)`

**Git Ops Config:**
- `mode: GitOperationMode (default LOCAL)`
- `branchPattern: string (default 'agentgate/{workOrderId}')`
- `draftPR: boolean (default true)`
- `prTitlePattern: string (default '[AgentGate] {taskSummary}')`
- `autoMerge: boolean (default false)`

**Execution Limits:**
- `maxWallClockSeconds: number (60-86400, default 3600)`
- `networkAllowed: boolean (default false)`
- `maxDiskMb: number (optional)`
- `forbiddenPatterns: string[] (default patterns for secrets)`

#### 1.3.4 Define Main HarnessConfig Schema

Create `harnessConfigSchema` with:
- `name: string (optional)` - Profile name
- `extends: string (optional)` - Parent profile for inheritance
- `description: string (optional)` - Human-readable description
- `loopStrategy: loopStrategyConfigSchema` - With hybrid default
- `agent: agentDriverConfigSchema (optional)`
- `verification: verificationConfigSchema (optional)`
- `gitOps: gitOpsConfigSchema (optional)`
- `limits: executionLimitsSchema (optional)`

#### 1.3.5 Define ResolvedHarnessConfig Interface

Create interface for fully-resolved config (after inheritance and defaults):
- `source: string` - Profile name or 'inline'
- `inheritanceChain: string[]` - Chain of extended profiles
- `resolvedAt: Date` - When config was resolved
- `configHash: string` - Hash for audit comparison
- All config fields as Required (no optionals)

#### 1.3.6 Define Audit Trail Types

**ConfigSnapshot:**
- `id: string`
- `workOrderId: string`
- `runId: string`
- `iteration: number`
- `config: ResolvedHarnessConfig`
- `snapshotAt: Date`
- `changesFromPrevious: ConfigChange[] | null`

**ConfigChange:**
- `path: string` - Dot-notation path to changed field
- `previousValue: unknown`
- `newValue: unknown`
- `reason: string`
- `initiator: 'user' | 'strategy' | 'system'`

**ConfigAuditRecord:**
- `runId: string`
- `initialConfig: ConfigSnapshot`
- `iterationSnapshots: ConfigSnapshot[]`
- `finalConfig: ConfigSnapshot`

### 1.4 Verification Steps

1. Create a test file that imports all types and schemas
2. Validate a complete HarnessConfig object with Zod
3. Verify discriminated union correctly discriminates on `mode`
4. Test default values are applied correctly
5. Verify type exports compile without errors

### 1.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/harness-config.ts` | Created |
| `packages/server/src/types/index.ts` | Modified - export new types |

---

## Thrust 2: Loop Strategy Types

### 2.1 Objective

Define the LoopStrategy interface and related types that enable pluggable loop control strategies.

### 2.2 Background

The LoopStrategy interface provides a contract for all loop strategies. It includes lifecycle methods for iteration start/complete, the core `shouldContinue` decision method, and state management.

### 2.3 Subtasks

#### 2.3.1 Create loop-strategy.ts

Create `packages/server/src/types/loop-strategy.ts` with the following types:

**LoopDecision Interface:**
- `shouldContinue: boolean` - Whether to run another iteration
- `reason: string` - Human-readable explanation
- `action: 'continue' | 'complete' | 'fail' | 'timeout'` - Suggested action
- `metadata?: Record<string, unknown>` - Additional context

**LoopProgress Interface:**
- `highestVerificationLevel: string | null` - Best level achieved
- `featuresCompleted: number` - For feature-list tracking
- `totalFeatures: number | null` - If known
- `progressPercent: number` - Estimated 0-100

**LoopDetectionData Interface:**
- `contentHashes: string[]` - Hashes of previous iterations
- `loopCount: number` - Detected loops count

**LoopState Interface:**
- `iteration: number` - Current iteration
- `decisions: LoopDecision[]` - History of decisions
- `progress: LoopProgress` - Progress metrics
- `loopDetection: LoopDetectionData` - Loop detection data
- `customState: Record<string, unknown>` - Strategy-specific state

#### 2.3.2 Define LoopContext Interface

Create context passed to strategy methods:
- `run: Run` - Current run object
- `workspace: Workspace` - Workspace being worked on
- `config: ResolvedHarnessConfig` - Harness configuration
- `state: LoopState` - Current loop state
- `verificationReport: VerificationReport | null` - Latest verification
- `agentOutput: string | null` - Latest agent output/feedback
- `ciStatus: { passed: boolean; feedback: string | null } | null` - CI status

#### 2.3.3 Define LoopStrategy Interface

Create the main strategy interface:
- `readonly name: string` - Strategy name for logging
- `readonly mode: string` - Strategy mode identifier
- `initialize(config: LoopStrategyConfig): Promise<void>` - Initialize with config
- `onIterationStart(context: LoopContext): Promise<void>` - Called before each iteration
- `shouldContinue(context: LoopContext): Promise<LoopDecision>` - Core decision method
- `onIterationComplete(context: LoopContext, decision: LoopDecision): Promise<void>` - After iteration
- `onRunComplete(context: LoopContext, finalDecision: LoopDecision): Promise<void>` - Cleanup
- `getState(): LoopState` - Get current state for serialization

#### 2.3.4 Define Factory Type

Create factory function type:
- `type LoopStrategyFactory = (config: LoopStrategyConfig) => LoopStrategy`

#### 2.3.5 Update Type Exports

Modify `packages/server/src/types/index.ts` to export all new types from both files.

### 2.4 Verification Steps

1. Create a mock implementation of LoopStrategy interface
2. Verify all interface methods can be implemented
3. Test LoopContext can be constructed with proper types
4. Verify LoopState serializes to JSON correctly
5. Run `pnpm typecheck` to ensure no type errors

### 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/types/loop-strategy.ts` | Created |
| `packages/server/src/types/index.ts` | Modified - export new types |

---

## Type Reference

### Enums Quick Reference

```
LoopStrategyMode: FIXED | RALPH | HYBRID | CUSTOM
CompletionDetection: AGENT_SIGNAL | VERIFICATION_PASS | NO_CHANGES | LOOP_DETECTION | CI_PASS
ProgressTrackingMode: GIT_HISTORY | PROGRESS_FILE | FEATURE_LIST | VERIFICATION_LEVELS
GitOperationMode: LOCAL | PUSH_ONLY | GITHUB_PR
```

### Default Values Reference

| Field | Default |
|-------|---------|
| `loopStrategy.mode` | `hybrid` |
| `loopStrategy.maxIterations` | `5` (hybrid), `3` (fixed), `10` (ralph) |
| `agent.type` | `claude-code-subscription` |
| `agent.maxTurns` | `100` |
| `agent.permissionMode` | `bypassPermissions` |
| `agent.timeoutSeconds` | `3600` |
| `verification.gatePlanSource` | `auto` |
| `verification.waitForCI` | `false` |
| `gitOps.mode` | `local` |
| `gitOps.branchPattern` | `agentgate/{workOrderId}` |
| `gitOps.draftPR` | `true` |
| `limits.maxWallClockSeconds` | `3600` |
| `limits.networkAllowed` | `false` |

### Zod Schema Patterns

**Enum Pattern:**
```
export const LoopStrategyMode = {
  FIXED: 'fixed',
  HYBRID: 'hybrid',
  ...
} as const;

export type LoopStrategyMode = (typeof LoopStrategyMode)[keyof typeof LoopStrategyMode];
```

**Discriminated Union Pattern:**
```
export const loopStrategyConfigSchema = z.discriminatedUnion('mode', [
  fixedStrategyConfigSchema,
  hybridStrategyConfigSchema,
  ...
]);
```

**Optional with Default Pattern:**
```
maxIterations: z.number().int().min(1).max(100).default(5),
```
