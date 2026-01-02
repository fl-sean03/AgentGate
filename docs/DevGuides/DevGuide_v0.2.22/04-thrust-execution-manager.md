# 04 - Thrust: Execution Manager

## Objective

Implement an execution manager that:
- Owns the complete lifecycle of sandbox execution
- Tracks active executions with clear ownership
- Prevents cleanup race conditions through ownership model
- Handles graceful and forceful cancellation
- Reports execution results through state machine

## Current State Analysis

### Existing Problems
```typescript
// Current: Sandbox cleanup happens independently
setInterval(() => {
  provider.cleanup();  // Destroys ALL sandboxes including active ones
}, CLEANUP_INTERVAL);

// Current: No tracking of what's actually running
// Work order status is "running" but sandbox might be gone
```

### Target Implementation
```typescript
// New: ExecutionManager owns sandboxes
const execution = executionManager.getExecution(workOrderId);
// execution.sandbox is guaranteed to exist while execution is active
// cleanup only happens after execution completes/fails
```

## Subtasks

### Subtask 4.1: Define Execution Types

**Files Created:**
- `packages/server/src/queue/execution-types.ts`

```typescript
import type { Sandbox } from '../sandbox/types.js';
import type { SlotHandle } from './resource-monitor.js';
import type { WorkOrderStateMachine } from './state-machine.js';

/**
 * Execution status.
 */
export type ExecutionStatus =
  | 'preparing'  // Setting up sandbox
  | 'running'    // Agent executing
  | 'cleanup'    // Tearing down sandbox
  | 'completed'  // Finished (success or failure)
  ;

/**
 * Active execution record.
 */
export interface Execution {
  readonly workOrderId: string;
  readonly slotHandle: SlotHandle;
  readonly stateMachine: WorkOrderStateMachine;
  readonly startedAt: Date;
  status: ExecutionStatus;
  sandbox?: Sandbox;
  output?: string;
  error?: Error;
}

/**
 * Result of an execution.
 */
export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
  durationMs: number;
  retryable: boolean;
}

/**
 * Execution error with retry classification.
 */
export interface ExecutionError {
  message: string;
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/**
 * Known error codes for classification.
 */
export const ErrorCodes = {
  // Retryable errors
  SANDBOX_CREATION_FAILED: 'SANDBOX_CREATION_FAILED',
  TIMEOUT: 'TIMEOUT',
  OOM_KILLED: 'OOM_KILLED',
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Non-retryable errors
  INVALID_WORK_ORDER: 'INVALID_WORK_ORDER',
  AGENT_FATAL_ERROR: 'AGENT_FATAL_ERROR',
  CANCELLED: 'CANCELLED',
} as const;

/**
 * Classify an error as retryable or not.
 */
export function classifyError(error: Error, exitCode?: number): ExecutionError {
  const message = error.message.toLowerCase();

  // OOM killed (exit code 137 = 128 + SIGKILL(9))
  if (exitCode === 137 || message.includes('oom') || message.includes('out of memory')) {
    return {
      message: error.message,
      code: ErrorCodes.OOM_KILLED,
      retryable: true,
      details: { exitCode },
    };
  }

  // Timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      message: error.message,
      code: ErrorCodes.TIMEOUT,
      retryable: true,
    };
  }

  // Network errors
  if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
    return {
      message: error.message,
      code: ErrorCodes.NETWORK_ERROR,
      retryable: true,
    };
  }

  // Sandbox creation failures are often transient
  if (message.includes('sandbox') || message.includes('container')) {
    return {
      message: error.message,
      code: ErrorCodes.SANDBOX_CREATION_FAILED,
      retryable: true,
    };
  }

  // Exit code -1 usually means killed (our previous bug)
  if (exitCode === -1) {
    return {
      message: error.message,
      code: ErrorCodes.OOM_KILLED,
      retryable: true,
      details: { exitCode },
    };
  }

  // Default: not retryable
  return {
    message: error.message,
    code: ErrorCodes.AGENT_FATAL_ERROR,
    retryable: false,
  };
}
```

**Verification:**
- [ ] All execution states are defined
- [ ] Error classification covers known error types
- [ ] Types compile correctly

---

### Subtask 4.2: Implement ExecutionManager

**Files Created:**
- `packages/server/src/queue/execution-manager.ts`

```typescript
import { EventEmitter } from 'events';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { SandboxProvider, SandboxConfig, Sandbox } from '../sandbox/types.js';
import type { SlotHandle } from './resource-monitor.js';
import { ResourceMonitor } from './resource-monitor.js';
import { WorkOrderStateMachine } from './state-machine.js';
import {
  Execution,
  ExecutionResult,
  ExecutionStatus,
  classifyError,
} from './execution-types.js';

/**
 * Configuration for execution manager.
 */
export interface ExecutionManagerConfig {
  executionTimeoutMs: number;      // Max execution time
  gracefulShutdownMs: number;      // Time to wait for graceful stop
  cleanupDelayMs: number;          // Delay before sandbox cleanup
}

const DEFAULT_CONFIG: ExecutionManagerConfig = {
  executionTimeoutMs: 3600000,     // 1 hour
  gracefulShutdownMs: 30000,       // 30 seconds
  cleanupDelayMs: 1000,            // 1 second
};

/**
 * Events emitted by ExecutionManager.
 */
export interface ExecutionManagerEvents {
  'execution-started': (execution: Execution) => void;
  'execution-completed': (workOrderId: string, result: ExecutionResult) => void;
  'execution-failed': (workOrderId: string, error: Error) => void;
}

/**
 * Work order data required for execution.
 */
export interface WorkOrderData {
  id: string;
  repoUrl: string;
  branch?: string;
  command: string;
  environment?: Record<string, string>;
}

/**
 * Manages execution lifecycle with sandbox ownership.
 */
export class ExecutionManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ExecutionManagerConfig;
  private readonly executions: Map<string, Execution> = new Map();

  constructor(
    private readonly sandboxProvider: SandboxProvider,
    private readonly resourceMonitor: ResourceMonitor,
    config: Partial<ExecutionManagerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('execution-manager');
  }

  /**
   * Execute a work order in a sandbox.
   * This method owns the entire lifecycle: create sandbox, run, cleanup.
   */
  async execute(
    workOrder: WorkOrderData,
    stateMachine: WorkOrderStateMachine,
    slot: SlotHandle
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Create execution record
    const execution: Execution = {
      workOrderId: workOrder.id,
      slotHandle: slot,
      stateMachine,
      startedAt: new Date(),
      status: 'preparing',
    };

    this.executions.set(workOrder.id, execution);

    this.logger.info(
      { workOrderId: workOrder.id, slotId: slot.id },
      'Starting execution'
    );

    try {
      // Phase 1: Create sandbox
      execution.status = 'preparing';
      const sandbox = await this.createSandbox(workOrder);
      execution.sandbox = sandbox;

      // Transition to RUNNING
      stateMachine.ready({ sandboxId: sandbox.id });
      execution.status = 'running';

      this.emit('execution-started', execution);

      // Phase 2: Execute with timeout
      const result = await this.runWithTimeout(
        sandbox,
        workOrder.command,
        this.config.executionTimeoutMs
      );

      // Phase 3: Cleanup
      execution.status = 'cleanup';
      await this.cleanupSandbox(sandbox);

      // Success
      const executionResult: ExecutionResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        output: result.output,
        durationMs: Date.now() - startTime,
        retryable: false,
      };

      // Transition to COMPLETED
      stateMachine.complete({
        exitCode: result.exitCode,
        output: result.output,
      });

      this.logger.info(
        { workOrderId: workOrder.id, result: executionResult },
        'Execution completed'
      );

      this.emit('execution-completed', workOrder.id, executionResult);
      return executionResult;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Classify the error
      const classifiedError = classifyError(err);

      this.logger.error(
        { workOrderId: workOrder.id, error: classifiedError },
        'Execution failed'
      );

      // Cleanup sandbox if it exists
      if (execution.sandbox) {
        execution.status = 'cleanup';
        await this.cleanupSandbox(execution.sandbox).catch(cleanupErr => {
          this.logger.error(
            { workOrderId: workOrder.id, err: cleanupErr },
            'Failed to cleanup sandbox after error'
          );
        });
      }

      // Transition to WAITING_RETRY or FAILED
      stateMachine.fail({
        message: classifiedError.message,
        retryable: classifiedError.retryable,
      });

      const executionResult: ExecutionResult = {
        success: false,
        exitCode: -1,
        output: '',
        error: classifiedError.message,
        durationMs: Date.now() - startTime,
        retryable: classifiedError.retryable,
      };

      this.emit('execution-failed', workOrder.id, err);
      return executionResult;

    } finally {
      // Always release slot and remove execution
      execution.status = 'completed';
      this.resourceMonitor.releaseSlot(slot);
      this.executions.delete(workOrder.id);

      this.logger.debug(
        { workOrderId: workOrder.id },
        'Execution record cleaned up'
      );
    }
  }

  /**
   * Create a sandbox for the work order.
   */
  private async createSandbox(workOrder: WorkOrderData): Promise<Sandbox> {
    const config: SandboxConfig = {
      workspaceUrl: workOrder.repoUrl,
      branch: workOrder.branch,
      environment: workOrder.environment,
    };

    this.logger.debug(
      { workOrderId: workOrder.id, config },
      'Creating sandbox'
    );

    try {
      const sandbox = await this.sandboxProvider.createSandbox(config);

      this.logger.info(
        { workOrderId: workOrder.id, sandboxId: sandbox.id },
        'Sandbox created'
      );

      return sandbox;
    } catch (error) {
      this.logger.error(
        { workOrderId: workOrder.id, error },
        'Failed to create sandbox'
      );
      throw error;
    }
  }

  /**
   * Run a command in the sandbox with timeout.
   */
  private async runWithTimeout(
    sandbox: Sandbox,
    command: string,
    timeoutMs: number
  ): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      sandbox
        .execute(command)
        .then(result => {
          clearTimeout(timeout);
          resolve({
            exitCode: result.exitCode,
            output: result.stdout + result.stderr,
          });
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Cleanup a sandbox with graceful shutdown.
   */
  private async cleanupSandbox(sandbox: Sandbox): Promise<void> {
    this.logger.debug(
      { sandboxId: sandbox.id },
      'Cleaning up sandbox'
    );

    // Small delay to allow any pending I/O
    await new Promise(r => setTimeout(r, this.config.cleanupDelayMs));

    await sandbox.destroy();

    this.logger.info(
      { sandboxId: sandbox.id },
      'Sandbox destroyed'
    );
  }

  /**
   * Get an active execution by work order ID.
   */
  getExecution(workOrderId: string): Execution | undefined {
    return this.executions.get(workOrderId);
  }

  /**
   * Get all active executions.
   */
  getActiveExecutions(): Execution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Cancel an active execution.
   */
  async cancel(workOrderId: string): Promise<boolean> {
    const execution = this.executions.get(workOrderId);
    if (!execution) {
      this.logger.warn(
        { workOrderId },
        'Cannot cancel: execution not found'
      );
      return false;
    }

    this.logger.info(
      { workOrderId, status: execution.status },
      'Cancelling execution'
    );

    // If sandbox exists, destroy it (this will cause execute() to fail)
    if (execution.sandbox) {
      await execution.sandbox.destroy().catch(err => {
        this.logger.error(
          { workOrderId, err },
          'Error destroying sandbox during cancel'
        );
      });
    }

    return true;
  }

  /**
   * Cancel all active executions.
   */
  async cancelAll(): Promise<void> {
    this.logger.warn(
      { count: this.executions.size },
      'Cancelling all executions'
    );

    const cancelPromises = Array.from(this.executions.keys()).map(id =>
      this.cancel(id)
    );

    await Promise.all(cancelPromises);
  }

  /**
   * Get execution statistics.
   */
  getStats(): {
    activeCount: number;
    statuses: Record<ExecutionStatus, number>;
  } {
    const statuses: Record<ExecutionStatus, number> = {
      preparing: 0,
      running: 0,
      cleanup: 0,
      completed: 0,
    };

    for (const execution of this.executions.values()) {
      statuses[execution.status]++;
    }

    return {
      activeCount: this.executions.size,
      statuses,
    };
  }
}
```

**Verification:**
- [ ] Sandbox is created before RUNNING transition
- [ ] Sandbox is destroyed after execution completes
- [ ] Slot is always released in finally block
- [ ] Errors are correctly classified
- [ ] Timeouts work correctly

---

### Subtask 4.3: Write Unit Tests

**Files Created:**
- `packages/server/test/unit/queue/execution-manager.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionManager } from '../../../src/queue/execution-manager.js';
import { ResourceMonitor } from '../../../src/queue/resource-monitor.js';
import { WorkOrderStateMachine } from '../../../src/queue/state-machine.js';
import type { SandboxProvider, Sandbox } from '../../../src/sandbox/types.js';

describe('ExecutionManager', () => {
  let executionManager: ExecutionManager;
  let resourceMonitor: ResourceMonitor;
  let mockProvider: SandboxProvider;
  let mockSandbox: Sandbox;

  beforeEach(() => {
    mockSandbox = {
      id: 'sandbox-1',
      status: 'running',
      isExecuting: false,
      execute: vi.fn().mockResolvedValue({ exitCode: 0, stdout: 'Success', stderr: '' }),
      destroy: vi.fn().mockResolvedValue(undefined),
    } as unknown as Sandbox;

    mockProvider = {
      name: 'mock',
      isAvailable: vi.fn().mockResolvedValue(true),
      createSandbox: vi.fn().mockResolvedValue(mockSandbox),
      listSandboxes: vi.fn().mockResolvedValue([]),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    resourceMonitor = new ResourceMonitor({ maxConcurrentSlots: 2 });
    executionManager = new ExecutionManager(mockProvider, resourceMonitor, {
      executionTimeoutMs: 5000,
      cleanupDelayMs: 10,
    });
  });

  function createWorkOrder(id: string) {
    return {
      id,
      repoUrl: 'https://github.com/test/repo',
      command: 'npm test',
    };
  }

  it('should execute work order successfully', async () => {
    const stateMachine = new WorkOrderStateMachine({
      workOrderId: 'wo-1',
      maxRetries: 3,
    });
    const slot = resourceMonitor.acquireSlot('wo-1')!;

    const result = await executionManager.execute(
      createWorkOrder('wo-1'),
      stateMachine,
      slot
    );

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(stateMachine.currentState).toBe('COMPLETED');
    expect(mockSandbox.destroy).toHaveBeenCalled();
  });

  it('should handle sandbox creation failure', async () => {
    (mockProvider.createSandbox as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Container creation failed')
    );

    const stateMachine = new WorkOrderStateMachine({
      workOrderId: 'wo-1',
      maxRetries: 3,
    });
    const slot = resourceMonitor.acquireSlot('wo-1')!;

    const result = await executionManager.execute(
      createWorkOrder('wo-1'),
      stateMachine,
      slot
    );

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(stateMachine.currentState).toBe('WAITING_RETRY');
  });

  it('should handle execution timeout', async () => {
    (mockSandbox.execute as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 10000))
    );

    const em = new ExecutionManager(mockProvider, resourceMonitor, {
      executionTimeoutMs: 100,
      cleanupDelayMs: 10,
    });

    const stateMachine = new WorkOrderStateMachine({
      workOrderId: 'wo-1',
      maxRetries: 3,
    });
    const slot = resourceMonitor.acquireSlot('wo-1')!;

    const result = await em.execute(
      createWorkOrder('wo-1'),
      stateMachine,
      slot
    );

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
  });

  it('should track active executions', async () => {
    let resolveExecution: () => void;
    (mockSandbox.execute as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(resolve => {
        resolveExecution = () => resolve({ exitCode: 0, stdout: '', stderr: '' });
      })
    );

    const stateMachine = new WorkOrderStateMachine({
      workOrderId: 'wo-1',
      maxRetries: 3,
    });
    const slot = resourceMonitor.acquireSlot('wo-1')!;

    const executePromise = executionManager.execute(
      createWorkOrder('wo-1'),
      stateMachine,
      slot
    );

    // Small delay to let execution start
    await new Promise(r => setTimeout(r, 50));

    const executions = executionManager.getActiveExecutions();
    expect(executions).toHaveLength(1);
    expect(executions[0].workOrderId).toBe('wo-1');

    resolveExecution!();
    await executePromise;

    expect(executionManager.getActiveExecutions()).toHaveLength(0);
  });

  it('should release slot on failure', async () => {
    (mockSandbox.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Execution failed')
    );

    const stateMachine = new WorkOrderStateMachine({
      workOrderId: 'wo-1',
      maxRetries: 3,
    });
    const slot = resourceMonitor.acquireSlot('wo-1')!;

    await executionManager.execute(
      createWorkOrder('wo-1'),
      stateMachine,
      slot
    );

    // Slot should be released
    expect(resourceMonitor.getAvailableSlots()).toBe(2);
  });
});
```

**Verification:**
- [ ] All tests pass
- [ ] Execution lifecycle is correctly managed
- [ ] Resources are always cleaned up

---

## Files Created/Modified Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/server/src/queue/execution-types.ts` | Create | Execution types and error classification |
| `packages/server/src/queue/execution-manager.ts` | Create | ExecutionManager implementation |
| `packages/server/test/unit/queue/execution-manager.test.ts` | Create | Unit tests |

## Verification Steps

1. **Type Safety**
   ```bash
   npm run typecheck
   ```

2. **Unit Tests**
   ```bash
   npm run test -- --filter execution-manager
   ```

3. **Integration Test**
   - Start server with new execution manager
   - Submit work order
   - Verify sandbox is created, execution runs, sandbox is destroyed
   - Check slot is released

## Dependencies

- Thrust 02 (State Machine)
- Thrust 03 (Scheduler, ResourceMonitor)
- Existing sandbox providers

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sandbox leaked on crash | High | Finally block always releases slot |
| Execution stuck forever | High | Timeout with forced cleanup |
| Error misclassification | Medium | Conservative default (not retryable) |
