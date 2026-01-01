# 03: Loop Strategies

This document covers Thrusts 3-6: implementing the four loop strategy implementations and the strategy registry.

---

## Thrust 3: Fixed Strategy Implementation

### 3.1 Objective

Implement the FixedIterationStrategy that replicates current AgentGate behavior - run exactly N iterations.

### 3.2 Background

The fixed strategy is the simplest strategy and serves as the baseline. It matches the current hardcoded behavior in run-executor.ts, ensuring backwards compatibility.

### 3.3 Subtasks

#### 3.3.1 Create Strategy Registry

Create `packages/server/src/harness/strategy-registry.ts`:
- Define `StrategyRegistry` class with:
  - `private factories: Map<LoopStrategyMode, LoopStrategyFactory>`
  - `register(mode, factory)` method
  - `create(config)` method
  - `getAvailableModes()` method
- Export singleton `strategyRegistry` instance
- Add logging for registration and creation

#### 3.3.2 Create Base Strategy Class

Create `packages/server/src/harness/strategies/base-strategy.ts`:
- Define abstract `BaseLoopStrategy` class implementing `LoopStrategy`
- Implement protected `createInitialState()` method
- Implement `initialize()` with basic logging
- Implement `onIterationStart()` that updates iteration count
- Implement `onIterationComplete()` that records decision and updates progress
- Implement `onRunComplete()` with summary logging
- Implement `getState()` that returns shallow copy of state
- Add protected `updateProgressFromVerification(context)` helper
- Add protected `createDecision(shouldContinue, reason, action, metadata)` helper

#### 3.3.3 Implement Fixed Strategy

Create `packages/server/src/harness/strategies/fixed-strategy.ts`:
- Extend `BaseLoopStrategy`
- Set `name = 'FixedIterationStrategy'` and `mode = 'fixed'`
- Store `FixedStrategyConfig` in constructor
- Implement `shouldContinue(context)`:
  - Return false if `iteration >= maxIterations`
  - Return false if verification passed
  - Otherwise return true to continue
- Decision actions:
  - `complete` when verification passes
  - `timeout` when max iterations reached
  - `continue` otherwise

#### 3.3.4 Register Fixed Strategy

In `strategy-registry.ts`:
- Import `FixedIterationStrategy`
- Register in constructor: `this.register(LoopStrategyMode.FIXED, (config) => new FixedIterationStrategy(config))`

### 3.4 Verification Steps

1. Create unit test for FixedIterationStrategy
2. Verify it returns `shouldContinue: false` after N iterations
3. Verify it returns `shouldContinue: false` when verification passes
4. Verify state tracking is accurate
5. Verify registry creates strategy correctly

### 3.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/strategy-registry.ts` | Created |
| `packages/server/src/harness/strategies/base-strategy.ts` | Created |
| `packages/server/src/harness/strategies/fixed-strategy.ts` | Created |
| `packages/server/src/harness/strategies/index.ts` | Created - exports |
| `packages/server/src/harness/index.ts` | Created - module exports |

---

## Thrust 4: Hybrid Strategy Implementation

### 4.1 Objective

Implement the HybridStrategy that combines progress tracking with completion criteria - the recommended default strategy.

### 4.2 Background

The hybrid strategy is designed to produce the best code results by:
1. Tracking progress via verification levels
2. Detecting when task is complete via multiple criteria
3. Detecting loops when no progress is being made
4. Allowing partial acceptance after enough iterations

### 4.3 Subtasks

#### 4.3.1 Implement Hybrid Strategy

Create `packages/server/src/harness/strategies/hybrid-strategy.ts`:
- Extend `BaseLoopStrategy`
- Set `name = 'HybridStrategy'` and `mode = 'hybrid'`
- Store `HybridStrategyConfig` as `hybridConfig`

#### 4.3.2 Implement shouldContinue Method

The `shouldContinue(context)` method should:
1. Check max iterations - return false with action `timeout` or partial complete
2. Check completion criteria in order - return false with action `complete` if met
3. Check loop detection - return false with action based on partial acceptance
4. Return true with action `continue` otherwise

#### 4.3.3 Implement Completion Criteria Checking

Create private `checkCriterion(criterion, context)` method:

**VERIFICATION_PASS:**
- Check if `verificationReport?.passed` is true
- Get highest passing level
- Compare against `minVerificationLevel`
- Return met if level meets minimum

**CI_PASS:**
- Check if `ciStatus?.passed` is true
- Return met if CI passed

**NO_CHANGES:**
- Compute content hash from current state
- Compare to previous iteration's hash
- Return met if hashes match

**AGENT_SIGNAL:**
- Check if `agentOutput` contains 'TASK_COMPLETE'
- Return met if signal found

#### 4.3.4 Implement Loop Detection

Create private `detectLoop(context)` method:
- Compute content hash from verification results and snapshot SHA
- Store in `state.loopDetection.contentHashes`
- Keep only last 5 hashes
- Check if last 3 hashes are identical
- Increment `loopCount` if loop detected
- Return true if loop detected

Create private `computeContentHash(context)` method:
- Hash combination of:
  - L0-L3 verification results
  - Snapshot SHA
- Use SHA256, return first 16 chars

#### 4.3.5 Implement Helper Methods

Create private `getHighestLevel(report)` method:
- Return highest passing verification level

Create private `levelMeetsMinimum(actual, minimum)` method:
- Compare verification levels by order

Create private `determinePartialAction(context)` method:
- Check if `acceptPartialAfter` is set and reached
- Return `complete` if accepting partial
- Return `fail` otherwise

#### 4.3.6 Register Hybrid Strategy

In `strategy-registry.ts`:
- Import `HybridStrategy`
- Register: `this.register(LoopStrategyMode.HYBRID, (config) => new HybridStrategy(config))`

### 4.4 Verification Steps

1. Create unit test for HybridStrategy
2. Test completion on verification pass
3. Test completion on no-changes detection
4. Test loop detection with repeated hashes
5. Test partial acceptance after N iterations
6. Verify progress tracking accuracy

### 4.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/strategies/hybrid-strategy.ts` | Created |
| `packages/server/src/harness/strategy-registry.ts` | Modified - register hybrid |

---

## Thrust 5: Ralph Strategy Implementation

### 5.1 Objective

Implement the RalphLoopStrategy based on Geoffrey Huntley's Ralph Wiggum technique - loop until agent signals completion.

### 5.2 Background

The Ralph strategy is designed for long-running autonomous tasks. It continues iterating until:
1. Agent explicitly signals task completion
2. Loop is detected (output similarity)
3. Max iterations reached

### 5.3 Subtasks

#### 5.3.1 Implement Ralph Strategy

Create `packages/server/src/harness/strategies/ralph-strategy.ts`:
- Extend `BaseLoopStrategy`
- Set `name = 'RalphLoopStrategy'` and `mode = 'ralph'`
- Store `RalphStrategyConfig` as `ralphConfig`

#### 5.3.2 Implement shouldContinue Method

The `shouldContinue(context)` method should:
1. Check max iterations - return false with action `timeout`
2. Check for completion signal in agent output
3. If loop detection enabled, check for repeated outputs
4. Check verification pass if not skipped
5. Return true to continue otherwise

#### 5.3.3 Implement Completion Signal Detection

Create private `checkCompletionSignal(context)` method:
- Check for known completion signals in `agentOutput`:
  - `TASK_COMPLETE`
  - `TASK_COMPLETED`
  - `DONE`
  - `[COMPLETE]`
- Return true if any signal found

#### 5.3.4 Implement Similarity-Based Loop Detection

Create private `checkSimilarityLoop(context)` method:
- Compute similarity between current output and last N outputs
- Use simple Jaccard similarity or Levenshtein ratio
- If similarity >= `similarityThreshold` for last 3 outputs, detect loop
- Update `state.loopDetection.loopCount`

Create private `computeSimilarity(output1, output2)` method:
- Tokenize both outputs
- Compute Jaccard similarity: |intersection| / |union|
- Return similarity ratio (0-1)

#### 5.3.5 Implement State Directory Support

Create private `persistState(context)` method:
- If `stateDir` is configured
- Write current state to `{workspace}/{stateDir}/loop-state.json`
- Write iteration metrics to `{workspace}/{stateDir}/metrics.json`

Create private `loadState(context)` method:
- Load state from state directory if exists
- Allows resumption after crashes

#### 5.3.6 Register Ralph Strategy

In `strategy-registry.ts`:
- Import `RalphLoopStrategy`
- Register: `this.register(LoopStrategyMode.RALPH, (config) => new RalphLoopStrategy(config))`

### 5.4 Verification Steps

1. Create unit test for RalphLoopStrategy
2. Test completion on agent signal
3. Test loop detection via similarity
4. Test max iterations timeout
5. Test state persistence (optional)
6. Verify similarity threshold works correctly

### 5.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/strategies/ralph-strategy.ts` | Created |
| `packages/server/src/harness/strategy-registry.ts` | Modified - register ralph |

---

## Thrust 6: Custom Strategy Implementation

### 6.1 Objective

Implement the CustomStrategy that loads user-defined strategy modules dynamically.

### 6.2 Background

The custom strategy enables advanced users to define their own loop control logic without modifying AgentGate core. Strategies are loaded from a specified module path.

### 6.3 Subtasks

#### 6.3.1 Implement Custom Strategy Loader

Create `packages/server/src/harness/strategies/custom-strategy.ts`:
- Extend `BaseLoopStrategy`
- Set `name = 'CustomStrategy'` and `mode = 'custom'`
- Store `CustomStrategyConfig` as `customConfig`
- Store loaded strategy as `delegateStrategy: LoopStrategy | null`

#### 6.3.2 Implement Dynamic Module Loading

Override `initialize(config)` method:
- Resolve `modulePath` relative to workspace or absolute
- Dynamically import the module using `import()`
- Get the strategy class/function by `strategyName`
- Instantiate with `customConfig.config` if provided
- Store as `delegateStrategy`
- Validate delegate implements LoopStrategy interface

#### 6.3.3 Delegate All Methods

Implement delegation for all LoopStrategy methods:
- `onIterationStart` - Call `delegateStrategy.onIterationStart()`
- `shouldContinue` - Call `delegateStrategy.shouldContinue()`
- `onIterationComplete` - Call `delegateStrategy.onIterationComplete()`
- `onRunComplete` - Call `delegateStrategy.onRunComplete()`
- `getState` - Call `delegateStrategy.getState()`

#### 6.3.4 Handle Errors Gracefully

Add error handling:
- Module not found - throw descriptive error
- Strategy not found in module - throw descriptive error
- Invalid strategy interface - throw validation error
- Runtime errors - log and rethrow with context

#### 6.3.5 Register Custom Strategy

In `strategy-registry.ts`:
- Import `CustomStrategy`
- Register: `this.register(LoopStrategyMode.CUSTOM, (config) => new CustomStrategy(config))`

### 6.4 Verification Steps

1. Create a test custom strategy module
2. Test loading strategy by path
3. Test loading strategy by name
4. Test delegation of all methods
5. Test error handling for invalid modules
6. Verify custom config is passed correctly

### 6.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/harness/strategies/custom-strategy.ts` | Created |
| `packages/server/src/harness/strategy-registry.ts` | Modified - register custom |
| `packages/server/test/fixtures/custom-strategy.ts` | Created - test fixture |

---

## Strategy Comparison Reference

| Feature | Fixed | Hybrid | Ralph | Custom |
|---------|-------|--------|-------|--------|
| Max iterations | Required | Required | Required | Configurable |
| Verification check | Yes | Yes | Optional | Configurable |
| Completion criteria | Verify only | Multiple | Signal/loop | User-defined |
| Loop detection | No | Hash-based | Similarity | User-defined |
| Progress tracking | No | Yes | Optional | User-defined |
| Partial acceptance | No | Optional | No | User-defined |
| State persistence | No | No | Optional | User-defined |

---

## Strategy Selection Guide

**Use Fixed when:**
- Task has predictable scope
- You know exactly how many iterations needed
- Debugging or testing

**Use Hybrid when:**
- Default choice for most tasks
- Want smart completion detection
- Care about not wasting iterations

**Use Ralph when:**
- Long-running autonomous tasks
- Agent can signal completion
- Want maximum autonomy

**Use Custom when:**
- Existing strategies don't fit
- Have specialized requirements
- Building on top of AgentGate
