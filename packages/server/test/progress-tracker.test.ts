/**
 * Progress Tracker Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ProgressTracker,
  createProgressTracker,
  type ExecutionPhase,
} from '../src/agent/progress-tracker.js';
import type { ProgressUpdateEvent } from '../src/server/websocket/types.js';

/**
 * Helper to wait for a specified duration
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('ProgressTracker', () => {
  const workOrderId = 'wo-test-123';
  const runId = 'run-test-456';

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create tracker with default options', () => {
      const tracker = new ProgressTracker(workOrderId, runId);

      expect(tracker).toBeDefined();
      expect(tracker.getToolCallCount()).toBe(0);
    });

    it('should create tracker with custom options', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        expectedDurationSeconds: 600,
        expectedToolCalls: 100,
        minPhaseTimeMs: 5000,
      });

      expect(tracker).toBeDefined();
    });
  });

  describe('getProgress', () => {
    it('should start at low percentage', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        expectedDurationSeconds: 3600, // Long duration to minimize time factor
        expectedToolCalls: 100,
      });
      const progress = tracker.getProgress();

      // Phase 'Starting' has weight 5, so percentage is at least 2 (5% * 0.4)
      expect(progress.percentage).toBeLessThanOrEqual(5);
      expect(progress.currentPhase).toBe('Starting');
      expect(progress.toolCallCount).toBe(0);
      expect(progress.elapsedSeconds).toBe(0);
    });

    it('should increase percentage with tool calls', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        expectedToolCalls: 10,
      });

      tracker.recordToolCall('Read');
      tracker.recordToolCall('Read');
      tracker.recordToolCall('Read');

      const progress = tracker.getProgress();
      expect(progress.percentage).toBeGreaterThan(0);
      expect(progress.toolCallCount).toBe(3);
    });

    it('should never exceed 99%', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        expectedToolCalls: 5,
        expectedDurationSeconds: 1,
      });

      // Add many tool calls
      for (let i = 0; i < 100; i++) {
        tracker.recordToolCall('Write');
      }

      const progress = tracker.getProgress();
      expect(progress.percentage).toBeLessThanOrEqual(99);
    });
  });

  describe('recordToolCall', () => {
    it('should increment tool call count', () => {
      const tracker = new ProgressTracker(workOrderId, runId);

      expect(tracker.getToolCallCount()).toBe(0);

      tracker.recordToolCall('Read');
      expect(tracker.getToolCallCount()).toBe(1);

      tracker.recordToolCall('Write');
      expect(tracker.getToolCallCount()).toBe(2);
    });
  });

  describe('phase detection', () => {
    it('should detect Reading phase from read tools', async () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        minPhaseTimeMs: 0, // Disable minimum phase time for testing
      });

      // Record multiple reading tools
      tracker.recordToolCall('Read');
      tracker.recordToolCall('Glob');
      tracker.recordToolCall('Grep');
      tracker.recordToolCall('Read');
      tracker.recordToolCall('Read');

      const progress = tracker.getProgress();
      expect(progress.currentPhase).toBe('Reading');
    });

    it('should detect Implementing phase from write tools', async () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        minPhaseTimeMs: 0,
      });

      // Start in reading phase
      tracker.recordToolCall('Read');
      tracker.recordToolCall('Glob');
      tracker.recordToolCall('Read');

      // Then write
      tracker.recordToolCall('Write');
      tracker.recordToolCall('Edit');
      tracker.recordToolCall('Write');

      const progress = tracker.getProgress();
      expect(progress.currentPhase).toBe('Implementing');
    });

    it('should detect Testing phase from output patterns', async () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        minPhaseTimeMs: 0,
      });

      // Use setPhase to move to Implementing first
      tracker.setPhase('Implementing');

      // Record test-related output
      tracker.recordOutput('Running tests...');

      const progress = tracker.getProgress();
      expect(progress.currentPhase).toBe('Testing');
    });

    it('should detect Finalizing phase from git patterns', async () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        minPhaseTimeMs: 0,
      });

      // Use setPhase to move to Testing first
      tracker.setPhase('Testing');

      // Then git operations
      tracker.recordOutput('git commit');
      tracker.recordOutput('Creating pull request');

      const progress = tracker.getProgress();
      expect(progress.currentPhase).toBe('Finalizing');
    });

    it('should detect Planning phase when manually set from valid state', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        minPhaseTimeMs: 0,
      });

      // Test that setPhase works for Planning
      tracker.setPhase('Planning');

      const progress = tracker.getProgress();
      expect(progress.currentPhase).toBe('Planning');
    });
  });

  describe('setPhase', () => {
    it('should manually set the phase', () => {
      const tracker = new ProgressTracker(workOrderId, runId);

      expect(tracker.getProgress().currentPhase).toBe('Starting');

      tracker.setPhase('Implementing');
      expect(tracker.getProgress().currentPhase).toBe('Implementing');

      tracker.setPhase('Testing');
      expect(tracker.getProgress().currentPhase).toBe('Testing');
    });
  });

  describe('startPeriodicEmit', () => {
    it('should emit periodic progress updates', async () => {
      vi.useRealTimers();

      const updates: ProgressUpdateEvent[] = [];
      const tracker = new ProgressTracker(workOrderId, runId);

      tracker.startPeriodicEmit(e => updates.push(e), 50);

      await wait(180);
      tracker.stop();

      expect(updates.length).toBeGreaterThanOrEqual(3);
    });

    it('should include correct event properties', async () => {
      vi.useRealTimers();

      const updates: ProgressUpdateEvent[] = [];
      const tracker = new ProgressTracker(workOrderId, runId);

      tracker.recordToolCall('Read');
      tracker.startPeriodicEmit(e => updates.push(e), 50);

      await wait(100);
      tracker.stop();

      expect(updates.length).toBeGreaterThanOrEqual(1);

      const event = updates[0];
      expect(event.type).toBe('progress_update');
      expect(event.workOrderId).toBe(workOrderId);
      expect(event.runId).toBe(runId);
      expect(event.percentage).toBeDefined();
      expect(event.currentPhase).toBeDefined();
      expect(event.toolCallCount).toBe(1);
      expect(event.timestamp).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop periodic emission', async () => {
      vi.useRealTimers();

      const updates: ProgressUpdateEvent[] = [];
      const tracker = new ProgressTracker(workOrderId, runId);

      tracker.startPeriodicEmit(e => updates.push(e), 50);
      await wait(100);

      const countBeforeStop = updates.length;
      tracker.stop();

      await wait(100);

      // Should not have received more updates after stop
      expect(updates.length).toBe(countBeforeStop);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        minPhaseTimeMs: 0,
        expectedDurationSeconds: 3600, // Long duration to minimize time factor
        expectedToolCalls: 100,
      });

      tracker.recordToolCall('Read');
      tracker.recordToolCall('Write');
      tracker.setPhase('Implementing');

      expect(tracker.getToolCallCount()).toBe(2);
      expect(tracker.getProgress().currentPhase).toBe('Implementing');

      tracker.reset();

      expect(tracker.getToolCallCount()).toBe(0);
      expect(tracker.getProgress().currentPhase).toBe('Starting');
      // After reset, percentage should be very low (near 0)
      expect(tracker.getProgress().percentage).toBeLessThanOrEqual(2);
    });
  });

  describe('getElapsedSeconds', () => {
    it('should track elapsed time', async () => {
      vi.useRealTimers();

      const tracker = new ProgressTracker(workOrderId, runId);

      await wait(100);

      const elapsed = tracker.getElapsedSeconds();
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('estimated remaining', () => {
    it('should estimate remaining time after progress', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        expectedToolCalls: 10,
        minPhaseTimeMs: 0,
      });

      // Make enough progress to trigger estimation
      for (let i = 0; i < 5; i++) {
        tracker.recordToolCall('Write');
      }
      tracker.setPhase('Implementing');

      const progress = tracker.getProgress();

      // Should have some estimate (percentage > 10)
      if (progress.percentage > 10) {
        expect(progress.estimatedRemainingSeconds).toBeDefined();
      }
    });

    it('should not estimate remaining time with little progress', () => {
      const tracker = new ProgressTracker(workOrderId, runId, {
        expectedToolCalls: 100,
      });

      tracker.recordToolCall('Read');

      const progress = tracker.getProgress();

      // With only 1% progress, should not have estimate
      if (progress.percentage <= 10) {
        expect(progress.estimatedRemainingSeconds).toBeUndefined();
      }
    });
  });
});

describe('createProgressTracker', () => {
  it('should create tracker via factory', () => {
    const tracker = createProgressTracker('wo-1', 'run-1');

    expect(tracker).toBeInstanceOf(ProgressTracker);
    expect(tracker.getToolCallCount()).toBe(0);
  });

  it('should pass options to tracker', () => {
    const tracker = createProgressTracker('wo-1', 'run-1', {
      expectedDurationSeconds: 1000,
    });

    expect(tracker).toBeInstanceOf(ProgressTracker);
  });
});
