# 05: Orchestrator & CLI Integration

This document covers Thrusts 9-10: integrating the harness system into the orchestrator and CLI.

---

## Thrust 9: Orchestrator Integration

### 9.1 Objective

Wire the harness configuration and loop strategy system into the orchestrator and run executor, replacing the fixed iteration loop with strategy-driven control.

### 9.2 Background

The orchestrator is the main entry point for work order execution. Currently it uses a hardcoded iteration loop. This thrust replaces that with the pluggable loop strategy system while maintaining backwards compatibility.

### 9.3 Subtasks

#### 9.3.1 Modify Orchestrator Constructor

In `packages/server/src/orchestrator/orchestrator.ts`:
- Add `defaultHarnessConfig?: Partial<HarnessConfig>` to `OrchestratorConfig`
- Store default harness config in instance

#### 9.3.2 Add Harness Resolution to Execute

In `Orchestrator.execute(workOrder)` method:
- Import harness modules dynamically (like other modules)
- Extract harness-related CLI options from work order
- Call `resolveHarnessConfig()` with:
  - Profile name from `--harness` option (if provided)
  - CLI overrides from work order options
  - Workspace path for relative resolution
- Create strategy instance from `strategyRegistry.create(resolvedConfig.loopStrategy)`
- Pass resolved config and strategy to `executeRun()`

#### 9.3.3 Extend RunExecutorOptions

In `packages/server/src/orchestrator/run-executor.ts`:
- Add to `RunExecutorOptions` interface:
  - `harnessConfig: ResolvedHarnessConfig`
  - `loopStrategy: LoopStrategy`
- Make these required (no backwards compat concerns in internal API)

#### 9.3.4 Modify executeRun Function

Replace the fixed iteration loop with strategy-driven loop:

**Before:**
```
for (let iteration = 1; iteration <= maxIterations; iteration++) {
  // execute iteration
  if (passed) break;
}
```

**After:**
```
await strategy.initialize(config.loopStrategy);
let iteration = 0;

while (true) {
  iteration++;

  // Build LoopContext
  const context = buildLoopContext(run, workspace, config, state, ...);

  // Notify strategy of iteration start
  await strategy.onIterationStart(context);

  // Execute iteration (existing logic)
  const result = await executeIteration(...);

  // Update context with results
  context.verificationReport = result.verificationReport;
  context.agentOutput = result.agentOutput;
  context.ciStatus = result.ciStatus;

  // Ask strategy if we should continue
  const decision = await strategy.shouldContinue(context);

  // Notify strategy of iteration complete
  await strategy.onIterationComplete(context, decision);

  // Exit if strategy says stop
  if (!decision.shouldContinue) {
    await strategy.onRunComplete(context, decision);
    break;
  }
}
```

#### 9.3.5 Build LoopContext Helper

Create `buildLoopContext()` helper function:
- Construct `LoopContext` object with:
  - Current `run` object
  - `workspace` reference
  - `harnessConfig`
  - Current `LoopState` from strategy
  - Latest verification report (null initially)
  - Latest agent output (null initially)
  - CI status (null initially)

#### 9.3.6 Handle Strategy Decisions

Map strategy decisions to run outcomes:
- `action: 'complete'` -> Mark run as SUCCEEDED
- `action: 'fail'` -> Mark run as FAILED
- `action: 'timeout'` -> Mark run as FAILED with timeout reason
- `action: 'continue'` -> Continue to next iteration

#### 9.3.7 Pass Harness Config to Callbacks

Update orchestrator callbacks to receive harness config:
- `onBuild(run, harnessConfig, ...)`
- `onVerify(run, harnessConfig, ...)`
- `onFeedback(run, harnessConfig, ...)`

### 9.4 Verification Steps

1. Execute work order with default harness (hybrid strategy)
2. Verify iteration continues/stops based on strategy decision
3. Test with `--loop-strategy fixed` override
4. Test with named profile
5. Verify backwards compatibility with existing CLI options

### 9.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/orchestrator/orchestrator.ts` | Modified |
| `packages/server/src/orchestrator/run-executor.ts` | Modified |

---

## Thrust 10: CLI Integration

### 10.1 Objective

Add harness-related CLI options to the submit command and create a new profile management command.

### 10.2 Background

The CLI needs to support:
1. Selecting harness profiles via `--harness`
2. Overriding strategy via `--loop-strategy`
3. Managing profiles via `agentgate profile` command

### 10.3 Subtasks

#### 10.3.1 Update Submit Command Options

In `packages/server/src/control-plane/commands/submit.ts`:

Add new Commander options:
- `--harness <profile>` - Load named harness profile
- `--loop-strategy <mode>` - Override loop strategy mode (fixed, hybrid, ralph, custom)
- `--completion <criteria>` - Override completion criteria (comma-separated)

Update option parsing:
- Parse `--loop-strategy` to `LoopStrategyMode` enum
- Parse `--completion` to `CompletionDetection[]` array

#### 10.3.2 Update Validators

In `packages/server/src/control-plane/validators.ts`:

Add to `submitCommandOptionsSchema`:
```typescript
harness: z.string().optional(),
loopStrategy: z.nativeEnum(LoopStrategyMode).optional(),
completion: z.array(z.nativeEnum(CompletionDetection)).optional(),
```

Create helper to convert CLI options to harness overrides:
```typescript
function cliOptionsToHarnessOverrides(options): Partial<HarnessConfig>
```

#### 10.3.3 Create Profile Command

Create `packages/server/src/control-plane/commands/profile.ts`:

**profile list:**
- List all profiles in `~/.agentgate/harnesses/`
- Show name, description, extends for each
- Format as table

**profile show <name>:**
- Load and display full profile
- Show inheritance chain if applicable
- Format as YAML

**profile create <name>:**
- Interactive creation (or use flags)
- `--extends <parent>` - Set parent profile
- `--strategy <mode>` - Set loop strategy
- `--description <text>` - Set description
- Save to `~/.agentgate/harnesses/<name>.yaml`

**profile validate <path>:**
- Load profile from path
- Validate against schema
- Report errors or success

**profile delete <name>:**
- Delete profile file
- Confirm before deletion (unless --force)

#### 10.3.4 Register Profile Command

In `packages/server/src/control-plane/commands/index.ts`:
- Import and register profile command
- Add to command hierarchy

#### 10.3.5 Add Help Text

Update help text for all new options:
```
--harness <profile>       Load harness profile from ~/.agentgate/harnesses/
--loop-strategy <mode>    Override loop strategy: fixed, hybrid, ralph, custom
--completion <criteria>   Override completion criteria (comma-separated)
```

#### 10.3.6 Update CLI Help Output

Ensure `agentgate --help` shows:
- New submit options
- New profile command

### 10.4 Verification Steps

1. Test `agentgate submit --harness default`
2. Test `agentgate submit --loop-strategy fixed`
3. Test `agentgate profile list`
4. Test `agentgate profile show default`
5. Test `agentgate profile create test --strategy hybrid`
6. Test `agentgate profile validate ./custom.yaml`
7. Verify help text is correct

### 10.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/control-plane/commands/submit.ts` | Modified |
| `packages/server/src/control-plane/commands/profile.ts` | Created |
| `packages/server/src/control-plane/commands/index.ts` | Modified |
| `packages/server/src/control-plane/validators.ts` | Modified |

---

## CLI Usage Examples

### Submit with Harness Profile

```bash
# Use ci-focused profile
agentgate submit \
  --harness ci-focused \
  --prompt "Implement feature X" \
  --github owner/repo

# Override strategy in ci-focused profile
agentgate submit \
  --harness ci-focused \
  --loop-strategy fixed \
  --max-iterations 2 \
  --prompt "Quick fix"
```

### Submit with Inline Strategy

```bash
# Ralph-style without profile
agentgate submit \
  --loop-strategy ralph \
  --max-iterations 10 \
  --prompt "Long-running refactor" \
  --github owner/repo

# Hybrid with custom completion
agentgate submit \
  --loop-strategy hybrid \
  --completion verification-pass,ci-pass \
  --wait-for-ci \
  --prompt "Feature with CI gate"
```

### Profile Management

```bash
# List available profiles
agentgate profile list

# Output:
# NAME              EXTENDS    DESCRIPTION
# default           -          Balanced hybrid strategy for most use cases
# ci-focused        default    CI-focused workflow with GitHub integration
# rapid-iteration   default    Fast iteration with minimal verification
# ralph-style       default    Loop until agent signals completion

# Show profile details
agentgate profile show ci-focused

# Output:
# name: ci-focused
# extends: default
# description: "CI-focused workflow with GitHub integration"
# loopStrategy:
#   mode: hybrid
#   maxIterations: 8
# ...

# Create custom profile
agentgate profile create my-project \
  --extends default \
  --strategy hybrid \
  --description "Custom profile for my project"

# Validate external profile
agentgate profile validate ./team-profile.yaml
```

---

## Backwards Compatibility

### Existing CLI Options Still Work

All existing CLI options continue to work and take precedence over profiles:

| Option | Profile Field | Behavior |
|--------|--------------|----------|
| `--max-iterations` | `loopStrategy.maxIterations` | Overrides profile |
| `--max-time` | `limits.maxWallClockSeconds` | Overrides profile |
| `--agent` | `agent.type` | Overrides profile |
| `--gate-plan` | `verification.gatePlanSource` | Overrides profile |
| `--wait-for-ci` | `verification.waitForCI` | Overrides profile |
| `--skip-verification` | `verification.skipLevels` | Overrides profile |
| `--network` | `limits.networkAllowed` | Overrides profile |

### Default Behavior Unchanged

When no `--harness` is specified:
- Default strategy is `hybrid` (was effectively `fixed` before)
- To maintain old behavior, use `--loop-strategy fixed`

### Migration for Scripts

Existing scripts work unchanged. For identical behavior to pre-v0.2.16:
```bash
# Before (implicit fixed)
agentgate submit --max-iterations 3 --prompt "..."

# After (explicit fixed for identical behavior)
agentgate submit --loop-strategy fixed --max-iterations 3 --prompt "..."

# After (recommended, uses smarter hybrid)
agentgate submit --max-iterations 3 --prompt "..."
```
