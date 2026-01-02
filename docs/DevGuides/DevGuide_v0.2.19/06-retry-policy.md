# 06: Thrust 5 - Retry Policy

## Overview

Implement configurable retry logic for transient failures, preventing network blips and temporary issues from causing terminal run failures.

---

## Current State

### No Retry Logic

Currently, any failure is terminal:

```typescript
// run-executor.ts
const result = await driver.execute({...});
if (!result.success) {
  run.result = RunResult.FAILED_BUILD;
  // No retry, immediately fail
  break;
}
```

### Impact

| Scenario | Current Behavior | Desired Behavior |
|----------|------------------|------------------|
| Network timeout to API | Run fails | Retry 2-3 times |
| Temporary disk full | Run fails | Wait, retry |
| Agent process OOM killed | Run fails | Maybe retry once |
| GitHub API rate limited | Run fails | Wait, retry with backoff |
| Actual code error | Run fails | Fail (no retry) |

---

## Target State

### RetryPolicy Interface

**Location:** `packages/server/src/types/retry-policy.ts`

```typescript
/**
 * Configuration for retry behavior.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts (0 = no retries) */
  maxAttempts: number;

  /** Initial backoff delay in milliseconds */
  initialBackoffMs: number;

  /** Backoff multiplier for exponential backoff */
  backoffMultiplier: number;

  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;

  /** Error types that are retryable */
  retryableErrors: BuildErrorType[];

  /** Whether to retry on timeout */
  retryOnTimeout: boolean;

  /** Whether to add jitter to backoff */
  jitter: boolean;
}

/**
 * Result of a retry attempt.
 */
export interface RetryAttempt<T> {
  attempt: number;
  success: boolean;
  result: T | null;
  error: Error | null;
  durationMs: number;
  willRetry: boolean;
  nextRetryMs: number | null;
}

/**
 * Retry execution summary.
 */
export interface RetryResult<T> {
  success: boolean;
  result: T | null;
  finalError: Error | null;
  attempts: RetryAttempt<T>[];
  totalDurationMs: number;
  retriedCount: number;
}
```

### Default Policies

```typescript
/**
 * Default retry policy - conservative.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 2,
  initialBackoffMs: 5000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: [
    BuildErrorType.AGENT_TIMEOUT,
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

/**
 * Aggressive retry policy - for critical operations.
 */
export const AGGRESSIVE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  initialBackoffMs: 1000,
  backoffMultiplier: 1.5,
  maxBackoffMs: 60000,
  retryableErrors: [
    BuildErrorType.AGENT_TIMEOUT,
    BuildErrorType.AGENT_CRASH,
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
    BuildErrorType.WORKSPACE_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

/**
 * No retry policy - for deterministic testing.
 */
export const NO_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 0,
  initialBackoffMs: 0,
  backoffMultiplier: 0,
  maxBackoffMs: 0,
  retryableErrors: [],
  retryOnTimeout: false,
  jitter: false,
};
```

---

## Implementation

### Step 1: Create Type Definitions

**File:** `packages/server/src/types/retry-policy.ts`

```typescript
import { BuildErrorType } from './build-error.js';

export interface RetryPolicy {
  maxAttempts: number;
  initialBackoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrors: BuildErrorType[];
  retryOnTimeout: boolean;
  jitter: boolean;
}

export interface RetryAttempt<T> {
  attempt: number;
  success: boolean;
  result: T | null;
  error: Error | null;
  durationMs: number;
  willRetry: boolean;
  nextRetryMs: number | null;
}

export interface RetryResult<T> {
  success: boolean;
  result: T | null;
  finalError: Error | null;
  attempts: RetryAttempt<T>[];
  totalDurationMs: number;
  retriedCount: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 2,
  initialBackoffMs: 5000,
  backoffMultiplier: 2,
  maxBackoffMs: 30000,
  retryableErrors: [
    BuildErrorType.AGENT_TIMEOUT,
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

export const AGGRESSIVE_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 5,
  initialBackoffMs: 1000,
  backoffMultiplier: 1.5,
  maxBackoffMs: 60000,
  retryableErrors: [
    BuildErrorType.AGENT_TIMEOUT,
    BuildErrorType.AGENT_CRASH,
    BuildErrorType.SYSTEM_ERROR,
    BuildErrorType.GITHUB_ERROR,
    BuildErrorType.WORKSPACE_ERROR,
  ],
  retryOnTimeout: true,
  jitter: true,
};

export const NO_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 0,
  initialBackoffMs: 0,
  backoffMultiplier: 0,
  maxBackoffMs: 0,
  retryableErrors: [],
  retryOnTimeout: false,
  jitter: false,
};
```

### Step 2: Create RetryExecutor

**File:** `packages/server/src/orchestrator/retry-executor.ts`

```typescript
import {
  RetryPolicy,
  RetryAttempt,
  RetryResult,
  DEFAULT_RETRY_POLICY,
} from '../types/retry-policy.js';
import { BuildError, BuildErrorType } from '../types/build-error.js';
import { createLogger } from '../logging/index.js';

const log = createLogger('retry-executor');

/**
 * Executes operations with configurable retry logic.
 */
export class RetryExecutor {
  private policy: RetryPolicy;

  constructor(policy: RetryPolicy = DEFAULT_RETRY_POLICY) {
    this.policy = policy;
  }

  /**
   * Execute an operation with retry logic.
   */
  async execute<T>(
    operation: () => Promise<T>,
    options?: {
      onAttempt?: (attempt: RetryAttempt<T>) => void;
      isRetryable?: (error: Error) => boolean;
      extractErrorType?: (error: Error) => BuildErrorType;
    }
  ): Promise<RetryResult<T>> {
    const attempts: RetryAttempt<T>[] = [];
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.policy.maxAttempts; attempt++) {
      const attemptStart = Date.now();

      try {
        const result = await operation();

        const attemptRecord: RetryAttempt<T> = {
          attempt,
          success: true,
          result,
          error: null,
          durationMs: Date.now() - attemptStart,
          willRetry: false,
          nextRetryMs: null,
        };
        attempts.push(attemptRecord);
        options?.onAttempt?.(attemptRecord);

        return {
          success: true,
          result,
          finalError: null,
          attempts,
          totalDurationMs: Date.now() - startTime,
          retriedCount: attempt,
        };
      } catch (error) {
        lastError = error as Error;
        const errorType = options?.extractErrorType?.(lastError) ?? BuildErrorType.UNKNOWN;

        const canRetry = attempt < this.policy.maxAttempts && this.isRetryable(errorType, options?.isRetryable);
        const nextRetryMs = canRetry ? this.calculateBackoff(attempt) : null;

        const attemptRecord: RetryAttempt<T> = {
          attempt,
          success: false,
          result: null,
          error: lastError,
          durationMs: Date.now() - attemptStart,
          willRetry: canRetry,
          nextRetryMs,
        };
        attempts.push(attemptRecord);
        options?.onAttempt?.(attemptRecord);

        if (canRetry && nextRetryMs !== null) {
          log.info(
            { attempt, nextRetryMs, errorType },
            `Retrying after ${nextRetryMs}ms`
          );
          await this.sleep(nextRetryMs);
        } else {
          log.warn({ attempt, errorType }, 'No more retries, failing');
        }
      }
    }

    return {
      success: false,
      result: null,
      finalError: lastError,
      attempts,
      totalDurationMs: Date.now() - startTime,
      retriedCount: attempts.length - 1,
    };
  }

  /**
   * Check if an error type is retryable.
   */
  isRetryable(
    errorType: BuildErrorType,
    customCheck?: (error: Error) => boolean
  ): boolean {
    if (this.policy.retryableErrors.includes(errorType)) {
      return true;
    }

    if (errorType === BuildErrorType.AGENT_TIMEOUT && this.policy.retryOnTimeout) {
      return true;
    }

    return false;
  }

  /**
   * Calculate backoff delay for an attempt.
   */
  calculateBackoff(attempt: number): number {
    const base = this.policy.initialBackoffMs * Math.pow(this.policy.backoffMultiplier, attempt);
    const capped = Math.min(base, this.policy.maxBackoffMs);

    if (this.policy.jitter) {
      // Add 0-25% jitter
      const jitter = capped * 0.25 * Math.random();
      return Math.round(capped + jitter);
    }

    return Math.round(capped);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a retry executor with custom policy.
 */
export function createRetryExecutor(policy?: Partial<RetryPolicy>): RetryExecutor {
  return new RetryExecutor({
    ...DEFAULT_RETRY_POLICY,
    ...policy,
  });
}

// Default singleton
export const retryExecutor = new RetryExecutor();
```

### Step 3: Integrate with RunExecutor

**File:** `packages/server/src/orchestrator/run-executor.ts`

```typescript
import { RetryExecutor, createRetryExecutor } from './retry-executor.js';
import { errorBuilder } from './error-builder.js';

// In executeIteration:
const retryExecutor = createRetryExecutor(
  harnessConfig.retry ?? DEFAULT_RETRY_POLICY
);

const agentRetryResult = await retryExecutor.execute(
  async () => {
    const result = await driver.execute({
      prompt,
      workspaceDir,
      config,
    });

    if (!result.success) {
      // Throw to trigger retry logic
      const error = new Error(result.stderr || 'Agent execution failed');
      (error as any).agentResult = result;
      throw error;
    }

    return result;
  },
  {
    onAttempt: (attempt) => {
      log.info(
        { runId, iteration, attempt: attempt.attempt, willRetry: attempt.willRetry },
        'Agent execution attempt'
      );
    },
    extractErrorType: (error) => {
      const result = (error as any).agentResult;
      if (result) {
        return errorBuilder.fromAgentResult(result, '').type;
      }
      return BuildErrorType.SYSTEM_ERROR;
    },
  }
);

if (!agentRetryResult.success) {
  // All retries exhausted
  const lastAttempt = agentRetryResult.attempts[agentRetryResult.attempts.length - 1];
  const agentResult = (lastAttempt.error as any)?.agentResult;

  run.error = `Failed after ${agentRetryResult.retriedCount} retries: ${lastAttempt.error?.message}`;
  // ... handle failure
}
```

### Step 4: Add to HarnessConfig

**File:** `packages/server/src/types/harness-config.ts`

```typescript
import { RetryPolicy } from './retry-policy.js';

export interface HarnessConfig {
  // Existing fields...
  loopStrategy: LoopStrategyConfig;
  verification: VerificationConfig;
  gitOps: GitOpsConfig;

  // NEW: Retry configuration
  retry?: Partial<RetryPolicy>;
}
```

---

## Testing

### Unit Tests

**File:** `packages/server/test/retry-executor.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { RetryExecutor, createRetryExecutor } from '../src/orchestrator/retry-executor.js';
import { BuildErrorType } from '../src/types/build-error.js';

describe('RetryExecutor', () => {
  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const executor = createRetryExecutor({ maxAttempts: 3 });

      const result = await executor.execute(async () => 'success');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.retriedCount).toBe(0);
      expect(result.attempts).toHaveLength(1);
    });

    it('should retry on retryable error', async () => {
      const executor = createRetryExecutor({
        maxAttempts: 3,
        initialBackoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
      });

      let attempts = 0;
      const result = await executor.execute(
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return 'success';
        },
        {
          extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
        }
      );

      expect(result.success).toBe(true);
      expect(result.retriedCount).toBe(2);
      expect(result.attempts).toHaveLength(3);
    });

    it('should not retry non-retryable errors', async () => {
      const executor = createRetryExecutor({
        maxAttempts: 3,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
      });

      const result = await executor.execute(
        async () => {
          throw new Error('Code error');
        },
        {
          extractErrorType: () => BuildErrorType.TYPECHECK_FAILED,
        }
      );

      expect(result.success).toBe(false);
      expect(result.retriedCount).toBe(0);
      expect(result.attempts).toHaveLength(1);
    });

    it('should respect max attempts', async () => {
      const executor = createRetryExecutor({
        maxAttempts: 2,
        initialBackoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
      });

      const result = await executor.execute(
        async () => {
          throw new Error('Always fails');
        },
        {
          extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
        }
      );

      expect(result.success).toBe(false);
      expect(result.attempts).toHaveLength(3); // 1 initial + 2 retries
    });

    it('should call onAttempt callback', async () => {
      const executor = createRetryExecutor({
        maxAttempts: 2,
        initialBackoffMs: 10,
        retryableErrors: [BuildErrorType.SYSTEM_ERROR],
      });

      const attempts: any[] = [];
      let callCount = 0;

      await executor.execute(
        async () => {
          callCount++;
          if (callCount < 2) throw new Error('Fail');
          return 'success';
        },
        {
          onAttempt: (attempt) => attempts.push(attempt),
          extractErrorType: () => BuildErrorType.SYSTEM_ERROR,
        }
      );

      expect(attempts).toHaveLength(2);
      expect(attempts[0].willRetry).toBe(true);
      expect(attempts[1].success).toBe(true);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const executor = createRetryExecutor({
        initialBackoffMs: 1000,
        backoffMultiplier: 2,
        maxBackoffMs: 30000,
        jitter: false,
      });

      expect(executor.calculateBackoff(0)).toBe(1000);
      expect(executor.calculateBackoff(1)).toBe(2000);
      expect(executor.calculateBackoff(2)).toBe(4000);
      expect(executor.calculateBackoff(3)).toBe(8000);
    });

    it('should cap at maxBackoffMs', () => {
      const executor = createRetryExecutor({
        initialBackoffMs: 10000,
        backoffMultiplier: 2,
        maxBackoffMs: 15000,
        jitter: false,
      });

      expect(executor.calculateBackoff(0)).toBe(10000);
      expect(executor.calculateBackoff(1)).toBe(15000); // Capped
      expect(executor.calculateBackoff(2)).toBe(15000); // Still capped
    });
  });

  describe('isRetryable', () => {
    it('should return true for configured error types', () => {
      const executor = createRetryExecutor({
        retryableErrors: [BuildErrorType.SYSTEM_ERROR, BuildErrorType.GITHUB_ERROR],
      });

      expect(executor.isRetryable(BuildErrorType.SYSTEM_ERROR)).toBe(true);
      expect(executor.isRetryable(BuildErrorType.GITHUB_ERROR)).toBe(true);
      expect(executor.isRetryable(BuildErrorType.TYPECHECK_FAILED)).toBe(false);
    });

    it('should handle timeout separately', () => {
      const executor = createRetryExecutor({
        retryableErrors: [],
        retryOnTimeout: true,
      });

      expect(executor.isRetryable(BuildErrorType.AGENT_TIMEOUT)).toBe(true);
      expect(executor.isRetryable(BuildErrorType.SYSTEM_ERROR)).toBe(false);
    });
  });
});
```

---

## Verification Checklist

- [ ] `RetryPolicy` interface defined in `types/retry-policy.ts`
- [ ] `RetryAttempt` and `RetryResult` interfaces defined
- [ ] Default, aggressive, and no-retry policies exported
- [ ] `RetryExecutor` class created in `orchestrator/retry-executor.ts`
- [ ] `execute` method implements retry loop
- [ ] `calculateBackoff` implements exponential backoff with jitter
- [ ] `isRetryable` checks error type against policy
- [ ] RunExecutor uses RetryExecutor for agent execution
- [ ] HarnessConfig accepts retry policy override
- [ ] Retry attempts are logged with context
- [ ] Unit tests pass for RetryExecutor
- [ ] Integration tests verify retry behavior

---

## Benefits

1. **Resilience** - Transient failures don't kill runs
2. **Configurability** - Different policies for different scenarios
3. **Visibility** - Retry attempts are tracked and logged
4. **Smart backoff** - Exponential backoff with jitter prevents thundering herd
5. **Selective retry** - Only retry errors that might succeed on retry
