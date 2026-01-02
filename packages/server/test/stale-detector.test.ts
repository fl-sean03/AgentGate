/**
 * Tests for Stale Work Order Detector (v0.2.23 - Wave 2.2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  StaleDetector,
  createStaleDetector,
  resetStaleDetector,
  type StaleCheck,
} from '../src/control-plane/stale-detector.js';
import type { WorkOrderStore } from '../src/control-plane/work-order-store.js';
import type { QueueManager } from '../src/control-plane/queue-manager.js';
import type { WorkOrder } from '../src/types/index.js';
import { WorkOrderStatus } from '../src/types/work-order.js';

// Create a mock process manager - this gets hoisted and used by the mock
const mockProcessManager = {
  getProcess: vi.fn(),
  forceKill: vi.fn(),
};

// Mock the agent process manager
vi.mock('../src/control-plane/agent-process-manager.js', () => ({
  getAgentProcessManager: vi.fn(() => mockProcessManager),
}));

/**
 * Create a mock WorkOrderStore for testing.
 */
function createMockWorkOrderStore(): WorkOrderStore & { _workOrders: WorkOrder[], setWorkOrders: (wos: WorkOrder[]) => void } {
  let workOrders: WorkOrder[] = [];

  const store = {
    _workOrders: workOrders,
    setWorkOrders: (wos: WorkOrder[]) => {
      workOrders = wos;
      store._workOrders = wos;
    },
    init: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockImplementation(async (id: string) => {
      return workOrders.find(wo => wo.id === id) ?? null;
    }),
    list: vi.fn().mockImplementation(async () => workOrders),
    delete: vi.fn().mockResolvedValue(true),
    exists: vi.fn().mockResolvedValue(true),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(workOrders.length),
    getAllIds: vi.fn().mockResolvedValue(new Set(workOrders.map(wo => wo.id))),
    validateStorage: vi.fn().mockResolvedValue({ directoryExists: true, totalFiles: 0, validCount: 0, invalidCount: 0, files: [], corruptedFiles: [], durationMs: 0 }),
    getCorruptedFiles: vi.fn().mockResolvedValue([]),
    purge: vi.fn().mockResolvedValue({ deletedCount: 0, deletedIds: [] }),
  };

  return store as unknown as WorkOrderStore & { _workOrders: WorkOrder[], setWorkOrders: (wos: WorkOrder[]) => void };
}

/**
 * Create a mock QueueManager for testing.
 */
function createMockQueueManager(): QueueManager {
  const emitter = new EventEmitter();

  return Object.assign(emitter, {
    getRunningWorkOrderInfo: vi.fn().mockReturnValue(null),
    forceCancel: vi.fn().mockReturnValue({ fromQueue: false, fromRunning: true }),
    getStats: vi.fn().mockReturnValue({ waiting: 0, running: 0, maxConcurrent: 2, averageWaitMs: 0, maxQueueSize: 100, accepting: true }),
    enqueue: vi.fn(),
    dequeue: vi.fn(),
    markStarted: vi.fn(),
    markCompleted: vi.fn(),
    cancel: vi.fn(),
    cancelRunning: vi.fn(),
    isEnqueued: vi.fn(),
    isRunning: vi.fn(),
  }) as unknown as QueueManager;
}

/**
 * Create a mock work order for testing.
 */
function createMockWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: `wo-${Date.now()}-${Math.random()}`,
    taskPrompt: 'Test task',
    workspaceSource: { type: 'local', path: '/tmp/test' },
    agentType: 'claude-code-subscription',
    maxIterations: 3,
    maxWallClockSeconds: 3600,
    gatePlanSource: 'auto',
    policies: { networkAllowed: false, allowedPaths: [], forbiddenPatterns: [] },
    createdAt: new Date(),
    status: 'running' as const,
    ...overrides,
  };
}

describe('StaleDetector', () => {
  let detector: StaleDetector;
  let mockStore: WorkOrderStore & { _workOrders: WorkOrder[], setWorkOrders: (wos: WorkOrder[]) => void };
  let mockQueueManager: QueueManager;

  beforeEach(() => {
    resetStaleDetector();

    mockStore = createMockWorkOrderStore();
    mockQueueManager = createMockQueueManager();

    // Reset mocks
    mockProcessManager.getProcess.mockReset();
    mockProcessManager.forceKill.mockReset();
    mockProcessManager.forceKill.mockResolvedValue({ success: true, forcedKill: true, durationMs: 100 });
  });

  afterEach(async () => {
    if (detector) {
      await detector.stop();
    }
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create detector with default config', () => {
      detector = createStaleDetector(mockStore, mockQueueManager);

      expect(detector).toBeInstanceOf(StaleDetector);
      expect(detector.isRunning()).toBe(false);
    });

    it('should create detector with custom config', () => {
      detector = createStaleDetector(mockStore, mockQueueManager, {
        checkIntervalMs: 30000,
        staleThresholdMs: 300000,
        maxRunningTimeMs: 7200000,
      });

      expect(detector).toBeInstanceOf(StaleDetector);
    });
  });

  describe('start and stop', () => {
    it('should start periodic checking', () => {
      detector = createStaleDetector(mockStore, mockQueueManager, {
        checkIntervalMs: 60000, // Long interval
      });

      expect(detector.isRunning()).toBe(false);

      detector.start();

      expect(detector.isRunning()).toBe(true);
    });

    it('should stop periodic checking', async () => {
      detector = createStaleDetector(mockStore, mockQueueManager, {
        checkIntervalMs: 60000,
      });

      detector.start();
      expect(detector.isRunning()).toBe(true);

      await detector.stop();

      expect(detector.isRunning()).toBe(false);
    });

    it('should not start twice', () => {
      detector = createStaleDetector(mockStore, mockQueueManager, {
        checkIntervalMs: 60000,
      });

      detector.start();
      detector.start(); // Should not throw or create duplicate timers

      expect(detector.isRunning()).toBe(true);
    });

    it('should emit checkStarted and checkCompleted events', async () => {
      detector = createStaleDetector(mockStore, mockQueueManager, {
        checkIntervalMs: 60000, // Long interval so we can control timing
      });

      const checkStartedHandler = vi.fn();
      const checkCompletedHandler = vi.fn();

      detector.on('checkStarted', checkStartedHandler);
      detector.on('checkCompleted', checkCompletedHandler);

      // Manually trigger a check
      await detector.checkForStaleWorkOrders();

      expect(checkStartedHandler).toHaveBeenCalledTimes(1);
      expect(checkCompletedHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkForStaleWorkOrders', () => {
    it('should return empty array when no running work orders', async () => {
      detector = createStaleDetector(mockStore, mockQueueManager);
      mockStore.setWorkOrders([]);

      const results = await detector.checkForStaleWorkOrders();

      expect(results).toEqual([]);
    });

    it('should detect healthy work order with active process', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
        createdAt: new Date(),
      });
      mockStore.setWorkOrders([workOrder]);

      // Mock process is alive
      mockProcessManager.getProcess.mockReturnValue({
        workOrderId: 'wo-1',
        runId: 'run-1',
        pid: 12345,
        hasExited: false,
        startedAt: new Date(),
        killSignalSent: false,
        killSignalSentAt: null,
        exitCode: null,
        exitSignal: null,
      });

      // Mock process.kill to not throw (process is alive)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      detector = createStaleDetector(mockStore, mockQueueManager, {
        maxRunningTimeMs: 3600000, // 1 hour
      });

      const results = await detector.checkForStaleWorkOrders();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('healthy');
      expect(results[0]!.workOrderId).toBe('wo-1');

      killSpy.mockRestore();
    });

    it('should detect dead work order when no process found', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
      });
      mockStore.setWorkOrders([workOrder]);

      // No process tracked
      mockProcessManager.getProcess.mockReturnValue(null);

      detector = createStaleDetector(mockStore, mockQueueManager);

      const staleDetectedHandler = vi.fn();
      const deadProcessHandler = vi.fn();
      const staleHandledHandler = vi.fn();

      detector.on('staleDetected', staleDetectedHandler);
      detector.on('deadProcessDetected', deadProcessHandler);
      detector.on('staleHandled', staleHandledHandler);

      const results = await detector.checkForStaleWorkOrders();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('dead');
      expect(results[0]!.reason).toContain('No process found');

      // Should emit events
      expect(staleDetectedHandler).toHaveBeenCalledWith(expect.objectContaining({
        workOrderId: 'wo-1',
        status: 'dead',
      }));
      expect(deadProcessHandler).toHaveBeenCalledWith('wo-1', expect.any(String));
      expect(staleHandledHandler).toHaveBeenCalledWith('wo-1', expect.any(Boolean));
    });

    it('should detect dead work order when process has exited', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
      });
      mockStore.setWorkOrders([workOrder]);

      // Process has exited
      mockProcessManager.getProcess.mockReturnValue({
        workOrderId: 'wo-1',
        runId: 'run-1',
        pid: 12345,
        hasExited: true,
        startedAt: new Date(),
        killSignalSent: false,
        killSignalSentAt: null,
        exitCode: 1,
        exitSignal: null,
      });

      detector = createStaleDetector(mockStore, mockQueueManager);

      const results = await detector.checkForStaleWorkOrders();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('dead');
      expect(results[0]!.reason).toContain('Process exited');
    });

    it('should detect dead work order when process PID not running', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
      });
      mockStore.setWorkOrders([workOrder]);

      // Process tracked but not running
      mockProcessManager.getProcess.mockReturnValue({
        workOrderId: 'wo-1',
        runId: 'run-1',
        pid: 12345,
        hasExited: false,
        startedAt: new Date(),
        killSignalSent: false,
        killSignalSentAt: null,
        exitCode: null,
        exitSignal: null,
      });

      // Mock process.kill to throw (process doesn't exist)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      detector = createStaleDetector(mockStore, mockQueueManager);

      const results = await detector.checkForStaleWorkOrders();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('dead');
      expect(results[0]!.reason).toContain('is not running');

      killSpy.mockRestore();
    });

    it('should detect stale work order exceeding max running time', async () => {
      // Create work order that started 5 hours ago
      const startTime = new Date(Date.now() - 5 * 3600000);
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
        createdAt: startTime,
      });
      mockStore.setWorkOrders([workOrder]);

      // Process is alive
      mockProcessManager.getProcess.mockReturnValue({
        workOrderId: 'wo-1',
        runId: 'run-1',
        pid: 12345,
        hasExited: false,
        startedAt: startTime,
        killSignalSent: false,
        killSignalSentAt: null,
        exitCode: null,
        exitSignal: null,
      });

      // Mock process.kill to not throw (process is alive)
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      detector = createStaleDetector(mockStore, mockQueueManager, {
        maxRunningTimeMs: 4 * 3600000, // 4 hours max
      });

      const results = await detector.checkForStaleWorkOrders();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('stale');
      expect(results[0]!.reason).toContain('Running for');

      killSpy.mockRestore();
    });
  });

  describe('handleStaleWorkOrder', () => {
    it('should kill process and mark work order as failed', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
      });
      mockStore.setWorkOrders([workOrder]);

      // No process tracked (simulating dead process)
      mockProcessManager.getProcess.mockReturnValue(null);

      detector = createStaleDetector(mockStore, mockQueueManager);

      await detector.checkForStaleWorkOrders();

      // Should attempt to force kill
      expect(mockProcessManager.forceKill).toHaveBeenCalledWith('wo-1', expect.stringContaining('Stale detection'));

      // Should update work order status to failed
      expect(mockStore.updateStatus).toHaveBeenCalledWith('wo-1', 'failed', expect.objectContaining({
        error: expect.stringContaining('Stale detection'),
        completedAt: expect.any(Date),
      }));

      // Should remove from queue manager
      expect(mockQueueManager.forceCancel).toHaveBeenCalledWith('wo-1');
    });

    it('should emit staleHandled event with kill result', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
      });
      mockStore.setWorkOrders([workOrder]);

      mockProcessManager.getProcess.mockReturnValue(null);
      mockProcessManager.forceKill.mockResolvedValue({ success: true, forcedKill: true, durationMs: 100 });

      detector = createStaleDetector(mockStore, mockQueueManager);

      const staleHandledHandler = vi.fn();
      detector.on('staleHandled', staleHandledHandler);

      await detector.checkForStaleWorkOrders();

      expect(staleHandledHandler).toHaveBeenCalledWith('wo-1', true);
    });
  });

  describe('multiple running work orders', () => {
    it('should check all running work orders', async () => {
      const workOrders = [
        createMockWorkOrder({ id: 'wo-1', status: WorkOrderStatus.RUNNING }),
        createMockWorkOrder({ id: 'wo-2', status: WorkOrderStatus.RUNNING }),
        createMockWorkOrder({ id: 'wo-3', status: WorkOrderStatus.QUEUED }), // Should be skipped
      ];
      mockStore.setWorkOrders(workOrders);

      // All processes alive
      mockProcessManager.getProcess.mockImplementation((id: string) => {
        if (id === 'wo-1' || id === 'wo-2') {
          return {
            workOrderId: id,
            runId: 'run-1',
            pid: 12345,
            hasExited: false,
            startedAt: new Date(),
            killSignalSent: false,
            killSignalSentAt: null,
            exitCode: null,
            exitSignal: null,
          };
        }
        return null;
      });

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      detector = createStaleDetector(mockStore, mockQueueManager);

      const results = await detector.checkForStaleWorkOrders();

      // Should only check running work orders (wo-1 and wo-2)
      expect(results).toHaveLength(2);
      expect(results.map(r => r.workOrderId)).toContain('wo-1');
      expect(results.map(r => r.workOrderId)).toContain('wo-2');

      killSpy.mockRestore();
    });

    it('should handle mixed healthy and stale work orders', async () => {
      const oldStartTime = new Date(Date.now() - 5 * 3600000); // 5 hours ago
      const workOrders = [
        createMockWorkOrder({ id: 'wo-healthy', status: WorkOrderStatus.RUNNING, createdAt: new Date() }),
        createMockWorkOrder({ id: 'wo-stale', status: WorkOrderStatus.RUNNING, createdAt: oldStartTime }),
      ];
      mockStore.setWorkOrders(workOrders);

      mockProcessManager.getProcess.mockImplementation((id: string) => ({
        workOrderId: id,
        runId: 'run-1',
        pid: 12345,
        hasExited: false,
        startedAt: id === 'wo-healthy' ? new Date() : oldStartTime,
        killSignalSent: false,
        killSignalSentAt: null,
        exitCode: null,
        exitSignal: null,
      }));

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      detector = createStaleDetector(mockStore, mockQueueManager, {
        maxRunningTimeMs: 4 * 3600000, // 4 hours
      });

      const results = await detector.checkForStaleWorkOrders();

      const healthyResult = results.find(r => r.workOrderId === 'wo-healthy');
      const staleResult = results.find(r => r.workOrderId === 'wo-stale');

      expect(healthyResult?.status).toBe('healthy');
      expect(staleResult?.status).toBe('stale');

      // Only stale work order should be marked as failed
      expect(mockStore.updateStatus).toHaveBeenCalledTimes(1);
      expect(mockStore.updateStatus).toHaveBeenCalledWith('wo-stale', 'failed', expect.any(Object));

      killSpy.mockRestore();
    });
  });

  describe('periodic checking', () => {
    it('should run checks at configured interval', async () => {
      vi.useFakeTimers();

      detector = createStaleDetector(mockStore, mockQueueManager, {
        checkIntervalMs: 1000, // 1 second
      });

      const checkStartedHandler = vi.fn();
      detector.on('checkStarted', checkStartedHandler);

      detector.start();

      // Initial check runs immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(checkStartedHandler).toHaveBeenCalledTimes(1);

      // Advance past first interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(checkStartedHandler).toHaveBeenCalledTimes(2);

      // Advance past second interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(checkStartedHandler).toHaveBeenCalledTimes(3);

      // Stop the detector to clean up timers before vi.useRealTimers()
      vi.useRealTimers();
      await detector.stop();
    });
  });

  describe('error handling', () => {
    it('should handle errors in store list gracefully', async () => {
      mockStore.list = vi.fn().mockRejectedValue(new Error('Database error'));

      detector = createStaleDetector(mockStore, mockQueueManager);

      // Should not throw
      const results = await detector.checkForStaleWorkOrders();

      expect(results).toEqual([]);
    });

    it('should handle errors in updateStatus gracefully', async () => {
      const workOrder = createMockWorkOrder({
        id: 'wo-1',
        status: WorkOrderStatus.RUNNING,
      });
      mockStore.setWorkOrders([workOrder]);

      mockProcessManager.getProcess.mockReturnValue(null);
      mockStore.updateStatus = vi.fn().mockRejectedValue(new Error('Update failed'));

      detector = createStaleDetector(mockStore, mockQueueManager);

      // Should not throw
      const results = await detector.checkForStaleWorkOrders();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe('dead');
    });
  });
});

describe('createStaleDetector', () => {
  it('should create new instance each time', () => {
    const mockStore = createMockWorkOrderStore();
    const mockQueueManager = createMockQueueManager();

    const detector1 = createStaleDetector(mockStore, mockQueueManager);
    const detector2 = createStaleDetector(mockStore, mockQueueManager);

    expect(detector1).not.toBe(detector2);
  });
});
