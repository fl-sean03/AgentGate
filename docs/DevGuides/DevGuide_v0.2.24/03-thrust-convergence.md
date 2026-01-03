# Thrust 2: Convergence Policies

## 2.1 Objective

Replace "loop strategies" with "convergence policies" - a system that determines when the agent has converged to the desired state. The convergence controller drives the iteration loop, consulting strategies and gates to make continue/stop decisions.

---

## 2.2 Background

### Current State

The existing loop strategy system (`packages/server/src/harness/strategies/`) provides:

```typescript
// Current LoopStrategy interface (9 methods)
interface LoopStrategy {
  readonly name: string;
  readonly mode: LoopStrategyMode;

  initialize(config: LoopStrategyConfig): Promise<void>;
  onLoopStart(context: LoopContext): Promise<void>;
  onIterationStart(context: LoopContext): Promise<void>;
  shouldContinue(context: LoopContext): Promise<LoopDecision>;  // Core
  onIterationEnd(context: LoopContext, decision: LoopDecision): Promise<void>;
  onLoopEnd(context: LoopContext, finalDecision: LoopDecision): Promise<void>;
  getProgress(context: LoopContext): LoopProgress;
  detectLoop(context: LoopContext): LoopDetectionData;
  reset(): void;
}
```

### Problems

1. **Over-Complex Interface**: 9 methods when core logic is `shouldContinue()`
2. **Scattered Completion Detection**: Each strategy reimplements completion checks
3. **Unclear Responsibilities**: Progress tracking mixed with decision making
4. **No Gate Integration**: Strategies don't know about gates

---

## 2.3 Subtasks

### 2.3.1 Define Convergence Controller Interface

**Files Created**:
- `packages/server/src/convergence/controller.ts`

**Specification**:

The convergence controller orchestrates the iteration loop:

```typescript
interface ConvergenceController {
  // Initialize with TaskSpec convergence configuration
  initialize(config: ConvergenceSpec): Promise<void>;

  // Main loop - returns when converged or limits reached
  run(context: ConvergenceContext): Promise<ConvergenceResult>;

  // Get current progress (for monitoring)
  getProgress(): ConvergenceProgress;

  // Force stop (for cancellation)
  stop(reason: string): Promise<void>;
}

interface ConvergenceContext {
  taskSpec: ResolvedTaskSpec;
  workOrderId: string;
  runId: string;

  // Callbacks for each phase
  onBuild: () => Promise<BuildResult>;
  onSnapshot: () => Promise<Snapshot>;
  onGateCheck: (gate: Gate) => Promise<GateResult>;
  onFeedback: (failures: GateFailure[]) => Promise<string>;
}

interface ConvergenceResult {
  status: 'converged' | 'diverged' | 'stopped' | 'error';
  iterations: number;
  finalState: ConvergenceState;
  gateResults: Record<string, GateResult>;
  reason: string;
}

interface ConvergenceProgress {
  iteration: number;
  maxIterations: number;
  elapsed: number;          // ms
  maxWallClock: number;     // ms
  gatesPassed: number;
  gatesTotal: number;
  trend: 'improving' | 'stagnant' | 'regressing';
  estimatedRemaining?: number;
}
```

**Implementation Flow**:

```
run(context):
  strategy = createStrategy(config.strategy)
  await strategy.initialize(config)

  while (!isTerminal):
    iteration++

    // Build phase
    buildResult = await context.onBuild()
    if (buildResult.failed):
      continue with feedback

    // Snapshot phase
    snapshot = await context.onSnapshot()

    // Gate evaluation phase
    allGatesPassed = true
    for gate in config.gates:
      result = await context.onGateCheck(gate)
      if (!result.passed):
        allGatesPassed = false
        if (gate.onFailure.action === 'stop'):
          return { status: 'diverged' }
        if (gate.onFailure.action === 'escalate'):
          // Notify, but continue
        // action === 'iterate': generate feedback, continue

    // Convergence check
    if (allGatesPassed):
      return { status: 'converged' }

    // Strategy consultation
    decision = await strategy.shouldContinue(state)
    if (!decision.shouldContinue):
      return { status: 'diverged', reason: decision.reason }

    // Limits check
    if (iteration >= limits.maxIterations):
      return { status: 'diverged', reason: 'max iterations' }
    if (elapsed >= limits.maxWallClock):
      return { status: 'diverged', reason: 'timeout' }

    // Feedback and continue
    feedback = await context.onFeedback(failures)

  return result
```

**Verification**:
- [ ] Controller runs iteration loop correctly
- [ ] Respects all limit types
- [ ] Handles gate failures appropriately
- [ ] Consults strategy for decision

---

### 2.3.2 Simplify Convergence Strategy Interface

**Files Created**:
- `packages/server/src/convergence/strategy.ts`

**Specification**:

New simplified interface focused on the core decision:

```typescript
interface ConvergenceStrategy {
  readonly name: string;
  readonly type: ConvergenceStrategyType;

  // Initialize with strategy-specific config
  initialize(config: ConvergenceConfig): Promise<void>;

  // Core question: should we continue iterating?
  shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision>;

  // Get progress metrics (optional)
  getProgress?(state: ConvergenceState): ProgressMetrics;

  // Reset for new run
  reset(): void;
}

type ConvergenceStrategyType = 'fixed' | 'hybrid' | 'ralph' | 'adaptive' | 'manual';

interface ConvergenceState {
  iteration: number;
  elapsed: number;              // ms since start
  gateResults: GateResult[];    // Results from current iteration
  history: IterationHistory[];  // Previous iterations
  snapshot?: Snapshot;          // Current snapshot
  agentOutput?: string;         // Latest agent output
}

interface ConvergenceDecision {
  continue: boolean;
  reason: string;
  confidence?: number;          // 0-1, how confident in decision
  metadata?: Record<string, unknown>;
}

interface IterationHistory {
  iteration: number;
  timestamp: Date;
  gateResults: GateResult[];
  decision: ConvergenceDecision;
  snapshotHash?: string;
}
```

**Verification**:
- [ ] Interface is simpler than current LoopStrategy
- [ ] All existing strategies can be reimplemented
- [ ] Decision includes confidence metric

---

### 2.3.3 Implement Fixed Strategy

**Files Created**:
- `packages/server/src/convergence/strategies/fixed.ts`

**Specification**:

Run exactly N iterations, stopping early only if converged:

```typescript
class FixedStrategy implements ConvergenceStrategy {
  readonly name = 'fixed';
  readonly type = 'fixed';

  private iterations: number = 3;

  async initialize(config: ConvergenceConfig): Promise<void> {
    this.iterations = config.iterations ?? 3;
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Check if all gates passed (converged)
    const allPassed = state.gateResults.every(r => r.passed);
    if (allPassed) {
      return {
        continue: false,
        reason: 'All gates passed',
        confidence: 1.0,
      };
    }

    // Check iteration limit
    if (state.iteration >= this.iterations) {
      return {
        continue: false,
        reason: `Reached ${this.iterations} iterations`,
        confidence: 1.0,
      };
    }

    return {
      continue: true,
      reason: `Iteration ${state.iteration}/${this.iterations}`,
      confidence: 1.0,
    };
  }

  reset(): void {
    // No state to reset
  }
}
```

**Verification**:
- [ ] Runs exactly N iterations if not converged
- [ ] Stops early if all gates pass
- [ ] Matches current FixedStrategy behavior

---

### 2.3.4 Implement Hybrid Strategy

**Files Created**:
- `packages/server/src/convergence/strategies/hybrid.ts`

**Specification**:

Base iterations plus bonus iterations if progress detected:

```typescript
class HybridStrategy implements ConvergenceStrategy {
  readonly name = 'hybrid';
  readonly type = 'hybrid';

  private baseIterations: number = 3;
  private bonusIterations: number = 2;
  private progressThreshold: number = 0.1;
  private progressTracker: ProgressTracker;

  async initialize(config: ConvergenceConfig): Promise<void> {
    this.baseIterations = config.baseIterations ?? 3;
    this.bonusIterations = config.bonusIterations ?? 2;
    this.progressThreshold = config.progressThreshold ?? 0.1;
    this.progressTracker = new ProgressTracker();
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Check if converged
    const allPassed = state.gateResults.every(r => r.passed);
    if (allPassed) {
      return { continue: false, reason: 'Converged', confidence: 1.0 };
    }

    // Check for loop detection
    if (this.detectLoop(state)) {
      return { continue: false, reason: 'Loop detected', confidence: 0.9 };
    }

    // Check base iterations
    if (state.iteration < this.baseIterations) {
      return {
        continue: true,
        reason: `Base iteration ${state.iteration}/${this.baseIterations}`,
        confidence: 1.0,
      };
    }

    // Check bonus iterations (if progress made)
    const bonusUsed = state.iteration - this.baseIterations;
    if (bonusUsed < this.bonusIterations) {
      const progress = this.progressTracker.calculate(state);
      if (progress >= this.progressThreshold) {
        return {
          continue: true,
          reason: `Bonus iteration (progress: ${(progress * 100).toFixed(1)}%)`,
          confidence: 0.8,
        };
      }
    }

    // Max iterations reached
    return {
      continue: false,
      reason: 'Max iterations with no sufficient progress',
      confidence: 0.7,
    };
  }

  private detectLoop(state: ConvergenceState): boolean {
    if (state.history.length < 3) return false;

    // Check for identical snapshot hashes
    const recent = state.history.slice(-3);
    const hashes = recent.map(h => h.snapshotHash).filter(Boolean);
    if (hashes.length === 3 && new Set(hashes).size === 1) {
      return true;
    }

    return false;
  }

  getProgress(state: ConvergenceState): ProgressMetrics {
    return this.progressTracker.getMetrics(state);
  }

  reset(): void {
    this.progressTracker.reset();
  }
}
```

**Verification**:
- [ ] Runs base iterations
- [ ] Awards bonus iterations on progress
- [ ] Detects loops
- [ ] Matches current HybridStrategy behavior

---

### 2.3.5 Implement Ralph Strategy

**Files Created**:
- `packages/server/src/convergence/strategies/ralph.ts`

**Specification**:

Continue until agent signals completion or similarity loop detected:

```typescript
class RalphStrategy implements ConvergenceStrategy {
  readonly name = 'ralph';
  readonly type = 'ralph';

  private convergenceThreshold: number = 0.05;
  private windowSize: number = 3;
  private minIterations: number = 1;
  private maxIterations: number = 10;
  private recentOutputs: string[] = [];

  // Completion signals to detect in agent output
  private readonly COMPLETION_SIGNALS = [
    'TASK_COMPLETE',
    'TASK_COMPLETED',
    'DONE',
    '[COMPLETE]',
    '[TASK COMPLETE]',
    '[DONE]',
  ];

  async initialize(config: ConvergenceConfig): Promise<void> {
    this.convergenceThreshold = config.convergenceThreshold ?? 0.05;
    this.windowSize = config.windowSize ?? 3;
    this.minIterations = config.minIterations ?? 1;
    this.maxIterations = config.maxIterations ?? 10;
  }

  async shouldContinue(state: ConvergenceState): Promise<ConvergenceDecision> {
    // Check if converged (all gates passed)
    const allPassed = state.gateResults.every(r => r.passed);
    if (allPassed) {
      return { continue: false, reason: 'Converged', confidence: 1.0 };
    }

    // Check max iterations
    if (state.iteration >= this.maxIterations) {
      return {
        continue: false,
        reason: `Max iterations (${this.maxIterations})`,
        confidence: 1.0,
      };
    }

    // Check for completion signal in agent output
    if (state.agentOutput) {
      for (const signal of this.COMPLETION_SIGNALS) {
        if (state.agentOutput.includes(signal)) {
          return {
            continue: false,
            reason: `Agent signaled: ${signal}`,
            confidence: 0.95,
          };
        }
      }
    }

    // Similarity-based loop detection
    if (state.agentOutput && this.detectSimilarityLoop(state.agentOutput)) {
      return {
        continue: false,
        reason: 'Similarity loop detected',
        confidence: 0.85,
      };
    }

    // Check min iterations
    if (state.iteration < this.minIterations) {
      return {
        continue: true,
        reason: `Min iterations not met (${state.iteration}/${this.minIterations})`,
        confidence: 1.0,
      };
    }

    // Continue by default
    return {
      continue: true,
      reason: 'No termination condition met',
      confidence: 0.6,
    };
  }

  private detectSimilarityLoop(output: string): boolean {
    // Tokenize and track recent outputs
    this.recentOutputs.push(output);
    if (this.recentOutputs.length > this.windowSize) {
      this.recentOutputs.shift();
    }

    if (this.recentOutputs.length < this.windowSize) {
      return false;
    }

    // Calculate Jaccard similarity between consecutive outputs
    for (let i = 1; i < this.recentOutputs.length; i++) {
      const similarity = this.jaccardSimilarity(
        this.recentOutputs[i - 1],
        this.recentOutputs[i]
      );
      if (similarity < 1 - this.convergenceThreshold) {
        return false; // Sufficient variation
      }
    }

    return true; // All recent outputs too similar
  }

  private jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.toLowerCase().split(/\s+/));
    const tokensB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    return intersection.size / union.size;
  }

  reset(): void {
    this.recentOutputs = [];
  }
}
```

**Verification**:
- [ ] Detects agent completion signals
- [ ] Implements Jaccard similarity loop detection
- [ ] Respects min/max iteration bounds
- [ ] Matches current RalphStrategy behavior

---

### 2.3.6 Create Progress Tracker

**Files Created**:
- `packages/server/src/convergence/progress.ts`

**Specification**:

Track progress across iterations using multiple signals:

```typescript
interface ProgressTracker {
  // Update with new iteration data
  update(state: ConvergenceState): void;

  // Calculate overall progress (0-1)
  calculate(state: ConvergenceState): number;

  // Get detailed metrics
  getMetrics(state: ConvergenceState): ProgressMetrics;

  // Reset for new run
  reset(): void;
}

interface ProgressMetrics {
  overall: number;              // 0-1 composite score
  byGate: Record<string, GateProgress>;
  trend: 'improving' | 'stagnant' | 'regressing';
  velocity: number;             // Progress per iteration
}

interface GateProgress {
  currentLevel: number;         // 0-1 how close to passing
  previousLevel: number;        // Last iteration level
  trend: 'improving' | 'stagnant' | 'regressing';
}

class DefaultProgressTracker implements ProgressTracker {
  private history: ProgressMetrics[] = [];

  calculate(state: ConvergenceState): number {
    const gateScores = state.gateResults.map(r => {
      if (r.passed) return 1.0;

      // Calculate partial progress for verification gates
      if (r.type === 'verification-levels') {
        const passed = r.levelResults.filter(l => l.passed).length;
        const total = r.levelResults.length;
        return passed / total;
      }

      // Other gates: binary pass/fail
      return 0;
    });

    return gateScores.reduce((a, b) => a + b, 0) / gateScores.length;
  }

  getMetrics(state: ConvergenceState): ProgressMetrics {
    const current = this.calculate(state);
    const previous = this.history.length > 0
      ? this.history[this.history.length - 1].overall
      : 0;

    const trend = current > previous + 0.05
      ? 'improving'
      : current < previous - 0.05
        ? 'regressing'
        : 'stagnant';

    const velocity = state.iteration > 0
      ? current / state.iteration
      : 0;

    return {
      overall: current,
      byGate: this.calculateByGate(state),
      trend,
      velocity,
    };
  }

  private calculateByGate(state: ConvergenceState): Record<string, GateProgress> {
    // Implementation...
  }

  update(state: ConvergenceState): void {
    this.history.push(this.getMetrics(state));
  }

  reset(): void {
    this.history = [];
  }
}
```

**Verification**:
- [ ] Calculates progress for verification gates
- [ ] Tracks progress history
- [ ] Determines trend correctly
- [ ] Calculates velocity

---

### 2.3.7 Create Strategy Registry

**Files Created**:
- `packages/server/src/convergence/registry.ts`

**Specification**:

Registry for convergence strategy implementations:

```typescript
interface StrategyRegistry {
  // Register a strategy implementation
  register(type: ConvergenceStrategyType, factory: StrategyFactory): void;

  // Create strategy instance
  create(type: ConvergenceStrategyType): ConvergenceStrategy;

  // List available strategies
  list(): ConvergenceStrategyType[];

  // Check if strategy exists
  has(type: ConvergenceStrategyType): boolean;
}

type StrategyFactory = () => ConvergenceStrategy;

class DefaultStrategyRegistry implements StrategyRegistry {
  private factories = new Map<ConvergenceStrategyType, StrategyFactory>();

  constructor() {
    // Register built-in strategies
    this.register('fixed', () => new FixedStrategy());
    this.register('hybrid', () => new HybridStrategy());
    this.register('ralph', () => new RalphStrategy());
    this.register('manual', () => new ManualStrategy());
    this.register('adaptive', () => new AdaptiveStrategy());
  }

  register(type: ConvergenceStrategyType, factory: StrategyFactory): void {
    if (this.factories.has(type)) {
      throw new DuplicateStrategyError(type);
    }
    this.factories.set(type, factory);
  }

  create(type: ConvergenceStrategyType): ConvergenceStrategy {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new StrategyNotFoundError(type);
    }
    return factory();
  }

  list(): ConvergenceStrategyType[] {
    return [...this.factories.keys()];
  }

  has(type: ConvergenceStrategyType): boolean {
    return this.factories.has(type);
  }
}

// Singleton instance
export const strategyRegistry = new DefaultStrategyRegistry();
```

**Verification**:
- [ ] Registers built-in strategies
- [ ] Creates strategy instances
- [ ] Throws for unknown strategies
- [ ] Supports custom strategy registration

---

## 2.4 Verification Steps

### Unit Tests

```bash
# Test convergence controller
pnpm --filter @agentgate/server test -- --grep "ConvergenceController"

# Test individual strategies
pnpm --filter @agentgate/server test -- --grep "FixedStrategy"
pnpm --filter @agentgate/server test -- --grep "HybridStrategy"
pnpm --filter @agentgate/server test -- --grep "RalphStrategy"

# Test progress tracker
pnpm --filter @agentgate/server test -- --grep "ProgressTracker"

# Test registry
pnpm --filter @agentgate/server test -- --grep "StrategyRegistry"
```

### Integration Tests

```bash
# End-to-end convergence tests
pnpm --filter @agentgate/server test:integration -- --grep "convergence"
```

### Behavior Verification

- [ ] Fixed strategy stops at exactly N iterations
- [ ] Hybrid strategy awards bonus on progress
- [ ] Ralph strategy detects completion signals
- [ ] Ralph strategy detects similarity loops
- [ ] Progress tracker calculates trends correctly
- [ ] All strategies stop when gates pass

---

## 2.5 Files Created/Modified

| File | Action |
|------|--------|
| `packages/server/src/convergence/controller.ts` | Created |
| `packages/server/src/convergence/strategy.ts` | Created |
| `packages/server/src/convergence/strategies/fixed.ts` | Created |
| `packages/server/src/convergence/strategies/hybrid.ts` | Created |
| `packages/server/src/convergence/strategies/ralph.ts` | Created |
| `packages/server/src/convergence/strategies/manual.ts` | Created |
| `packages/server/src/convergence/strategies/adaptive.ts` | Created (stub) |
| `packages/server/src/convergence/progress.ts` | Created |
| `packages/server/src/convergence/registry.ts` | Created |
| `packages/server/src/convergence/index.ts` | Created |
| `packages/server/src/harness/strategies/` | Deprecated |
| `packages/server/test/unit/convergence/` | Created (tests) |

---

## 2.6 Strategy Comparison

| Strategy | Termination Conditions | Best For |
|----------|----------------------|----------|
| `fixed` | N iterations OR gates pass | Predictable execution time |
| `hybrid` | Base + bonus on progress, gates pass, loop | Balance of flexibility and limits |
| `ralph` | Agent signal, similarity loop, gates pass, max | Open-ended exploration |
| `manual` | Human decision each iteration | High-stakes tasks |
| `adaptive` | ML-based (future) | Learned optimization |

---

## 2.7 Dependencies

- **Depends on**: Thrust 1 (TaskSpec types)
- **Enables**: Thrust 3 (gates use convergence controller)
