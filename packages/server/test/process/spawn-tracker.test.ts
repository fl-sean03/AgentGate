/**
 * Tests for Spawn Tracker.
 * (v0.2.27 - Thrust 9: Deadlock Detection for Spawning)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SpawnTracker, getSpawnTracker } from '../../src/process/spawn-tracker.js';

describe('SpawnTracker', () => {
  beforeEach(() => {
    SpawnTracker.resetInstance();
  });

  afterEach(() => {
    SpawnTracker.resetInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = SpawnTracker.getInstance();
      const instance2 = SpawnTracker.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('recordSpawn', () => {
    it('should record spawn event', () => {
      const tracker = SpawnTracker.getInstance();

      const result = tracker.recordSpawn(1, 2);

      expect(result).toBe(true);
      expect(tracker.getSpawnDepth(2)).toBe(1);
    });

    it('should track spawn chain', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordSpawn(1, 2);
      tracker.recordSpawn(2, 3);
      tracker.recordSpawn(3, 4);

      expect(tracker.getSpawnDepth(4)).toBe(3);
    });

    it('should reject exceeding max depth', () => {
      const tracker = SpawnTracker.getInstance({ maxSpawnDepth: 3 });

      tracker.recordSpawn(1, 2);
      tracker.recordSpawn(2, 3);
      tracker.recordSpawn(3, 4);
      const result = tracker.recordSpawn(4, 5);

      expect(result).toBe(false);
    });

    it('should detect circular spawn', () => {
      const tracker = SpawnTracker.getInstance({ detectCircular: true });

      tracker.recordSpawn(1, 2);
      tracker.recordSpawn(2, 3);
      const result = tracker.recordSpawn(3, 1);

      expect(result).toBe(false);
    });
  });

  describe('getParentChain', () => {
    it('should return parent chain', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordSpawn(1, 2);
      tracker.recordSpawn(2, 3);
      tracker.recordSpawn(3, 4);

      const chain = tracker.getParentChain(4);
      expect(chain).toEqual([3, 2, 1]);
    });

    it('should return empty for root process', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordSpawn(1, 2);

      expect(tracker.getParentChain(1)).toEqual([]);
    });
  });

  describe('recordExit', () => {
    it('should clean up on exit', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordSpawn(1, 2);
      tracker.recordHold(2, 'resource-a');
      tracker.recordWait(1, 'resource-a');

      tracker.recordExit(2);

      expect(tracker.getStats().trackedProcesses).toBe(0);
    });
  });

  describe('resource waiting', () => {
    it('should track waiting for resource', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordWait(1, 'resource-a');

      expect(tracker.getStats().waitingProcesses).toBe(1);
    });

    it('should track holding resource', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordHold(1, 'resource-a');

      expect(tracker.getStats().heldResources).toBe(1);
    });

    it('should clear wait', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordWait(1, 'resource-a');
      tracker.clearWait(1);

      expect(tracker.getStats().waitingProcesses).toBe(0);
    });

    it('should release resource', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordHold(1, 'resource-a');
      tracker.recordRelease(1, 'resource-a');

      expect(tracker.getStats().heldResources).toBe(0);
    });
  });

  describe('detectDeadlock', () => {
    it('should detect no deadlock when none exists', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordHold(1, 'resource-a');
      tracker.recordWait(2, 'resource-a');

      const result = tracker.detectDeadlock();
      expect(result.hasDeadlock).toBe(false);
    });

    it('should detect simple deadlock', () => {
      const tracker = SpawnTracker.getInstance();

      // Process 1 holds A, waits for B
      // Process 2 holds B, waits for A
      tracker.recordHold(1, 'resource-a');
      tracker.recordHold(2, 'resource-b');
      tracker.recordWait(1, 'resource-b');
      tracker.recordWait(2, 'resource-a');

      const result = tracker.detectDeadlock();
      expect(result.hasDeadlock).toBe(true);
      expect(result.cycle.length).toBeGreaterThan(0);
    });

    it('should detect chain deadlock', () => {
      const tracker = SpawnTracker.getInstance();

      // 1 -> 2 -> 3 -> 1
      tracker.recordHold(1, 'a');
      tracker.recordHold(2, 'b');
      tracker.recordHold(3, 'c');
      tracker.recordWait(1, 'b');
      tracker.recordWait(2, 'c');
      tracker.recordWait(3, 'a');

      const result = tracker.detectDeadlock();
      expect(result.hasDeadlock).toBe(true);
    });
  });

  describe('spawn rate', () => {
    it('should enforce spawn rate limit', async () => {
      const tracker = SpawnTracker.getInstance({
        maxSpawnRatePerSecond: 5,
        rateWindowMs: 1000,
      });

      // Spawn quickly
      for (let i = 0; i < 10; i++) {
        tracker.recordSpawn(1, 100 + i);
      }

      const stats = tracker.getSpawnRateStats();
      expect(stats.isLimited).toBe(true);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordSpawn(1, 2);
      tracker.recordSpawn(2, 3);
      tracker.recordHold(1, 'resource');
      tracker.recordWait(3, 'resource');

      const stats = tracker.getStats();
      expect(stats.trackedProcesses).toBe(2);
      expect(stats.waitingProcesses).toBe(1);
      expect(stats.heldResources).toBe(1);
      expect(stats.maxDepth).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      const tracker = SpawnTracker.getInstance();

      tracker.recordSpawn(1, 2);
      tracker.recordHold(1, 'resource');
      tracker.recordWait(2, 'resource');

      tracker.clear();

      const stats = tracker.getStats();
      expect(stats.trackedProcesses).toBe(0);
      expect(stats.heldResources).toBe(0);
      expect(stats.waitingProcesses).toBe(0);
    });
  });
});

describe('getSpawnTracker', () => {
  beforeEach(() => {
    SpawnTracker.resetInstance();
  });

  it('should return singleton', () => {
    const tracker1 = getSpawnTracker();
    const tracker2 = getSpawnTracker();
    expect(tracker1).toBe(tracker2);
  });
});
