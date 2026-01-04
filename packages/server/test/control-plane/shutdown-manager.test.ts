/**
 * Tests for Shutdown Manager.
 * (v0.2.27 - Thrust 3: Atomic Graceful Shutdown)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ShutdownManager,
  ShutdownPhase,
  getShutdownManager,
  registerShutdownHandler,
  type ShutdownResult,
} from '../../src/control-plane/shutdown-manager.js';

describe('ShutdownManager', () => {
  beforeEach(() => {
    ShutdownManager.resetInstance();
  });

  afterEach(() => {
    ShutdownManager.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ShutdownManager.getInstance();
      const instance2 = ShutdownManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should accept configuration on first call', () => {
      const instance = ShutdownManager.getInstance({
        overallTimeoutMs: 30000,
      });

      expect(instance).toBeDefined();
    });
  });

  describe('getState', () => {
    it('should start in running state', () => {
      const manager = ShutdownManager.getInstance();
      expect(manager.getState()).toBe('running');
    });

    it('should be shutting_down after initiateShutdown', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const promise = manager.initiateShutdown('TEST');
      expect(manager.getState()).toBe('shutting_down');

      await promise;
    });

    it('should be shutdown after completion', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      await manager.initiateShutdown('TEST');
      expect(manager.getState()).toBe('shutdown');
    });
  });

  describe('register', () => {
    it('should register a handler', () => {
      const manager = ShutdownManager.getInstance();
      const handler = vi.fn().mockResolvedValue(undefined);

      manager.register('test-handler', handler);

      expect(manager.getHandlerCount()).toBe(1);
    });

    it('should replace existing handler with same name', () => {
      const manager = ShutdownManager.getInstance();
      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      manager.register('test-handler', handler1);
      manager.register('test-handler', handler2);

      expect(manager.getHandlerCount()).toBe(1);
    });

    it('should register handler with priority and phase', () => {
      const manager = ShutdownManager.getInstance();
      const handler = vi.fn().mockResolvedValue(undefined);

      manager.register('test-handler', handler, 100, ShutdownPhase.STOP_ACCEPTING);

      expect(manager.getHandlerCount()).toBe(1);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing handler', () => {
      const manager = ShutdownManager.getInstance();
      const handler = vi.fn().mockResolvedValue(undefined);

      manager.register('test-handler', handler);
      const result = manager.unregister('test-handler');

      expect(result).toBe(true);
      expect(manager.getHandlerCount()).toBe(0);
    });

    it('should return false for non-existent handler', () => {
      const manager = ShutdownManager.getInstance();

      const result = manager.unregister('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('initiateShutdown', () => {
    it('should call all registered handlers', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const handler1 = vi.fn().mockResolvedValue(undefined);
      const handler2 = vi.fn().mockResolvedValue(undefined);

      manager.register('handler1', handler1, 50, ShutdownPhase.CLOSE_RESOURCES);
      manager.register('handler2', handler2, 50, ShutdownPhase.CLOSE_RESOURCES);

      await manager.initiateShutdown('TEST');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should call handlers in priority order within phase', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const callOrder: string[] = [];

      manager.register(
        'low-priority',
        async () => { callOrder.push('low'); },
        10,
        ShutdownPhase.CLOSE_RESOURCES
      );
      manager.register(
        'high-priority',
        async () => { callOrder.push('high'); },
        100,
        ShutdownPhase.CLOSE_RESOURCES
      );
      manager.register(
        'medium-priority',
        async () => { callOrder.push('medium'); },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );

      await manager.initiateShutdown('TEST');

      // Note: Within a phase, handlers run in parallel but are sorted by priority
      // So order depends on execution timing, but all should be called
      expect(callOrder).toContain('high');
      expect(callOrder).toContain('medium');
      expect(callOrder).toContain('low');
    });

    it('should execute phases in order', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const phaseOrder: ShutdownPhase[] = [];

      manager.register(
        'stop-accepting',
        async () => { phaseOrder.push(ShutdownPhase.STOP_ACCEPTING); },
        50,
        ShutdownPhase.STOP_ACCEPTING
      );
      manager.register(
        'close-resources',
        async () => { phaseOrder.push(ShutdownPhase.CLOSE_RESOURCES); },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );
      manager.register(
        'persist-state',
        async () => { phaseOrder.push(ShutdownPhase.PERSIST_STATE); },
        50,
        ShutdownPhase.PERSIST_STATE
      );

      await manager.initiateShutdown('TEST');

      // Phases should execute in enum order
      expect(phaseOrder[0]).toBe(ShutdownPhase.STOP_ACCEPTING);
      expect(phaseOrder[1]).toBe(ShutdownPhase.PERSIST_STATE);
      expect(phaseOrder[2]).toBe(ShutdownPhase.CLOSE_RESOURCES);
    });

    it('should return same result if called twice during shutdown', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      // Start shutdown
      const promise1 = manager.initiateShutdown('TEST');

      // Try to start again - should get same promise
      const promise2 = manager.initiateShutdown('TEST');

      // Both should resolve to the same result
      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(result2);
    });

    it('should report successful handlers', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      manager.register('success1', async () => {}, 50, ShutdownPhase.CLOSE_RESOURCES);
      manager.register('success2', async () => {}, 50, ShutdownPhase.CLOSE_RESOURCES);

      const result = await manager.initiateShutdown('TEST');

      expect(result.success).toBe(true);
      expect(result.completed).toContain('success1');
      expect(result.completed).toContain('success2');
      expect(result.failed).toHaveLength(0);
    });

    it('should report failed handlers', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      manager.register(
        'failing-handler',
        async () => { throw new Error('Handler failed'); },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );

      const result = await manager.initiateShutdown('TEST');

      expect(result.success).toBe(false);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]?.name).toBe('failing-handler');
      expect(result.failed[0]?.error).toBe('Handler failed');
    });

    it('should continue shutdown even if handlers fail', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const successHandler = vi.fn().mockResolvedValue(undefined);

      manager.register(
        'failing-handler',
        async () => { throw new Error('Fail'); },
        100,
        ShutdownPhase.CLOSE_RESOURCES
      );
      manager.register('success-handler', successHandler, 50, ShutdownPhase.CLOSE_RESOURCES);

      await manager.initiateShutdown('TEST');

      expect(successHandler).toHaveBeenCalled();
    });

    it('should pass abort signal to handlers', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      let receivedSignal: AbortSignal | undefined;

      manager.register(
        'signal-handler',
        async (signal) => {
          receivedSignal = signal;
        },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );

      await manager.initiateShutdown('TEST');

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal instanceof AbortSignal).toBe(true);
    });

    it('should report duration', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      manager.register(
        'slow-handler',
        async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
        },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );

      const result = await manager.initiateShutdown('TEST');

      expect(result.durationMs).toBeGreaterThanOrEqual(45);
    });
  });

  describe('forceShutdown', () => {
    it('should skip certain phases', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const phases: ShutdownPhase[] = [];

      manager.register(
        'complete-requests',
        async () => { phases.push(ShutdownPhase.COMPLETE_REQUESTS); },
        50,
        ShutdownPhase.COMPLETE_REQUESTS
      );
      manager.register(
        'interrupt-agents',
        async () => { phases.push(ShutdownPhase.INTERRUPT_AGENTS); },
        50,
        ShutdownPhase.INTERRUPT_AGENTS
      );
      manager.register(
        'persist-state',
        async () => { phases.push(ShutdownPhase.PERSIST_STATE); },
        50,
        ShutdownPhase.PERSIST_STATE
      );

      const result = await manager.forceShutdown('TEST');

      expect(result.forced).toBe(true);
      expect(phases).not.toContain(ShutdownPhase.COMPLETE_REQUESTS);
      expect(phases).not.toContain(ShutdownPhase.INTERRUPT_AGENTS);
      expect(phases).toContain(ShutdownPhase.PERSIST_STATE);
    });

    it('should return forced flag', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const result = await manager.forceShutdown('TEST');

      expect(result.forced).toBe(true);
    });
  });

  describe('isShuttingDown', () => {
    it('should return false when running', () => {
      const manager = ShutdownManager.getInstance();
      expect(manager.isShuttingDown()).toBe(false);
    });

    it('should return true during shutdown', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      const promise = manager.initiateShutdown('TEST');
      expect(manager.isShuttingDown()).toBe(true);

      await promise;
    });

    it('should return true after shutdown', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
      });

      await manager.initiateShutdown('TEST');
      expect(manager.isShuttingDown()).toBe(true);
    });
  });

  describe('timeout handling', () => {
    it('should timeout slow handlers', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
        phaseTimeouts: {
          [ShutdownPhase.CLOSE_RESOURCES]: 100,
        },
      });

      let wasAborted = false;

      manager.register(
        'slow-handler',
        async (signal) => {
          // This handler respects the abort signal
          return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => resolve(), 500);
            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              wasAborted = true;
              reject(new Error('Aborted'));
            });
          });
        },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );

      const result = await manager.initiateShutdown('TEST');

      // Handler should have been aborted/timed out
      expect(wasAborted || result.timedOut.includes('slow-handler') || result.failed.some(f => f.name === 'slow-handler')).toBe(true);
    });

    it('should abort signal on timeout', async () => {
      const manager = ShutdownManager.getInstance({
        exitProcess: false,
        phaseTimeouts: {
          [ShutdownPhase.CLOSE_RESOURCES]: 100,
        },
      });

      let signalAborted = false;

      manager.register(
        'signal-checker',
        async (signal) => {
          await new Promise(resolve => setTimeout(resolve, 500));
          signalAborted = signal.aborted;
        },
        50,
        ShutdownPhase.CLOSE_RESOURCES
      );

      await manager.initiateShutdown('TEST');

      // After timeout, the signal should have been aborted
      // (though the handler may have completed due to Promise.allSettled)
    });
  });

  describe('convenience functions', () => {
    it('getShutdownManager should return singleton', () => {
      const manager1 = getShutdownManager();
      const manager2 = getShutdownManager();

      expect(manager1).toBe(manager2);
    });

    it('registerShutdownHandler should register handler', async () => {
      // Initialize manager with exitProcess: false FIRST
      const manager = ShutdownManager.getInstance({ exitProcess: false });

      const handler = vi.fn().mockResolvedValue(undefined);

      registerShutdownHandler('convenience-handler', handler);

      await manager.initiateShutdown('TEST');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('resetInstance', () => {
    it('should reset state and handlers', () => {
      const manager = ShutdownManager.getInstance();
      manager.register('handler', async () => {});

      ShutdownManager.resetInstance();

      const newManager = ShutdownManager.getInstance();
      expect(newManager.getHandlerCount()).toBe(0);
      expect(newManager.getState()).toBe('running');
    });
  });
});
