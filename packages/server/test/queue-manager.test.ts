/**
 * Tests for Work Order Queue Manager (v0.2.19 - Thrust 7)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  QueueManager,
  createQueueManager,
  getQueueManager,
  resetQueueManager,
  type QueuePosition,
} from '../src/control-plane/queue-manager.js';

describe('QueueManager', () => {
  let queue: QueueManager;

  beforeEach(() => {
    resetQueueManager();
    queue = createQueueManager({ maxConcurrent: 2, maxQueueSize: 10 });
  });

  afterEach(async () => {
    await queue.shutdown();
  });

  describe('enqueue', () => {
    it('should enqueue work order and return position', () => {
      const result = queue.enqueue('wo-1');

      expect(result.success).toBe(true);
      expect(result.position).not.toBeNull();
      expect(result.position!.position).toBe(1);
      expect(result.position!.state).toBe('waiting');
      expect(result.position!.ahead).toBe(0);
    });

    it('should assign increasing positions to multiple work orders', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.enqueue('wo-3');

      const pos1 = queue.getPosition('wo-1');
      const pos2 = queue.getPosition('wo-2');
      const pos3 = queue.getPosition('wo-3');

      expect(pos1!.position).toBe(1);
      expect(pos2!.position).toBe(2);
      expect(pos3!.position).toBe(3);
    });

    it('should respect priority ordering', () => {
      queue.enqueue('wo-low', { priority: 0 });
      queue.enqueue('wo-high', { priority: 10 });
      queue.enqueue('wo-medium', { priority: 5 });

      const posHigh = queue.getPosition('wo-high');
      const posMedium = queue.getPosition('wo-medium');
      const posLow = queue.getPosition('wo-low');

      expect(posHigh!.position).toBe(1);
      expect(posMedium!.position).toBe(2);
      expect(posLow!.position).toBe(3);
    });

    it('should maintain FIFO within same priority', () => {
      queue.enqueue('wo-1', { priority: 5 });
      queue.enqueue('wo-2', { priority: 5 });
      queue.enqueue('wo-3', { priority: 5 });

      const pos1 = queue.getPosition('wo-1');
      const pos2 = queue.getPosition('wo-2');
      const pos3 = queue.getPosition('wo-3');

      expect(pos1!.position).toBe(1);
      expect(pos2!.position).toBe(2);
      expect(pos3!.position).toBe(3);
    });

    it('should reject when queue is full', () => {
      const smallQueue = createQueueManager({ maxConcurrent: 1, maxQueueSize: 2 });

      smallQueue.enqueue('wo-1');
      smallQueue.enqueue('wo-2');
      const result = smallQueue.enqueue('wo-3');

      expect(result.success).toBe(false);
      expect(result.error).toContain('full');
      expect(result.position).toBeNull();
    });

    it('should reject duplicate work orders', () => {
      queue.enqueue('wo-1');
      const result = queue.enqueue('wo-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already queued');
    });

    it('should call onPositionChange when position changes', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      queue.enqueue('wo-1', { onPositionChange: callback1 });
      queue.enqueue('wo-2', { onPositionChange: callback2 });

      // wo-1 should be notified when enqueued and when wo-2 joins
      expect(callback1).toHaveBeenCalled();
      // wo-2 should be notified when enqueued
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('dequeue', () => {
    it('should return null when queue is empty', () => {
      const result = queue.dequeue();
      expect(result).toBeNull();
    });

    it('should return null when at capacity', () => {
      // Fill running capacity
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-2');

      // Add one to queue
      queue.enqueue('wo-3');

      // Should not dequeue since at capacity
      const result = queue.dequeue();
      expect(result).toBeNull();
    });

    it('should return next work order when capacity available', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');

      const result = queue.dequeue();

      expect(result).toBe('wo-1');
      expect(queue.isRunning('wo-1')).toBe(true);
      expect(queue.isEnqueued('wo-1')).toBe(false);
    });

    it('should dequeue in priority order', () => {
      queue.enqueue('wo-low', { priority: 0 });
      queue.enqueue('wo-high', { priority: 10 });

      const result = queue.dequeue();

      expect(result).toBe('wo-high');
    });
  });

  describe('peek', () => {
    it('should return null when queue is empty', () => {
      expect(queue.peek()).toBeNull();
    });

    it('should return next work order without removing it', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');

      const peeked = queue.peek();
      const stillThere = queue.peek();

      expect(peeked).toBe('wo-1');
      expect(stillThere).toBe('wo-1');
      expect(queue.isEnqueued('wo-1')).toBe(true);
    });
  });

  describe('getPosition', () => {
    it('should return null for unknown work order', () => {
      const position = queue.getPosition('unknown');
      expect(position).toBeNull();
    });

    it('should return running state for running work orders', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      const position = queue.getPosition('wo-1');

      expect(position).not.toBeNull();
      expect(position!.state).toBe('running');
      expect(position!.position).toBe(0);
    });

    it('should return waiting state for queued work orders', () => {
      queue.enqueue('wo-1');

      const position = queue.getPosition('wo-1');

      expect(position).not.toBeNull();
      expect(position!.state).toBe('waiting');
      expect(position!.position).toBe(1);
    });
  });

  describe('markStarted', () => {
    it('should move work order from queue to running', () => {
      queue.enqueue('wo-1');

      expect(queue.isEnqueued('wo-1')).toBe(true);
      expect(queue.isRunning('wo-1')).toBe(false);

      queue.markStarted('wo-1');

      expect(queue.isEnqueued('wo-1')).toBe(false);
      expect(queue.isRunning('wo-1')).toBe(true);
    });

    it('should update positions of remaining work orders', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.enqueue('wo-3');

      queue.markStarted('wo-1');

      const pos2 = queue.getPosition('wo-2');
      const pos3 = queue.getPosition('wo-3');

      expect(pos2!.position).toBe(1);
      expect(pos3!.position).toBe(2);
    });
  });

  describe('markCompleted', () => {
    it('should remove work order from running', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      expect(queue.isRunning('wo-1')).toBe(true);

      queue.markCompleted('wo-1');

      expect(queue.isRunning('wo-1')).toBe(false);
    });

    it('should emit ready event for next work order', async () => {
      const readyHandler = vi.fn();
      queue.on('ready', readyHandler);

      // Fill capacity
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.enqueue('wo-3');

      queue.markStarted('wo-1');
      queue.markStarted('wo-2');

      // Complete one to make room
      queue.markCompleted('wo-1');

      expect(readyHandler).toHaveBeenCalledWith('wo-3');
    });
  });

  describe('cancel', () => {
    it('should remove work order from queue', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.enqueue('wo-3');

      const result = queue.cancel('wo-2');

      expect(result).toBe(true);
      expect(queue.getPosition('wo-2')).toBeNull();
      expect(queue.getPosition('wo-1')!.position).toBe(1);
      expect(queue.getPosition('wo-3')!.position).toBe(2);
    });

    it('should return false for non-existent work order', () => {
      const result = queue.cancel('unknown');
      expect(result).toBe(false);
    });

    it('should not remove running work orders', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      const result = queue.cancel('wo-1');

      expect(result).toBe(false);
      expect(queue.isRunning('wo-1')).toBe(true);
    });
  });

  describe('cancelRunning (v0.2.23)', () => {
    it('should cancel and abort a running work order', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      expect(queue.isRunning('wo-1')).toBe(true);

      const result = queue.cancelRunning('wo-1');

      expect(result).toBe(true);
      expect(queue.isRunning('wo-1')).toBe(false);
    });

    it('should return false for non-running work order', () => {
      queue.enqueue('wo-1');

      const result = queue.cancelRunning('wo-1');

      expect(result).toBe(false);
      expect(queue.isEnqueued('wo-1')).toBe(true);
    });

    it('should return false for unknown work order', () => {
      const result = queue.cancelRunning('unknown');
      expect(result).toBe(false);
    });

    it('should abort the registered AbortController', () => {
      queue.enqueue('wo-1');

      const abortController = new AbortController();
      queue.markStarted('wo-1', abortController);

      expect(abortController.signal.aborted).toBe(false);

      queue.cancelRunning('wo-1');

      expect(abortController.signal.aborted).toBe(true);
    });

    it('should emit canceled event when canceling running work order', () => {
      const canceledHandler = vi.fn();
      queue.on('canceled', canceledHandler);

      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.cancelRunning('wo-1');

      expect(canceledHandler).toHaveBeenCalledWith('wo-1');
    });

    it('should emit stateChange event when canceling running work order', () => {
      const stateChangeHandler = vi.fn();
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      queue.on('stateChange', stateChangeHandler);
      queue.cancelRunning('wo-1');

      expect(stateChangeHandler).toHaveBeenCalled();
      const stats = stateChangeHandler.mock.calls[0]![0];
      expect(stats.running).toBe(0);
    });

    it('should process queue after canceling running work order', () => {
      const readyHandler = vi.fn();
      queue.on('ready', readyHandler);

      // Fill capacity
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-2');
      queue.enqueue('wo-3'); // This will emit ready

      readyHandler.mockClear();

      // Cancel one running work order
      queue.cancelRunning('wo-1');

      // Should emit ready for wo-3
      expect(readyHandler).toHaveBeenCalledWith('wo-3');
    });
  });

  describe('registerAbortController (v0.2.23)', () => {
    it('should register AbortController for running work order', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      const abortController = new AbortController();
      const result = queue.registerAbortController('wo-1', abortController);

      expect(result).toBe(true);
    });

    it('should return false for non-running work order', () => {
      queue.enqueue('wo-1');

      const abortController = new AbortController();
      const result = queue.registerAbortController('wo-1', abortController);

      expect(result).toBe(false);
    });

    it('should replace existing AbortController', () => {
      queue.enqueue('wo-1');
      const originalController = new AbortController();
      queue.markStarted('wo-1', originalController);

      const newController = new AbortController();
      queue.registerAbortController('wo-1', newController);

      // Cancel should abort the new controller, not the original
      queue.cancelRunning('wo-1');

      expect(newController.signal.aborted).toBe(true);
      expect(originalController.signal.aborted).toBe(false);
    });
  });

  describe('getAbortSignal (v0.2.23)', () => {
    it('should return AbortSignal for running work order', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      const signal = queue.getAbortSignal('wo-1');

      expect(signal).not.toBeNull();
      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it('should return null for non-running work order', () => {
      queue.enqueue('wo-1');

      const signal = queue.getAbortSignal('wo-1');

      expect(signal).toBeNull();
    });

    it('should return null for unknown work order', () => {
      const signal = queue.getAbortSignal('unknown');
      expect(signal).toBeNull();
    });

    it('should return signal from registered AbortController', () => {
      queue.enqueue('wo-1');
      const abortController = new AbortController();
      queue.markStarted('wo-1', abortController);

      const signal = queue.getAbortSignal('wo-1');

      expect(signal).toBe(abortController.signal);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');
      queue.enqueue('wo-3');
      queue.markStarted('wo-1');

      const stats = queue.getStats();

      expect(stats.waiting).toBe(2);
      expect(stats.running).toBe(1);
      expect(stats.maxConcurrent).toBe(2);
      expect(stats.maxQueueSize).toBe(10);
      expect(stats.accepting).toBe(true);
    });

    it('should indicate not accepting when full', () => {
      const smallQueue = createQueueManager({ maxConcurrent: 1, maxQueueSize: 2 });
      smallQueue.enqueue('wo-1');
      smallQueue.enqueue('wo-2');

      const stats = smallQueue.getStats();

      expect(stats.accepting).toBe(false);
    });
  });

  describe('canStartImmediately', () => {
    it('should return true when below capacity', () => {
      expect(queue.canStartImmediately()).toBe(true);

      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      expect(queue.canStartImmediately()).toBe(true);
    });

    it('should return false when at capacity', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-2');

      expect(queue.canStartImmediately()).toBe(false);
    });
  });

  describe('getNextToStart', () => {
    it('should return null when queue is empty', () => {
      expect(queue.getNextToStart()).toBeNull();
    });

    it('should return null when at capacity', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-2');
      queue.enqueue('wo-3');

      expect(queue.getNextToStart()).toBeNull();
    });

    it('should return next work order when capacity available', () => {
      queue.enqueue('wo-1');
      queue.enqueue('wo-2');

      expect(queue.getNextToStart()).toBe('wo-1');
    });
  });

  describe('timeout handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should emit timeout event when maxWaitMs exceeded', async () => {
      const timeoutHandler = vi.fn();
      queue.on('timeout', timeoutHandler);

      // Fill capacity
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-2');

      // Add with short timeout
      queue.enqueue('wo-3', { maxWaitMs: 1000 });

      // Advance time past timeout
      vi.advanceTimersByTime(1500);

      // Complete one to trigger queue processing
      queue.markCompleted('wo-1');

      expect(timeoutHandler).toHaveBeenCalledWith('wo-3');
    });
  });

  describe('event emission', () => {
    it('should emit stateChange on enqueue', () => {
      const handler = vi.fn();
      queue.on('stateChange', handler);

      queue.enqueue('wo-1');

      expect(handler).toHaveBeenCalled();
      const stats = handler.mock.calls[0]![0];
      expect(stats.waiting).toBe(1);
    });

    it('should emit stateChange on markCompleted', () => {
      const handler = vi.fn();
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');

      queue.on('stateChange', handler);
      queue.markCompleted('wo-1');

      expect(handler).toHaveBeenCalled();
    });

    it('should emit ready when capacity becomes available', () => {
      const readyHandler = vi.fn();
      queue.on('ready', readyHandler);

      // First two should trigger ready immediately
      queue.enqueue('wo-1');
      expect(readyHandler).toHaveBeenCalledWith('wo-1');

      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      expect(readyHandler).toHaveBeenCalledWith('wo-2');
    });
  });

  describe('wait time estimation', () => {
    it('should return 0 when can start immediately with no history', () => {
      queue.enqueue('wo-1');
      const position = queue.getPosition('wo-1');

      // First in queue and capacity available, so can start immediately
      // Even with no history, estimatedWaitMs should be 0 when position is ahead=0
      expect(position!.estimatedWaitMs).toBe(0);
    });

    it('should return null when waiting with no history', () => {
      // Fill capacity
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.enqueue('wo-2');
      queue.markStarted('wo-2');

      // Now add one that must wait
      queue.enqueue('wo-3');
      const position = queue.getPosition('wo-3');

      // At capacity, must wait, but no history to estimate from
      expect(position!.estimatedWaitMs).toBeNull();
    });

    it('should return 0 when can start immediately with history', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1');
      queue.markCompleted('wo-1');

      // Now we have history
      queue.enqueue('wo-2');
      const position = queue.getPosition('wo-2');

      // Can start immediately, so estimate should be 0
      expect(position!.estimatedWaitMs).toBe(0);
    });
  });
});

describe('persistence', () => {
  let persistDir: string;
  let queue: QueueManager;

  beforeEach(async () => {
    persistDir = join(tmpdir(), `queue-test-${Date.now()}`);
    await fs.mkdir(persistDir, { recursive: true });
  });

  afterEach(async () => {
    if (queue) {
      await queue.shutdown();
    }
    try {
      await fs.rm(persistDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should persist queue state to disk', async () => {
    queue = createQueueManager({
      maxConcurrent: 2,
      maxQueueSize: 10,
      persistDir,
      persistIntervalMs: 0, // Disable auto-persist
    });

    queue.enqueue('wo-1', { priority: 5 });
    queue.enqueue('wo-2', { priority: 10 });

    await queue.persist();

    const statePath = join(persistDir, 'queue-state.json');
    const content = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(content);

    expect(state.version).toBe('1.0');
    expect(state.queue).toHaveLength(2);
    expect(state.queue[0].workOrderId).toBe('wo-2'); // Higher priority first
    expect(state.queue[1].workOrderId).toBe('wo-1');
  });

  it('should restore queue state from disk', async () => {
    // Create and persist initial queue
    const queue1 = createQueueManager({
      maxConcurrent: 2,
      maxQueueSize: 10,
      persistDir,
      persistIntervalMs: 0,
    });

    queue1.enqueue('wo-1', { priority: 5 });
    queue1.enqueue('wo-2', { priority: 10 });
    await queue1.persist();
    await queue1.shutdown();

    // Create new queue and restore
    queue = createQueueManager({
      maxConcurrent: 2,
      maxQueueSize: 10,
      persistDir,
      persistIntervalMs: 0,
    });

    const restored = await queue.restore();

    expect(restored).toBe(true);

    const stats = queue.getStats();
    expect(stats.waiting).toBe(2);

    // Should maintain priority order
    expect(queue.peek()).toBe('wo-2'); // Higher priority
  });

  it('should return false when no state file exists', async () => {
    queue = createQueueManager({
      maxConcurrent: 2,
      maxQueueSize: 10,
      persistDir,
      persistIntervalMs: 0,
    });

    const restored = await queue.restore();

    expect(restored).toBe(false);
  });
});

describe('getQueueManager singleton', () => {
  beforeEach(() => {
    resetQueueManager();
  });

  afterEach(() => {
    resetQueueManager();
  });

  it('should return same instance on multiple calls', () => {
    const queue1 = getQueueManager({ maxConcurrent: 5 });
    const queue2 = getQueueManager({ maxConcurrent: 10 }); // Config ignored

    expect(queue1).toBe(queue2);
  });

  it('should use config from first call', () => {
    const queue = getQueueManager({ maxConcurrent: 5 });
    const stats = queue.getStats();

    expect(stats.maxConcurrent).toBe(5);
  });
});

/**
 * Tests for run-level timeout enforcement (v0.2.23 - Wave 1.4)
 */
describe('run timeout enforcement', () => {
  let queue: QueueManager;

  beforeEach(() => {
    resetQueueManager();
    // Disable the periodic timeout check to control timing in tests
    queue = createQueueManager({ maxConcurrent: 2, maxQueueSize: 10, runTimeoutCheckIntervalMs: 0 });
  });

  afterEach(async () => {
    await queue.shutdown();
  });

  describe('markStarted with maxWallClockMs', () => {
    it('should track running work order with timeout', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1', 60000); // 60 second timeout

      expect(queue.isRunning('wo-1')).toBe(true);
      const info = queue.getRunningWorkOrderInfo('wo-1');
      expect(info).not.toBeNull();
      expect(info!.maxWallClockMs).toBe(60000);
      expect(info!.startedAt).toBeInstanceOf(Date);
      expect(info!.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('should track running work order without timeout', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1'); // No timeout

      expect(queue.isRunning('wo-1')).toBe(true);
      const info = queue.getRunningWorkOrderInfo('wo-1');
      expect(info).not.toBeNull();
      expect(info!.maxWallClockMs).toBeNull();
    });

    it('should clean up timeout tracking on markCompleted', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1', 60000);

      expect(queue.getRunningWorkOrderInfo('wo-1')).not.toBeNull();

      queue.markCompleted('wo-1');

      expect(queue.getRunningWorkOrderInfo('wo-1')).toBeNull();
    });
  });

  describe('getRunElapsedMs', () => {
    it('should return elapsed time for running work order', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1', 60000);

      const elapsed = queue.getRunElapsedMs('wo-1');
      expect(elapsed).not.toBeNull();
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-running work order', () => {
      expect(queue.getRunElapsedMs('wo-unknown')).toBeNull();
    });
  });

  describe('hasRunTimedOut', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return false when no timeout configured', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1'); // No timeout

      vi.advanceTimersByTime(100000); // Advance time significantly

      expect(queue.hasRunTimedOut('wo-1')).toBe(false);
    });

    it('should return false when within timeout', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1', 60000); // 60 second timeout

      vi.advanceTimersByTime(30000); // Advance 30 seconds

      expect(queue.hasRunTimedOut('wo-1')).toBe(false);
    });

    it('should return true when timeout exceeded', () => {
      queue.enqueue('wo-1');
      queue.markStarted('wo-1', 60000); // 60 second timeout

      vi.advanceTimersByTime(61000); // Advance past timeout

      expect(queue.hasRunTimedOut('wo-1')).toBe(true);
    });

    it('should return false for non-running work order', () => {
      expect(queue.hasRunTimedOut('wo-unknown')).toBe(false);
    });
  });

  describe('runTimeout event emission', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should emit runTimeout event when work order exceeds timeout', async () => {
      // Create queue with short check interval for testing
      const testQueue = createQueueManager({
        maxConcurrent: 2,
        maxQueueSize: 10,
        runTimeoutCheckIntervalMs: 1000, // Check every 1 second
      });

      const runTimeoutHandler = vi.fn();
      testQueue.on('runTimeout', runTimeoutHandler);

      testQueue.enqueue('wo-1');
      testQueue.markStarted('wo-1', 5000); // 5 second timeout

      // Advance time past the timeout and trigger the interval check
      vi.advanceTimersByTime(6000);

      expect(runTimeoutHandler).toHaveBeenCalledWith('wo-1', expect.any(Number), 5000);

      await testQueue.shutdown();
    });

    it('should not emit runTimeout for work orders without timeout', async () => {
      const testQueue = createQueueManager({
        maxConcurrent: 2,
        maxQueueSize: 10,
        runTimeoutCheckIntervalMs: 1000,
      });

      const runTimeoutHandler = vi.fn();
      testQueue.on('runTimeout', runTimeoutHandler);

      testQueue.enqueue('wo-1');
      testQueue.markStarted('wo-1'); // No timeout

      // Advance time significantly
      vi.advanceTimersByTime(100000);

      expect(runTimeoutHandler).not.toHaveBeenCalled();

      await testQueue.shutdown();
    });

    it('should emit runTimeout for multiple timed out work orders', async () => {
      const testQueue = createQueueManager({
        maxConcurrent: 5,
        maxQueueSize: 10,
        runTimeoutCheckIntervalMs: 1000,
      });

      const runTimeoutHandler = vi.fn();
      testQueue.on('runTimeout', runTimeoutHandler);

      testQueue.enqueue('wo-1');
      testQueue.markStarted('wo-1', 5000);
      testQueue.enqueue('wo-2');
      testQueue.markStarted('wo-2', 5000);
      testQueue.enqueue('wo-3');
      testQueue.markStarted('wo-3', 10000); // Longer timeout

      // Advance time past first two timeouts but not third
      vi.advanceTimersByTime(6000);

      expect(runTimeoutHandler).toHaveBeenCalledTimes(2);
      expect(runTimeoutHandler).toHaveBeenCalledWith('wo-1', expect.any(Number), 5000);
      expect(runTimeoutHandler).toHaveBeenCalledWith('wo-2', expect.any(Number), 5000);

      await testQueue.shutdown();
    });
  });
});
