# 01: Overview - Work Order Harness Configuration

## Current State Analysis

### Existing Work Order Configuration

The current AgentGate work order system has configuration scattered across multiple places:

**CLI Options (submit.ts):**
- `--max-iterations` - Fixed number of agent iterations
- `--max-time` - Wall clock timeout
- `--agent` - Agent driver type
- `--gate-plan` - Verification gate source
- `--wait-for-ci` - CI polling after PR
- `--skip-verification` - Skip verification levels
- `--network` - Network access allowed

**Work Order Schema:**
- All options embedded directly in WorkOrder type
- No separation between run-loop config and agent config
- No persistence or reuse of configurations

**Run Executor:**
- Fixed iteration loop in `run-executor.ts`
- No pluggable loop control
- Hardcoded completion detection

### What's Missing

| Gap | Impact |
|-----|--------|
| No named profiles | Users repeat same flags every time |
| Fixed iteration only | Wasted iterations when task completes early |
| No completion detection | Agent keeps iterating after success |
| No progress tracking | Can't tell if making progress |
| No config audit | Hard to debug why iterations behaved differently |
| No profile inheritance | Can't compose configurations |

---

## Research Summary

### Ralph Wiggum Loop Pattern

Created by Geoffrey Huntley, Ralph is a simple but effective pattern for autonomous task completion:

**Core Concept:**
- Bash loop that keeps re-running agent until task marked complete
- Exit code 2 blocks agent from stopping
- State stored in `.agent/` directory

**Key Features:**
- Loop detection via 90% similarity check (last 5 outputs)
- Max retry threshold (typically 5 consecutive failures)
- Manual intervention escape hatch

**When to Use:**
- Batch operations (large refactors, support tickets)
- Long-running autonomous tasks
- When success criteria are well-defined upfront

### Anthropic Long-Running Harness

From Anthropic's engineering blog on effective agent harnesses:

**Two-Agent Pattern:**
1. **Initializer Agent**: First session only, sets up environment
2. **Coding Agent**: Subsequent sessions, makes incremental progress

**State Bridging (Across Context Windows):**
- `claude-progress.txt` - Human-readable progress logs
- `feature_list.json` - 200+ features with pass/fail status
- Git history - Structured record of changes

**Key Insight:**
> "Compaction isn't sufficient... even a frontier coding model running in a loop across multiple context windows will fall short."

**Feature-Level Granularity:**
- Agent marks individual features as passing only after e2e testing
- Prevents premature completion signaling
- Immutable feature list (only status field changes)

### Common CLAUDE.md Patterns (Research)

Analysis of 328 Claude Code projects revealed configuration patterns:

| Configuration Element | Prevalence |
|----------------------|------------|
| Software Architecture | 72.6% |
| Development Guidelines | 44.8% |
| Project Overview | 39.0% |
| Testing Guidelines | 35.4% |
| Testing Commands | 33.2% |
| Dependencies | 30.8% |

**Top 5 Configuration Patterns:**
1. Architecture + Dependencies + Project Overview (21.6%)
2. Architecture + General Guidelines (20.1%)
3. Architecture + Development Guidelines + Project Overview (19.8%)
4. Architecture + Development Guidelines + Testing (18.9%)
5. Architecture + Integration (17.7%)

**Key Finding:** Developers configure agents by establishing explicit architectural constraints alongside workflow practices.

---

## Architecture Design

### Two Separate Concerns

The harness system separates two distinct concerns:

**1. Harness Config (AgentGate-Owned)**

Controls how the run loop executes:
- Loop strategy (fixed, hybrid, ralph, custom)
- Verification settings (skip levels, wait for CI)
- Git operations (github vs local, PR creation)
- Execution limits (timeout, network, disk)

**2. Agent Profile (Repo-Native, Passthrough)**

Controls what the agent does:
- CLAUDE.md / agents.md instructions
- MCP servers configured in repo
- Agent skills and tools
- Role/persona definitions

**Design Principle:** AgentGate never injects or modifies repo-native agent config. It only provides gate plan summary and iteration feedback.

### HarnessConfig Structure

```
HarnessConfig
├── name: string (optional)
├── extends: string (optional - inheritance)
├── description: string (optional)
│
├── loopStrategy
│   ├── mode: 'fixed' | 'ralph' | 'hybrid' | 'custom'
│   ├── maxIterations: number
│   └── [mode-specific options]
│
├── agent
│   ├── type: AgentType
│   ├── maxTurns: number
│   ├── permissionMode: string
│   └── timeoutSeconds: number
│
├── verification
│   ├── gatePlanSource: GatePlanSource
│   ├── skipLevels: VerificationLevel[]
│   ├── waitForCI: boolean
│   └── ci: { timeoutSeconds, pollIntervalSeconds, maxIterations }
│
├── gitOps
│   ├── mode: 'local' | 'push-only' | 'github-pr'
│   ├── branchPattern: string
│   ├── draftPR: boolean
│   ├── prTitlePattern: string
│   └── autoMerge: boolean
│
└── limits
    ├── maxWallClockSeconds: number
    ├── networkAllowed: boolean
    ├── maxDiskMb: number
    └── forbiddenPatterns: string[]
```

### Loop Strategy Interface

```
LoopStrategy
├── name: string
├── mode: string
│
├── initialize(config): Promise<void>
├── onIterationStart(context): Promise<void>
├── shouldContinue(context): Promise<LoopDecision>
├── onIterationComplete(context, decision): Promise<void>
├── onRunComplete(context, decision): Promise<void>
└── getState(): LoopState
```

**LoopDecision:**
- `shouldContinue: boolean`
- `reason: string`
- `action: 'continue' | 'complete' | 'fail' | 'timeout'`

**LoopState:**
- Current iteration
- Decision history
- Progress metrics (highest verification level, features completed)
- Loop detection data (content hashes)

---

## Loop Strategies Comparison

### Fixed Strategy

**Behavior:** Run exactly N iterations regardless of outcome.

**Configuration:**
- `maxIterations: number` (default: 3)

**Completion:** After maxIterations reached.

**Use Case:** Simple tasks with predictable scope.

### Hybrid Strategy (Default)

**Behavior:** Progress tracking + completion criteria + limits.

**Configuration:**
- `maxIterations: number` (default: 5)
- `progressTracking: 'verification-levels' | 'git-history' | 'progress-file'`
- `completionCriteria: ['verification-pass', 'no-changes', 'ci-pass']`
- `minVerificationLevel: VerificationLevel` (default: L1)
- `acceptPartialAfter: number` (optional)

**Completion Detection:**
1. All verification levels pass (up to minimum)
2. No changes detected between iterations
3. CI passes (if waitForCI enabled)

**Loop Detection:**
- Hash verification results + snapshot SHA
- Detect when 3+ consecutive iterations produce same hash

**Why Default:** Best balance of thoroughness and efficiency.

### Ralph Strategy

**Behavior:** Loop until agent signals completion or max iterations.

**Configuration:**
- `maxIterations: number` (default: 10)
- `blockingExitCode: number` (default: 2)
- `loopDetection: boolean` (default: true)
- `similarityThreshold: number` (default: 0.9)
- `stateDir: string` (default: '.agent')

**Completion Detection:**
1. Agent output contains `TASK_COMPLETE` signal
2. Verification passes (if not skipped)
3. Loop detected (90% similarity to recent outputs)

**Use Case:** Long-running autonomous tasks.

### Custom Strategy

**Behavior:** Load user-defined strategy from module.

**Configuration:**
- `modulePath: string` - Path to strategy module
- `strategyName: string` (default: 'default')
- `config: Record<string, unknown>` - Custom options

**Use Case:** Advanced users with specific requirements.

---

## Config Resolution

### Resolution Order

Configurations are resolved in this order (later overrides earlier):

1. **Built-in defaults** - Hardcoded sensible defaults
2. **Default profile** - `~/.agentgate/harnesses/default.yaml`
3. **Named profile** - `--harness <name>` loads profile
4. **Inheritance chain** - Profile `extends:` resolved recursively
5. **CLI inline flags** - `--max-iterations`, `--wait-for-ci`, etc.

### Inheritance Example

```yaml
# ~/.agentgate/harnesses/default.yaml
name: default
loopStrategy:
  mode: hybrid
  maxIterations: 5
verification:
  gatePlanSource: auto
  waitForCI: false

# ~/.agentgate/harnesses/ci-focused.yaml
name: ci-focused
extends: default
loopStrategy:
  maxIterations: 8    # Overrides default's 5
  requireCI: true     # Adds new option
verification:
  waitForCI: true     # Overrides default's false
```

**Result for `--harness ci-focused`:**
```yaml
loopStrategy:
  mode: hybrid        # From default
  maxIterations: 8    # From ci-focused
  requireCI: true     # From ci-focused
verification:
  gatePlanSource: auto # From default
  waitForCI: true     # From ci-focused
```

---

## Audit Trail Design

### Purpose

Track configuration changes across iterations for debugging:
- What config was used for each iteration?
- Did config change during the run?
- What was the inheritance chain?

### Storage

```
~/.agentgate/audit/
└── runs/
    └── {runId}/
        ├── config-initial.json
        ├── config-iter-1.json (if changed)
        ├── config-iter-2.json (if changed)
        └── config-final.json
```

### Config Snapshot Structure

```
ConfigSnapshot
├── id: string
├── workOrderId: string
├── runId: string
├── iteration: number
├── config: ResolvedHarnessConfig
├── configHash: string
├── snapshotAt: Date
└── changesFromPrevious: ConfigChange[] | null
```

### When to Snapshot

1. **Run start** - Initial resolved config
2. **Iteration change** - If config differs from previous
3. **Run complete** - Final config state

---

## Integration Points

### Orchestrator Changes

**Current flow:**
```
Orchestrator.execute(workOrder)
  -> executeRun(run, workOrder, ...)
    -> fixed iteration loop
```

**New flow:**
```
Orchestrator.execute(workOrder)
  -> loadHarnessConfig(workOrder, cliOptions)
  -> resolveConfig(profile, inheritance, defaults)
  -> createStrategy(resolvedConfig.loopStrategy)
  -> executeRun(run, workOrder, strategy, ...)
    -> strategy.shouldContinue(context) loop
```

### Run Executor Changes

Replace fixed iteration loop with strategy-driven loop:

```typescript
// Before
for (let iteration = 1; iteration <= maxIterations; iteration++) {
  // ... execute iteration
  if (verificationPassed) break;
}

// After
while (true) {
  await strategy.onIterationStart(context);
  // ... execute iteration
  const decision = await strategy.shouldContinue(context);
  await strategy.onIterationComplete(context, decision);
  if (!decision.shouldContinue) break;
}
```

### CLI Changes

**New options:**
- `--harness <profile>` - Load named profile
- `--loop-strategy <mode>` - Override strategy mode
- `--completion <criteria>` - Override completion criteria

**New commands:**
- `agentgate profile list` - List available profiles
- `agentgate profile show <name>` - Show profile details
- `agentgate profile create <name>` - Interactive profile creation
- `agentgate profile validate <path>` - Validate profile file

---

## Migration Path

### Phase 1: Types and Strategies (No Breaking Changes)

Add new types and strategy implementations:
- No changes to existing behavior
- Fixed strategy matches current behavior exactly
- Tests verify parity

### Phase 2: Config System (No Breaking Changes)

Add profile loading and resolution:
- Profiles are optional
- Default behavior unchanged if no profile specified
- CLI options still work

### Phase 3: Orchestrator Integration (No Breaking Changes)

Wire harness into orchestrator:
- Use fixed strategy by default (same as before)
- Add `--harness` and `--loop-strategy` options
- Existing commands unchanged

### Phase 4: Default Strategy Switch (Opt-In)

After validation, change default:
- New default: hybrid strategy
- Existing scripts can add `--loop-strategy fixed` if needed
- Document migration path

---

## Testing Strategy

### Unit Tests

| Component | Tests |
|-----------|-------|
| HarnessConfig schemas | Zod validation, type guards |
| Fixed strategy | Iteration counting, termination |
| Hybrid strategy | Completion detection, loop detection |
| Ralph strategy | Signal detection, similarity check |
| Config loader | YAML parsing, validation errors |
| Config resolver | Inheritance, override precedence |

### Integration Tests

| Scenario | Verification |
|----------|--------------|
| Full run with hybrid | Completes on verification pass |
| Profile inheritance | Resolved config correct |
| CLI override | Inline flags take precedence |
| Audit trail | Snapshots saved correctly |

### E2E Tests

| Scenario | Verification |
|----------|--------------|
| Real agent with hybrid | Task completes appropriately |
| CI-focused profile | PR created, CI polled |
| Ralph strategy | Completes on agent signal |
