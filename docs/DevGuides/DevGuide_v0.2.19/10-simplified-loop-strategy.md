# 10: Thrust 9 - Simplified Loop Strategy

## Overview

Replace the current 5-callback loop strategy interface with a single, unified callback that receives full context and returns a clear decision, making strategies easier to implement and understand.

---

## Current State

### Complex Callback Interface

**Location:** `packages/server/src/types/loop-strategy.ts` (current)

```typescript
interface LoopStrategy {
  // Called before each iteration
  onIterationStart(iteration: number, context: LoopContext): Promise<void>;

  // Called after agent execution
  onAgentComplete(iteration: number, result: AgentResult): Promise<void>;

  // Called after verification
  onVerificationComplete(iteration: number, report: VerificationReport): Promise<void>;

  // Called to decide if we should continue
  shouldContinue(iteration: number): Promise<boolean>;

  // Called when loop ends
  onLoopComplete(reason: LoopEndReason): Promise<void>;
}
```

### Problems

1. **5 callbacks** - Too many entry points to understand
2. **State management** - Strategy must track state across callbacks
3. **Ordering dependencies** - Callbacks must be called in right order
4. **Unclear decision point** - shouldContinue is separate from data callbacks
5. **Hard to test** - Must verify all callbacks are called correctly

### Current Usage Pattern

```typescript
// In run-executor.ts
for (let i = 0; i < maxIterations; i++) {
  await strategy.onIterationStart(i, context);

  const agentResult = await runAgent();
  await strategy.onAgentComplete(i, agentResult);

  const verification = await verify();
  await strategy.onVerificationComplete(i, verification);

  if (!await strategy.shouldContinue(i)) {
    break;
  }
}
await strategy.onLoopComplete(reason);
```

---

## Target State

### Simplified Interface

**Location:** `packages/server/src/types/loop-strategy.ts` (new)

```typescript
/**
 * Single callback for loop strategy decisions.
 */
interface LoopStrategy {
  /**
   * Called after each iteration with full context.
   * Returns decision about whether to continue.
   */
  onIterationComplete(event: IterationCompleteEvent): Promise<LoopDecision>;

  /**
   * Called when loop ends for any reason.
   * Optional cleanup/finalization.
   */
  onLoopEnd?(event: LoopEndEvent): Promise<void>;
}

/**
 * Full context for iteration decision.
 */
interface IterationCompleteEvent {
  // Current state
  iteration: number;
  totalIterations: number;
  elapsedMs: number;

  // Agent result
  agentResult: AgentResult;
  agentSuccess: boolean;

  // Verification result (null if not run)
  verificationReport: VerificationReport | null;
  verificationPassed: boolean | null;

  // History
  previousIterations: IterationSummary[];

  // Configuration
  maxIterations: number;
  maxTimeMs: number | null;

  // Run context
  runId: string;
  workOrderId: string;
}

/**
 * Clear decision from strategy.
 */
interface LoopDecision {
  /** Whether to continue to next iteration */
  continue: boolean;

  /** Reason for decision (logged) */
  reason: string;

  /** Optional feedback for next iteration */
  feedback?: string;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Loop end event.
 */
interface LoopEndEvent {
  runId: string;
  totalIterations: number;
  finalResult: 'success' | 'max_iterations' | 'timeout' | 'strategy_stop' | 'error';
  elapsedMs: number;
}
```

---

## Implementation

### Step 1: Create New Types

**File:** `packages/server/src/types/loop-strategy.ts`

```typescript
import { AgentResult } from './agent.js';
import { VerificationReport } from '../verifier/types.js';

/**
 * Summary of a previous iteration.
 */
export interface IterationSummary {
  iteration: number;
  agentSuccess: boolean;
  verificationPassed: boolean | null;
  durationMs: number;
  tokensUsed: number | null;
}

/**
 * Full context for iteration decision.
 */
export interface IterationCompleteEvent {
  iteration: number;
  totalIterations: number;
  elapsedMs: number;

  agentResult: AgentResult;
  agentSuccess: boolean;

  verificationReport: VerificationReport | null;
  verificationPassed: boolean | null;

  previousIterations: IterationSummary[];

  maxIterations: number;
  maxTimeMs: number | null;

  runId: string;
  workOrderId: string;
}

/**
 * Decision from loop strategy.
 */
export interface LoopDecision {
  continue: boolean;
  reason: string;
  feedback?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Loop end event.
 */
export interface LoopEndEvent {
  runId: string;
  totalIterations: number;
  finalResult: 'success' | 'max_iterations' | 'timeout' | 'strategy_stop' | 'error';
  elapsedMs: number;
}

/**
 * Simplified loop strategy interface.
 */
export interface LoopStrategy {
  /** Strategy name */
  readonly name: string;

  /** Called after each iteration */
  onIterationComplete(event: IterationCompleteEvent): Promise<LoopDecision>;

  /** Called when loop ends (optional) */
  onLoopEnd?(event: LoopEndEvent): Promise<void>;
}
```

### Step 2: Implement Built-in Strategies

**File:** `packages/server/src/harness/strategies/fixed.ts`

```typescript
import {
  LoopStrategy,
  IterationCompleteEvent,
  LoopDecision,
} from '../../types/loop-strategy.js';

/**
 * Fixed iteration strategy - always runs exactly N iterations.
 */
export class FixedStrategy implements LoopStrategy {
  readonly name = 'fixed';

  constructor(private readonly iterations: number) {}

  async onIterationComplete(event: IterationCompleteEvent): Promise<LoopDecision> {
    // Success - stop early
    if (event.verificationPassed) {
      return {
        continue: false,
        reason: 'Verification passed',
      };
    }

    // More iterations available
    if (event.iteration < this.iterations - 1) {
      return {
        continue: true,
        reason: `Iteration ${event.iteration + 1}/${this.iterations} - continuing`,
        feedback: this.generateFeedback(event),
      };
    }

    // Max iterations reached
    return {
      continue: false,
      reason: `Max iterations (${this.iterations}) reached`,
    };
  }

  private generateFeedback(event: IterationCompleteEvent): string {
    if (!event.verificationReport) {
      return 'Agent execution failed. Please review the errors and try again.';
    }

    // Extract failed checks
    const failures: string[] = [];
    for (const [level, result] of Object.entries(event.verificationReport.levels)) {
      if (result && !result.passed) {
        for (const check of result.checks) {
          if (!check.passed) {
            failures.push(`${level}/${check.name}: ${check.output?.slice(0, 200)}`);
          }
        }
      }
    }

    return `Verification failed:\n${failures.join('\n')}`;
  }
}
```

**File:** `packages/server/src/harness/strategies/hybrid.ts`

```typescript
import {
  LoopStrategy,
  IterationCompleteEvent,
  LoopDecision,
} from '../../types/loop-strategy.js';

/**
 * Hybrid strategy - base iterations + bonus if making progress.
 */
export class HybridStrategy implements LoopStrategy {
  readonly name = 'hybrid';

  constructor(
    private readonly baseIterations: number,
    private readonly maxBonusIterations: number,
    private readonly progressThreshold: number = 0.1
  ) {}

  async onIterationComplete(event: IterationCompleteEvent): Promise<LoopDecision> {
    // Success - stop
    if (event.verificationPassed) {
      return { continue: false, reason: 'Verification passed' };
    }

    // Within base iterations - always continue
    if (event.iteration < this.baseIterations - 1) {
      return {
        continue: true,
        reason: `Base iteration ${event.iteration + 1}/${this.baseIterations}`,
        feedback: this.generateFeedback(event),
      };
    }

    // In bonus territory - check progress
    const bonusUsed = event.iteration - this.baseIterations + 1;
    if (bonusUsed >= this.maxBonusIterations) {
      return {
        continue: false,
        reason: `Max bonus iterations (${this.maxBonusIterations}) reached`,
      };
    }

    // Check if making progress
    if (this.isProgressing(event)) {
      return {
        continue: true,
        reason: 'Progress detected, using bonus iteration',
        feedback: this.generateFeedback(event),
        metadata: { bonusUsed: bonusUsed + 1 },
      };
    }

    return {
      continue: false,
      reason: 'No progress detected, stopping',
    };
  }

  private isProgressing(event: IterationCompleteEvent): boolean {
    if (event.previousIterations.length === 0) {
      return true;  // First iteration, assume progress
    }

    // Compare verification results
    const prev = event.previousIterations[event.previousIterations.length - 1];

    // Agent started failing - no progress
    if (!event.agentSuccess && prev.agentSuccess) {
      return false;
    }

    // Verification started passing or still improving
    if (event.verificationPassed && !prev.verificationPassed) {
      return true;
    }

    // Could add more sophisticated progress detection here
    return true;  // Default to giving benefit of doubt
  }

  private generateFeedback(event: IterationCompleteEvent): string {
    // Same as FixedStrategy
    return 'Please review the verification failures and iterate.';
  }
}
```

**File:** `packages/server/src/harness/strategies/ralph.ts`

```typescript
import {
  LoopStrategy,
  IterationCompleteEvent,
  LoopDecision,
} from '../../types/loop-strategy.js';

/**
 * RALPH strategy - Reinforced Adaptive Loop with Progress Heuristics.
 * Stops when convergence detected (no meaningful changes between iterations).
 */
export class RalphStrategy implements LoopStrategy {
  readonly name = 'ralph';

  constructor(
    private readonly minIterations: number,
    private readonly maxIterations: number,
    private readonly convergenceThreshold: number = 0.95,
    private readonly windowSize: number = 3
  ) {}

  async onIterationComplete(event: IterationCompleteEvent): Promise<LoopDecision> {
    // Success - stop
    if (event.verificationPassed) {
      return { continue: false, reason: 'Verification passed' };
    }

    // Minimum iterations not met
    if (event.iteration < this.minIterations - 1) {
      return {
        continue: true,
        reason: `Minimum iterations not reached (${event.iteration + 1}/${this.minIterations})`,
        feedback: this.generateFeedback(event),
      };
    }

    // Maximum iterations reached
    if (event.iteration >= this.maxIterations - 1) {
      return {
        continue: false,
        reason: `Maximum iterations reached (${this.maxIterations})`,
      };
    }

    // Check for convergence
    if (this.hasConverged(event)) {
      return {
        continue: false,
        reason: 'Convergence detected - no significant progress',
        metadata: { converged: true },
      };
    }

    return {
      continue: true,
      reason: 'Still making progress',
      feedback: this.generateFeedback(event),
    };
  }

  private hasConverged(event: IterationCompleteEvent): boolean {
    const history = event.previousIterations;
    if (history.length < this.windowSize) {
      return false;
    }

    // Check if last N iterations have same verification result
    const recent = history.slice(-this.windowSize);
    const allSame = recent.every(
      iter => iter.verificationPassed === recent[0].verificationPassed
    );

    return allSame;
  }

  private generateFeedback(event: IterationCompleteEvent): string {
    return 'Please review the verification failures and iterate.';
  }
}
```

### Step 3: Create Strategy Factory

**File:** `packages/server/src/harness/strategy-factory.ts`

```typescript
import { LoopStrategy } from '../types/loop-strategy.js';
import { LoopStrategyConfig } from '../types/harness-config.js';
import { FixedStrategy } from './strategies/fixed.js';
import { HybridStrategy } from './strategies/hybrid.js';
import { RalphStrategy } from './strategies/ralph.js';

/**
 * Create a loop strategy from configuration.
 */
export function createLoopStrategy(config: LoopStrategyConfig): LoopStrategy {
  switch (config.mode) {
    case 'fixed':
      return new FixedStrategy(config.maxIterations ?? 3);

    case 'hybrid':
      return new HybridStrategy(
        config.baseIterations ?? 3,
        config.maxBonusIterations ?? 2,
        config.progressThreshold ?? 0.1
      );

    case 'ralph':
      return new RalphStrategy(
        config.minIterations ?? 2,
        config.maxIterations ?? 10,
        config.convergenceThreshold ?? 0.95,
        config.windowSize ?? 3
      );

    default:
      // Default to fixed
      return new FixedStrategy(3);
  }
}
```

### Step 4: Refactor RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

```typescript
import { createLoopStrategy } from '../harness/strategy-factory.js';
import {
  LoopStrategy,
  IterationCompleteEvent,
  IterationSummary,
} from '../types/loop-strategy.js';

async function executeRun(run: Run): Promise<void> {
  const strategy = createLoopStrategy(run.harnessConfig.loopStrategy);
  const previousIterations: IterationSummary[] = [];
  const startTime = Date.now();

  for (let iteration = 0; iteration < run.maxIterations; iteration++) {
    // Execute agent
    const agentResult = await executeAgent(run, iteration);

    // Verify (if agent succeeded)
    let verificationReport = null;
    if (agentResult.success) {
      verificationReport = await verify(run, iteration);
    }

    // Build event
    const event: IterationCompleteEvent = {
      iteration,
      totalIterations: iteration + 1,
      elapsedMs: Date.now() - startTime,
      agentResult,
      agentSuccess: agentResult.success,
      verificationReport,
      verificationPassed: verificationReport?.overall.passed ?? null,
      previousIterations: [...previousIterations],
      maxIterations: run.maxIterations,
      maxTimeMs: run.maxTime ? run.maxTime * 1000 : null,
      runId: run.id,
      workOrderId: run.workOrderId,
    };

    // Get decision
    const decision = await strategy.onIterationComplete(event);

    log.info(
      { runId: run.id, iteration, continue: decision.continue, reason: decision.reason },
      'Strategy decision'
    );

    // Track for history
    previousIterations.push({
      iteration,
      agentSuccess: agentResult.success,
      verificationPassed: verificationReport?.overall.passed ?? null,
      durationMs: Date.now() - startTime,
      tokensUsed: agentResult.tokensUsed?.total ?? null,
    });

    // Check decision
    if (!decision.continue) {
      await strategy.onLoopEnd?.({
        runId: run.id,
        totalIterations: iteration + 1,
        finalResult: verificationReport?.overall.passed ? 'success' : 'strategy_stop',
        elapsedMs: Date.now() - startTime,
      });
      break;
    }

    // Apply feedback for next iteration
    if (decision.feedback) {
      run.currentFeedback = decision.feedback;
    }
  }
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/loop-strategies.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { FixedStrategy } from '../src/harness/strategies/fixed.js';
import { HybridStrategy } from '../src/harness/strategies/hybrid.js';
import { RalphStrategy } from '../src/harness/strategies/ralph.js';

const baseEvent = {
  iteration: 0,
  totalIterations: 1,
  elapsedMs: 5000,
  agentResult: { success: true, exitCode: 0 } as any,
  agentSuccess: true,
  verificationReport: null,
  verificationPassed: null,
  previousIterations: [],
  maxIterations: 5,
  maxTimeMs: null,
  runId: 'run-1',
  workOrderId: 'wo-1',
};

describe('FixedStrategy', () => {
  it('should continue until max iterations', async () => {
    const strategy = new FixedStrategy(3);

    const decision1 = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 0,
    });
    expect(decision1.continue).toBe(true);

    const decision2 = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 1,
    });
    expect(decision2.continue).toBe(true);

    const decision3 = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 2,
    });
    expect(decision3.continue).toBe(false);
  });

  it('should stop early on verification pass', async () => {
    const strategy = new FixedStrategy(5);

    const decision = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 0,
      verificationPassed: true,
    });

    expect(decision.continue).toBe(false);
    expect(decision.reason).toContain('passed');
  });
});

describe('HybridStrategy', () => {
  it('should use bonus iterations when progressing', async () => {
    const strategy = new HybridStrategy(2, 2);

    // Base iteration 1
    const d1 = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 0,
    });
    expect(d1.continue).toBe(true);

    // Base iteration 2
    const d2 = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 1,
      previousIterations: [{ iteration: 0, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 }],
    });
    expect(d2.continue).toBe(true);  // Bonus iteration

    // Bonus iteration 1
    const d3 = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 2,
      previousIterations: [
        { iteration: 0, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 },
        { iteration: 1, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 },
      ],
    });
    expect(d3.continue).toBe(true);  // Last bonus iteration
  });
});

describe('RalphStrategy', () => {
  it('should detect convergence', async () => {
    const strategy = new RalphStrategy(2, 10, 0.95, 3);

    // After 3 iterations with same result, should converge
    const decision = await strategy.onIterationComplete({
      ...baseEvent,
      iteration: 4,
      previousIterations: [
        { iteration: 0, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 },
        { iteration: 1, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 },
        { iteration: 2, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 },
        { iteration: 3, agentSuccess: true, verificationPassed: false, durationMs: 1000, tokensUsed: 100 },
      ],
    });

    expect(decision.continue).toBe(false);
    expect(decision.reason).toContain('Convergence');
  });
});
```

---

## Verification Checklist

- [ ] `IterationCompleteEvent` interface contains all needed context
- [ ] `LoopDecision` interface is clear and actionable
- [ ] `LoopStrategy` interface has single main callback
- [ ] `FixedStrategy` implemented with new interface
- [ ] `HybridStrategy` implemented with new interface
- [ ] `RalphStrategy` implemented with new interface
- [ ] `createLoopStrategy` factory function works
- [ ] RunExecutor refactored to use new interface
- [ ] Decision logging includes reason
- [ ] Feedback passed to next iteration
- [ ] Previous iterations tracked for history
- [ ] Unit tests pass for all strategies

---

## Benefits

1. **Single callback** - One decision point instead of 5
2. **Full context** - All data available in one event
3. **Clear decisions** - Continue/stop with explicit reason
4. **Easier implementation** - New strategies are straightforward
5. **Better testing** - One function to test per strategy
6. **Feedback included** - Decision can include next iteration guidance
