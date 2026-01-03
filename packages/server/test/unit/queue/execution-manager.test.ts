import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionManager, WorkOrderData } from '../../../src/queue/execution-manager.js';
import { ResourceMonitor } from '../../../src/queue/resource-monitor.js';
import { WorkOrderStateMachine } from '../../../src/queue/state-machine.js';
import type { SandboxProvider, Sandbox, ExecResult } from '../../../src/sandbox/types.js';
import { classifyError, ErrorCodes } from '../../../src/queue/execution-types.js';

describe('ExecutionManager', () => {
  let executionManager: ExecutionManager;
  let resourceMonitor: ResourceMonitor;
  let mockProvider: SandboxProvider;
  let mockSandbox: Sandbox;

  beforeEach(() => {
    const mockExecResult: ExecResult = {
      exitCode: 0,
      stdout: 'Success',
      stderr: '',
      timedOut: false,
      durationMs: 100,
    };

    mockSandbox = {
      id: 'sandbox-1',
      status: 'running',
      execute: vi.fn().mockResolvedValue(mockExecResult),
      destroy: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      listFiles: vi.fn().mockResolvedValue([]),
      getStats: vi.fn().mockResolvedValue({}),
    } as unknown as Sandbox;

    mockProvider = {
      name: 'mock',
      isAvailable: vi.fn().mockResolvedValue(true),
      createSandbox: vi.fn().mockResolvedValue(mockSandbox),
      listSandboxes: vi.fn().mockResolvedValue([]),
      cleanup: vi.fn().mockResolvedValue(undefined),
    };

    // Use minimal memory requirement to avoid failures on memory-constrained CI runners
    resourceMonitor = new ResourceMonitor({ maxConcurrentSlots: 2, memoryPerSlotMB: 1 });
    executionManager = new ExecutionManager(mockProvider, resourceMonitor, {
      executionTimeoutMs: 5000,
      cleanupDelayMs: 10,
      enableSandbox: true,
    });
  });

  function createWorkOrder(id: string): WorkOrderData {
    return {
      id,
      workspacePath: '/tmp/workspace',
      command: 'npm',
      args: ['test'],
    };
  }

  /**
   * Create a state machine in PREPARING state (as scheduler would do).
   * The scheduler calls claim() to move from PENDING -> PREPARING before handing to ExecutionManager.
   */
  function createPreparingStateMachine(workOrderId: string, maxRetries = 3): WorkOrderStateMachine {
    const sm = new WorkOrderStateMachine({ workOrderId, maxRetries });
    sm.claim(); // PENDING -> PREPARING
    return sm;
  }

  describe('execute', () => {
    it('should execute work order successfully', async () => {
      const stateMachine = createPreparingStateMachine('wo-1');
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

      const stateMachine = createPreparingStateMachine('wo-1');
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
        enableSandbox: true,
      });

      const stateMachine = createPreparingStateMachine('wo-1');
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
      let resolveExecution: (value: ExecResult) => void;
      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => {
          resolveExecution = resolve;
        })
      );

      const stateMachine = createPreparingStateMachine('wo-1');
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

      resolveExecution!({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 100 });
      await executePromise;

      expect(executionManager.getActiveExecutions()).toHaveLength(0);
    });

    it('should release slot on failure', async () => {
      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Execution failed')
      );

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      await executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      // Slot should be released
      expect(resourceMonitor.getAvailableSlots()).toBe(2);
    });

    it('should emit execution-started event', async () => {
      const handler = vi.fn();
      executionManager.on('execution-started', handler);

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      await executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].workOrderId).toBe('wo-1');
    });

    it('should emit execution-completed event on success', async () => {
      const handler = vi.fn();
      executionManager.on('execution-completed', handler);

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      await executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('wo-1', expect.objectContaining({ success: true }));
    });

    it('should emit execution-failed event on failure', async () => {
      const handler = vi.fn();
      executionManager.on('execution-failed', handler);

      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Execution failed')
      );

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      await executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('wo-1', expect.any(Error));
    });

    it('should cleanup sandbox after successful execution', async () => {
      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      await executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      expect(mockSandbox.destroy).toHaveBeenCalledTimes(1);
    });

    it('should cleanup sandbox after failed execution', async () => {
      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Execution failed')
      );

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      await executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      expect(mockSandbox.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('isSandboxEnabled', () => {
    it('should return true when sandbox is enabled', () => {
      const em = new ExecutionManager(mockProvider, resourceMonitor, {
        enableSandbox: true,
      });
      expect(em.isSandboxEnabled()).toBe(true);
    });

    it('should return false when sandbox is disabled', () => {
      const em = new ExecutionManager(mockProvider, resourceMonitor, {
        enableSandbox: false,
      });
      expect(em.isSandboxEnabled()).toBe(false);
    });

    it('should default to true (issue #66 fix)', () => {
      const em = new ExecutionManager(mockProvider, resourceMonitor);
      expect(em.isSandboxEnabled()).toBe(true);
    });
  });

  describe('getExecution', () => {
    it('should return undefined for non-existent execution', () => {
      expect(executionManager.getExecution('non-existent')).toBeUndefined();
    });

    it('should return execution during active run', async () => {
      let resolveExecution: (value: ExecResult) => void;
      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => {
          resolveExecution = resolve;
        })
      );

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      const executePromise = executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      await new Promise(r => setTimeout(r, 50));

      const execution = executionManager.getExecution('wo-1');
      expect(execution).toBeDefined();
      expect(execution?.workOrderId).toBe('wo-1');

      resolveExecution!({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 100 });
      await executePromise;
    });
  });

  describe('cancel', () => {
    it('should return false for non-existent execution', async () => {
      const result = await executionManager.cancel('non-existent');
      expect(result).toBe(false);
    });

    it('should destroy sandbox when cancelling', async () => {
      let resolveExecution: (value: ExecResult) => void;
      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => {
          resolveExecution = resolve;
        })
      );

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      const executePromise = executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      await new Promise(r => setTimeout(r, 50));

      const cancelled = await executionManager.cancel('wo-1');
      expect(cancelled).toBe(true);
      expect(mockSandbox.destroy).toHaveBeenCalled();

      // Resolve to complete the test
      resolveExecution!({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 100 });
      await executePromise;
    });
  });

  describe('cancelAll', () => {
    it('should cancel all active executions', async () => {
      let resolveExecution1: (value: ExecResult) => void;
      let resolveExecution2: (value: ExecResult) => void;

      const mockSandbox1 = { ...mockSandbox, id: 'sandbox-1', destroy: vi.fn().mockResolvedValue(undefined), execute: vi.fn() };
      const mockSandbox2 = { ...mockSandbox, id: 'sandbox-2', destroy: vi.fn().mockResolvedValue(undefined), execute: vi.fn() };

      let callCount = 0;
      (mockProvider.createSandbox as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        return Promise.resolve(callCount === 1 ? mockSandbox1 : mockSandbox2);
      });

      (mockSandbox1.execute as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => { resolveExecution1 = resolve; })
      );
      (mockSandbox2.execute as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => { resolveExecution2 = resolve; })
      );

      const stateMachine1 = createPreparingStateMachine('wo-1');
      const stateMachine2 = createPreparingStateMachine('wo-2');
      const slot1 = resourceMonitor.acquireSlot('wo-1')!;
      const slot2 = resourceMonitor.acquireSlot('wo-2')!;

      const executePromise1 = executionManager.execute(createWorkOrder('wo-1'), stateMachine1, slot1);
      const executePromise2 = executionManager.execute(createWorkOrder('wo-2'), stateMachine2, slot2);

      await new Promise(r => setTimeout(r, 50));

      await executionManager.cancelAll();

      expect(mockSandbox1.destroy).toHaveBeenCalled();
      expect(mockSandbox2.destroy).toHaveBeenCalled();

      // Resolve to complete the tests
      resolveExecution1!({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 100 });
      resolveExecution2!({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 100 });
      await Promise.all([executePromise1, executePromise2]);
    });
  });

  describe('getStats', () => {
    it('should return stats with all zeroes when no executions', () => {
      const stats = executionManager.getStats();
      expect(stats.activeCount).toBe(0);
      expect(stats.statuses.preparing).toBe(0);
      expect(stats.statuses.running).toBe(0);
      expect(stats.statuses.cleanup).toBe(0);
      expect(stats.statuses.completed).toBe(0);
    });

    it('should track execution statuses', async () => {
      let resolveExecution: (value: ExecResult) => void;
      (mockSandbox.execute as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise(resolve => { resolveExecution = resolve; })
      );

      const stateMachine = createPreparingStateMachine('wo-1');
      const slot = resourceMonitor.acquireSlot('wo-1')!;

      const executePromise = executionManager.execute(
        createWorkOrder('wo-1'),
        stateMachine,
        slot
      );

      await new Promise(r => setTimeout(r, 50));

      const stats = executionManager.getStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.statuses.running).toBe(1);

      resolveExecution!({ exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 100 });
      await executePromise;

      const finalStats = executionManager.getStats();
      expect(finalStats.activeCount).toBe(0);
    });
  });
});

describe('classifyError', () => {
  it('should classify OOM errors as retryable', () => {
    const error = classifyError(new Error('Out of memory'), 137);
    expect(error.code).toBe(ErrorCodes.OOM_KILLED);
    expect(error.retryable).toBe(true);
  });

  it('should classify OOM by exit code 137', () => {
    const error = classifyError(new Error('Process killed'), 137);
    expect(error.code).toBe(ErrorCodes.OOM_KILLED);
    expect(error.retryable).toBe(true);
  });

  it('should classify timeout errors as retryable', () => {
    const error = classifyError(new Error('Execution timed out'));
    expect(error.code).toBe(ErrorCodes.TIMEOUT);
    expect(error.retryable).toBe(true);
  });

  it('should classify network errors as retryable', () => {
    const error = classifyError(new Error('Network error: ECONNREFUSED'));
    expect(error.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(error.retryable).toBe(true);
  });

  it('should classify sandbox creation failures as retryable', () => {
    const error = classifyError(new Error('Sandbox creation failed'));
    expect(error.code).toBe(ErrorCodes.SANDBOX_CREATION_FAILED);
    expect(error.retryable).toBe(true);
  });

  it('should classify container errors as retryable', () => {
    const error = classifyError(new Error('Container start failed'));
    expect(error.code).toBe(ErrorCodes.SANDBOX_CREATION_FAILED);
    expect(error.retryable).toBe(true);
  });

  it('should classify exit code -1 as retryable', () => {
    const error = classifyError(new Error('Process killed'), -1);
    expect(error.code).toBe(ErrorCodes.OOM_KILLED);
    expect(error.retryable).toBe(true);
  });

  it('should classify unknown errors as non-retryable', () => {
    const error = classifyError(new Error('Unknown fatal error'));
    expect(error.code).toBe(ErrorCodes.AGENT_FATAL_ERROR);
    expect(error.retryable).toBe(false);
  });

  it('should include details for errors with exit codes', () => {
    const error = classifyError(new Error('Process killed'), 137);
    expect(error.details).toEqual({ exitCode: 137 });
  });
});
