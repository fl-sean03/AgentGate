/**
 * Tests for Agent Process Manager (v0.2.23 Wave 1.3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  AgentProcessManager,
  createAgentProcessManager,
  getAgentProcessManager,
  resetAgentProcessManager,
  type TrackedProcess,
  type KillResult,
} from '../src/control-plane/agent-process-manager.js';

/**
 * Create a mock ChildProcess that can be controlled in tests.
 */
function createMockProcess(pid: number = 12345): ChildProcess {
  const mock = new EventEmitter() as ChildProcess;
  mock.pid = pid;
  mock.killed = false;
  mock.kill = vi.fn((signal?: string) => {
    if (signal === 'SIGKILL' || signal === 'SIGTERM') {
      mock.killed = true;
      return true;
    }
    return true;
  });
  mock.stdin = null;
  mock.stdout = null;
  mock.stderr = null;
  return mock;
}

describe('AgentProcessManager', () => {
  let manager: AgentProcessManager;

  beforeEach(() => {
    resetAgentProcessManager();
    manager = createAgentProcessManager({
      defaultGracePeriodMs: 100,
      staleCheckIntervalMs: 60000,
      maxProcessLifetimeMs: 3600000,
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  describe('register', () => {
    it('should register a process and track it', () => {
      const process = createMockProcess(12345);
      manager.register('wo-1', 'run-1', process);

      expect(manager.hasActiveProcess('wo-1')).toBe(true);

      const tracked = manager.getProcess('wo-1');
      expect(tracked).not.toBeNull();
      expect(tracked!.workOrderId).toBe('wo-1');
      expect(tracked!.runId).toBe('run-1');
      expect(tracked!.pid).toBe(12345);
      expect(tracked!.hasExited).toBe(false);
    });

    it('should emit registered event', () => {
      const handler = vi.fn();
      manager.on('registered', handler);

      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0]).toMatchObject({
        workOrderId: 'wo-1',
        runId: 'run-1',
      });
    });

    it('should not register process without PID', () => {
      const process = createMockProcess();
      delete (process as { pid?: number }).pid;

      manager.register('wo-1', 'run-1', process);

      expect(manager.hasActiveProcess('wo-1')).toBe(false);
    });

    it('should replace existing registration for same work order', () => {
      const process1 = createMockProcess(11111);
      const process2 = createMockProcess(22222);

      manager.register('wo-1', 'run-1', process1);
      manager.register('wo-1', 'run-2', process2);

      const tracked = manager.getProcess('wo-1');
      expect(tracked!.pid).toBe(22222);
      expect(tracked!.runId).toBe('run-2');
    });
  });

  describe('unregister', () => {
    it('should remove process from tracking', () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      expect(manager.hasActiveProcess('wo-1')).toBe(true);

      manager.unregister('wo-1');

      expect(manager.hasActiveProcess('wo-1')).toBe(false);
      expect(manager.getProcess('wo-1')).toBeNull();
    });

    it('should be safe to unregister non-existent work order', () => {
      expect(() => manager.unregister('unknown')).not.toThrow();
    });
  });

  describe('process exit handling', () => {
    it('should update tracked process on exit', () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      process.emit('exit', 0, null);

      const tracked = manager.getProcess('wo-1');
      expect(tracked!.hasExited).toBe(true);
      expect(tracked!.exitCode).toBe(0);
    });

    it('should emit exited event on process exit', () => {
      const handler = vi.fn();
      manager.on('exited', handler);

      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      process.emit('exit', 0, null);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0]).toMatchObject({
        workOrderId: 'wo-1',
        hasExited: true,
        exitCode: 0,
      });
    });

    it('should handle exit via close event', () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      process.emit('close', 1, 'SIGTERM');

      const tracked = manager.getProcess('wo-1');
      expect(tracked!.hasExited).toBe(true);
      expect(tracked!.exitCode).toBe(1);
      expect(tracked!.exitSignal).toBe('SIGTERM');
    });

    it('should not double-handle exit events', () => {
      const handler = vi.fn();
      manager.on('exited', handler);

      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      process.emit('exit', 0, null);
      process.emit('close', 0, null);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('kill', () => {
    it('should return error for non-existent work order', async () => {
      const result = await manager.kill('unknown');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No process found');
    });

    it('should return success for already exited process', async () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);
      process.emit('exit', 0, null);

      const result = await manager.kill('wo-1');

      expect(result.success).toBe(true);
      expect(result.forcedKill).toBe(false);
    });

    it('should send SIGTERM first for graceful shutdown', async () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      // Simulate process exiting after SIGTERM
      const killPromise = manager.kill('wo-1', { gracePeriodMs: 100 });
      setTimeout(() => process.emit('exit', 0, null), 10);

      const result = await killPromise;

      expect(process.kill).toHaveBeenCalledWith('SIGTERM');
      expect(result.success).toBe(true);
      expect(result.forcedKill).toBe(false);
    });

    it('should escalate to SIGKILL if graceful shutdown fails', async () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      // Process doesn't exit on SIGTERM, so manager should escalate to SIGKILL
      const killPromise = manager.kill('wo-1', { gracePeriodMs: 50 });
      setTimeout(() => process.emit('exit', 137, 'SIGKILL'), 100);

      const result = await killPromise;

      expect(process.kill).toHaveBeenCalledWith('SIGTERM');
      expect(process.kill).toHaveBeenCalledWith('SIGKILL');
      expect(result.success).toBe(true);
      expect(result.forcedKill).toBe(true);
    });

    it('should emit killed event', async () => {
      const handler = vi.fn();
      manager.on('killed', handler);

      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      const killPromise = manager.kill('wo-1');
      setTimeout(() => process.emit('exit', 0, null), 10);
      await killPromise;

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]![0]).toBe('wo-1');
    });

    it('should log reason when provided', async () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      const killPromise = manager.kill('wo-1', {
        reason: 'User requested cancellation',
      });
      setTimeout(() => process.emit('exit', 0, null), 10);

      const result = await killPromise;
      expect(result.success).toBe(true);
    });
  });

  describe('forceKill', () => {
    it('should skip graceful shutdown and send SIGKILL immediately', async () => {
      const process = createMockProcess();
      manager.register('wo-1', 'run-1', process);

      const killPromise = manager.forceKill('wo-1');
      setTimeout(() => process.emit('exit', 137, 'SIGKILL'), 10);

      const result = await killPromise;

      expect(process.kill).toHaveBeenCalledWith('SIGKILL');
      expect(result.forcedKill).toBe(true);
    });

    it('should emit forceKilled event', async () => {
      const handler = vi.fn();
      manager.on('forceKilled', handler);

      const process = createMockProcess(12345);
      manager.register('wo-1', 'run-1', process);

      const killPromise = manager.forceKill('wo-1');
      setTimeout(() => process.emit('exit', 137, 'SIGKILL'), 10);
      await killPromise;

      expect(handler).toHaveBeenCalledWith('wo-1', 12345);
    });
  });

  describe('getAllProcesses', () => {
    it('should return all tracked processes', () => {
      manager.register('wo-1', 'run-1', createMockProcess(1));
      manager.register('wo-2', 'run-2', createMockProcess(2));
      manager.register('wo-3', 'run-3', createMockProcess(3));

      const all = manager.getAllProcesses();

      expect(all).toHaveLength(3);
      expect(all.map((p) => p.workOrderId)).toEqual(
        expect.arrayContaining(['wo-1', 'wo-2', 'wo-3'])
      );
    });
  });

  describe('getActiveCount', () => {
    it('should count only active (non-exited) processes', () => {
      const p1 = createMockProcess(1);
      const p2 = createMockProcess(2);
      const p3 = createMockProcess(3);

      manager.register('wo-1', 'run-1', p1);
      manager.register('wo-2', 'run-2', p2);
      manager.register('wo-3', 'run-3', p3);

      expect(manager.getActiveCount()).toBe(3);

      p1.emit('exit', 0, null);
      expect(manager.getActiveCount()).toBe(2);

      p2.emit('exit', 0, null);
      expect(manager.getActiveCount()).toBe(1);
    });
  });

  describe('killAll', () => {
    it('should kill all active processes', async () => {
      const p1 = createMockProcess(1);
      const p2 = createMockProcess(2);
      const p3 = createMockProcess(3);

      manager.register('wo-1', 'run-1', p1);
      manager.register('wo-2', 'run-2', p2);
      manager.register('wo-3', 'run-3', p3);

      // Exit p3 before killAll
      p3.emit('exit', 0, null);

      const resultsPromise = manager.killAll({ gracePeriodMs: 50 });
      setTimeout(() => {
        p1.emit('exit', 0, null);
        p2.emit('exit', 0, null);
      }, 10);

      const results = await resultsPromise;

      // Should only have results for active processes
      expect(results.size).toBe(2);
      expect(results.has('wo-1')).toBe(true);
      expect(results.has('wo-2')).toBe(true);
      expect(results.has('wo-3')).toBe(false);
    });
  });

  describe('monitoring', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start monitoring on startMonitoring()', () => {
      const managerWithShortInterval = createAgentProcessManager({
        staleCheckIntervalMs: 1000,
        maxProcessLifetimeMs: 500,
      });

      managerWithShortInterval.startMonitoring();

      const process = createMockProcess();
      managerWithShortInterval.register('wo-1', 'run-1', process);

      // The stale check should run after interval
      vi.advanceTimersByTime(1500);

      // Just verify no errors - actual warning is logged
      expect(managerWithShortInterval.hasActiveProcess('wo-1')).toBe(true);

      managerWithShortInterval.stopMonitoring();
    });

    it('should not double-start monitoring', () => {
      manager.startMonitoring();
      manager.startMonitoring();

      // Should not throw and should clean up properly
      manager.stopMonitoring();
    });
  });

  describe('shutdown', () => {
    it('should kill all active processes on shutdown', async () => {
      const p1 = createMockProcess(1);
      const p2 = createMockProcess(2);

      manager.register('wo-1', 'run-1', p1);
      manager.register('wo-2', 'run-2', p2);

      const shutdownPromise = manager.shutdown();
      setTimeout(() => {
        p1.emit('exit', 137, 'SIGTERM');
        p2.emit('exit', 137, 'SIGTERM');
      }, 10);

      await shutdownPromise;

      expect(manager.getAllProcesses()).toHaveLength(0);
    });

    it('should stop monitoring on shutdown', async () => {
      manager.startMonitoring();
      await manager.shutdown();

      // Should complete without errors
    });
  });
});

describe('singleton functions', () => {
  beforeEach(() => {
    resetAgentProcessManager();
  });

  afterEach(() => {
    resetAgentProcessManager();
  });

  it('getAgentProcessManager should return same instance', () => {
    const m1 = getAgentProcessManager();
    const m2 = getAgentProcessManager();

    expect(m1).toBe(m2);
  });

  it('createAgentProcessManager should return new instance', () => {
    const m1 = createAgentProcessManager();
    const m2 = createAgentProcessManager();

    expect(m1).not.toBe(m2);
  });

  it('resetAgentProcessManager should clear singleton', async () => {
    const m1 = getAgentProcessManager();
    resetAgentProcessManager();
    const m2 = getAgentProcessManager();

    expect(m1).not.toBe(m2);
  });
});

describe('QueueManager forceCancel integration', () => {
  let queue: import('../src/control-plane/queue-manager.js').QueueManager;

  beforeEach(async () => {
    const { createQueueManager, resetQueueManager } = await import(
      '../src/control-plane/queue-manager.js'
    );
    resetQueueManager();
    queue = createQueueManager({ maxConcurrent: 2, maxQueueSize: 10 });
  });

  afterEach(async () => {
    await queue.shutdown();
  });

  it('should remove from queue with forceCancel', () => {
    queue.enqueue('wo-1');
    queue.enqueue('wo-2');

    const result = queue.forceCancel('wo-1');

    expect(result.fromQueue).toBe(true);
    expect(result.fromRunning).toBe(false);
    expect(queue.isEnqueued('wo-1')).toBe(false);
  });

  it('should remove from running with forceCancel', () => {
    queue.enqueue('wo-1');
    queue.markStarted('wo-1');

    const result = queue.forceCancel('wo-1');

    expect(result.fromQueue).toBe(false);
    expect(result.fromRunning).toBe(true);
    expect(queue.isRunning('wo-1')).toBe(false);
  });

  it('should return false for both if not found', () => {
    const result = queue.forceCancel('unknown');

    expect(result.fromQueue).toBe(false);
    expect(result.fromRunning).toBe(false);
  });

  it('should process queue after force canceling running work order', () => {
    const readyHandler = vi.fn();
    queue.on('ready', readyHandler);

    // Fill capacity
    queue.enqueue('wo-1');
    queue.markStarted('wo-1');
    queue.enqueue('wo-2');
    queue.markStarted('wo-2');
    queue.enqueue('wo-3');

    readyHandler.mockClear();

    // Force cancel one running
    queue.forceCancel('wo-1');

    // Should trigger ready for the waiting work order
    expect(readyHandler).toHaveBeenCalledWith('wo-3');
  });
});
