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
