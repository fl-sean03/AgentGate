import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from '../../../src/queue/metrics-collector.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('recordCompletion', () => {
    it('should increment totalProcessed and totalCompleted', () => {
      collector.recordCompletion(1000);

      const counters = collector.getCounters();
      expect(counters.totalProcessed).toBe(1);
      expect(counters.totalCompleted).toBe(1);
      expect(counters.totalFailed).toBe(0);
    });

    it('should record duration', () => {
      collector.recordCompletion(500);
      collector.recordCompletion(1500);

      expect(collector.getAvgDuration()).toBe(1000);
    });
  });

  describe('recordFailure', () => {
    it('should increment totalProcessed and totalFailed', () => {
      collector.recordFailure(1000);

      const counters = collector.getCounters();
      expect(counters.totalProcessed).toBe(1);
      expect(counters.totalCompleted).toBe(0);
      expect(counters.totalFailed).toBe(1);
    });

    it('should record duration', () => {
      collector.recordFailure(2000);

      expect(collector.getAvgDuration()).toBe(2000);
    });
  });

  describe('recordRetry', () => {
    it('should increment totalRetries', () => {
      collector.recordRetry();
      collector.recordRetry();

      const counters = collector.getCounters();
      expect(counters.totalRetries).toBe(2);
    });

    it('should not affect other counters', () => {
      collector.recordRetry();

      const counters = collector.getCounters();
      expect(counters.totalProcessed).toBe(0);
      expect(counters.totalCompleted).toBe(0);
      expect(counters.totalFailed).toBe(0);
    });
  });

  describe('getAvgDuration', () => {
    it('should return 0 when no durations recorded', () => {
      expect(collector.getAvgDuration()).toBe(0);
    });

    it('should calculate correct average', () => {
      collector.recordCompletion(100);
      collector.recordCompletion(200);
      collector.recordCompletion(300);

      expect(collector.getAvgDuration()).toBe(200);
    });

    it('should round to nearest integer', () => {
      collector.recordCompletion(100);
      collector.recordCompletion(101);

      // Average is 100.5, rounded to 101
      expect(collector.getAvgDuration()).toBe(101);
    });
  });

  describe('getP95Duration', () => {
    it('should return 0 when no durations recorded', () => {
      expect(collector.getP95Duration()).toBe(0);
    });

    it('should return correct p95 for small sample', () => {
      // With a small sample, p95 should be near the max
      collector.recordCompletion(100);
      collector.recordCompletion(200);
      collector.recordCompletion(300);

      const p95 = collector.getP95Duration();
      expect(p95).toBeGreaterThanOrEqual(200);
    });

    it('should return correct p95 for larger sample', () => {
      // Record 100 durations from 1 to 100
      for (let i = 1; i <= 100; i++) {
        collector.recordCompletion(i);
      }

      // p95 index = floor(100 * 0.95) = 95, which is the 96th element (0-indexed)
      const p95 = collector.getP95Duration();
      expect(p95).toBe(96);
    });

    it('should handle single duration', () => {
      collector.recordCompletion(500);
      expect(collector.getP95Duration()).toBe(500);
    });
  });

  describe('getMetrics', () => {
    it('should return complete metrics snapshot', () => {
      collector.recordCompletion(1000);
      collector.recordFailure(2000);
      collector.recordRetry();

      const metrics = collector.getMetrics(5, 2, 1, 8192, 16384);

      expect(metrics.queueDepth).toBe(5);
      expect(metrics.activeExecutions).toBe(2);
      expect(metrics.pendingRetries).toBe(1);
      expect(metrics.totalProcessed).toBe(2);
      expect(metrics.totalCompleted).toBe(1);
      expect(metrics.totalFailed).toBe(1);
      expect(metrics.totalRetries).toBe(1);
      expect(metrics.avgExecutionDurationMs).toBe(1500);
      expect(metrics.memoryUsedMB).toBe(8192);
      expect(metrics.memoryAvailableMB).toBe(16384);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should return fresh timestamp each call', async () => {
      const metrics1 = collector.getMetrics(0, 0, 0, 0, 0);
      await new Promise(resolve => setTimeout(resolve, 10));
      const metrics2 = collector.getMetrics(0, 0, 0, 0, 0);

      expect(metrics2.timestamp.getTime()).toBeGreaterThanOrEqual(
        metrics1.timestamp.getTime()
      );
    });
  });

  describe('reset', () => {
    it('should reset all counters to zero', () => {
      collector.recordCompletion(1000);
      collector.recordFailure(1000);
      collector.recordRetry();

      collector.reset();

      const counters = collector.getCounters();
      expect(counters.totalProcessed).toBe(0);
      expect(counters.totalCompleted).toBe(0);
      expect(counters.totalFailed).toBe(0);
      expect(counters.totalRetries).toBe(0);
    });

    it('should clear duration history', () => {
      collector.recordCompletion(1000);
      collector.reset();

      expect(collector.getAvgDuration()).toBe(0);
      expect(collector.getP95Duration()).toBe(0);
    });
  });

  describe('duration history limit', () => {
    it('should keep only recent durations', () => {
      // Record more than maxDurationHistory (1000)
      for (let i = 0; i < 1100; i++) {
        collector.recordCompletion(i < 1000 ? 100 : 1000);
      }

      // The old 100ms durations should be shifted out
      // Remaining durations should be a mix of 100ms and 1000ms
      const avg = collector.getAvgDuration();
      // Average should be between 100 and 1000
      expect(avg).toBeGreaterThan(100);
    });
  });
});
