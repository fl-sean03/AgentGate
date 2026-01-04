/**
 * Tests for Resource Enforcer.
 * (v0.2.27 - Thrust 10: Resource Limit Enforcement)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ResourceEnforcer,
  createResourceEnforcer,
  RESOURCE_PRESETS,
} from '../../src/process/resource-enforcer.js';
import { ErrorCode } from '../../src/errors/types.js';

describe('ResourceEnforcer', () => {
  describe('constructor', () => {
    it('should create with default limits', () => {
      const enforcer = new ResourceEnforcer();
      const limits = enforcer.getLimits();

      expect(limits.maxMemoryBytes).toBe(0);
      expect(limits.maxCpuPercent).toBe(0);
    });

    it('should accept custom limits', () => {
      const enforcer = new ResourceEnforcer({
        maxMemoryBytes: 1024 * 1024 * 1024,
        maxCpuPercent: 80,
      });

      const limits = enforcer.getLimits();
      expect(limits.maxMemoryBytes).toBe(1024 * 1024 * 1024);
      expect(limits.maxCpuPercent).toBe(80);
    });
  });

  describe('checkAndEnforce', () => {
    it('should pass when within limits', () => {
      const enforcer = new ResourceEnforcer({
        maxMemoryBytes: 1000,
        maxCpuPercent: 100,
      });

      const result = enforcer.checkAndEnforce({
        memoryBytes: 500,
        cpuPercent: 50,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result.exceeded).toBe(false);
      expect(result.violations).toHaveLength(0);
    });

    it('should warn at 80%', () => {
      const enforcer = new ResourceEnforcer(
        { maxMemoryBytes: 1000 },
        { warningThresholdPercent: 80 }
      );

      const result = enforcer.checkAndEnforce({
        memoryBytes: 850,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result.actions.some(a => a.action === 'warn')).toBe(true);
    });

    it('should throttle at 90%', () => {
      const enforcer = new ResourceEnforcer(
        { maxMemoryBytes: 1000 },
        { throttleThresholdPercent: 90 }
      );

      const result = enforcer.checkAndEnforce({
        memoryBytes: 950,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result.exceeded).toBe(true);
      expect(result.actions.some(a => a.action === 'throttle')).toBe(true);
    });

    it('should terminate at 100%', () => {
      const enforcer = new ResourceEnforcer({
        maxMemoryBytes: 1000,
      });

      const result = enforcer.checkAndEnforce({
        memoryBytes: 1100,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result.exceeded).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.actions.some(a => a.action === 'terminate')).toBe(true);
    });

    it('should detect multiple violations', () => {
      const enforcer = new ResourceEnforcer({
        maxMemoryBytes: 1000,
        maxCpuPercent: 80,
      });

      const result = enforcer.checkAndEnforce({
        memoryBytes: 1100,
        cpuPercent: 90,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result.violations).toHaveLength(2);
    });

    it('should skip unlimited resources', () => {
      const enforcer = new ResourceEnforcer({
        maxMemoryBytes: 0, // Unlimited
      });

      const result = enforcer.checkAndEnforce({
        memoryBytes: 1000000000,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result.exceeded).toBe(false);
    });
  });

  describe('callbacks', () => {
    it('should call onViolation callback', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });
      const onViolation = vi.fn();
      enforcer.onViolationCallback(onViolation);

      enforcer.checkAndEnforce({
        memoryBytes: 1100,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(onViolation).toHaveBeenCalled();
    });

    it('should call onTerminate callback', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });
      const onTerminate = vi.fn();
      enforcer.onTerminateCallback(onTerminate);

      enforcer.checkAndEnforce({
        memoryBytes: 1100,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(onTerminate).toHaveBeenCalled();
    });
  });

  describe('updateLimits', () => {
    it('should update limits', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      enforcer.updateLimits({ maxMemoryBytes: 2000 });

      expect(enforcer.getLimits().maxMemoryBytes).toBe(2000);
    });
  });

  describe('history and stats', () => {
    it('should track usage history', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      enforcer.checkAndEnforce({
        memoryBytes: 500,
        cpuPercent: 50,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(enforcer.getUsageHistory()).toHaveLength(1);
    });

    it('should calculate average usage', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      enforcer.checkAndEnforce({
        memoryBytes: 100,
        cpuPercent: 20,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      enforcer.checkAndEnforce({
        memoryBytes: 200,
        cpuPercent: 40,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      const avg = enforcer.getAverageUsage();
      expect(avg?.memoryBytes).toBe(150);
      expect(avg?.cpuPercent).toBe(30);
    });

    it('should track peak usage', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      enforcer.checkAndEnforce({
        memoryBytes: 100,
        cpuPercent: 50,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      enforcer.checkAndEnforce({
        memoryBytes: 500,
        cpuPercent: 20,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      const peak = enforcer.getPeakUsage();
      expect(peak?.memoryBytes).toBe(500);
      expect(peak?.cpuPercent).toBe(50);
    });

    it('should track violations', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      enforcer.checkAndEnforce({
        memoryBytes: 1100,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(enforcer.getViolations()).toHaveLength(1);
    });
  });

  describe('isWithinLimits', () => {
    it('should return true when within limits', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      const result = enforcer.isWithinLimits({
        memoryBytes: 500,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result).toBe(true);
    });

    it('should return false when exceeded', () => {
      const enforcer = new ResourceEnforcer({ maxMemoryBytes: 1000 });

      const result = enforcer.isWithinLimits({
        memoryBytes: 1100,
        cpuPercent: 0,
        diskBytes: 0,
        openFiles: 0,
        processes: 0,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });

      expect(result).toBe(false);
    });
  });

  describe('createViolationError', () => {
    it('should create memory error', () => {
      const error = ResourceEnforcer.createViolationError({
        resource: 'maxMemoryBytes',
        current: 1100,
        limit: 1000,
        overagePercent: 10,
        timestamp: Date.now(),
      });

      expect(error.code).toBe(ErrorCode.MEMORY_LIMIT_EXCEEDED);
    });

    it('should create CPU error', () => {
      const error = ResourceEnforcer.createViolationError({
        resource: 'maxCpuPercent',
        current: 110,
        limit: 100,
        overagePercent: 10,
        timestamp: Date.now(),
      });

      expect(error.code).toBe(ErrorCode.CPU_LIMIT_EXCEEDED);
    });

    it('should create disk error', () => {
      const error = ResourceEnforcer.createViolationError({
        resource: 'maxDiskBytes',
        current: 1100,
        limit: 1000,
        overagePercent: 10,
        timestamp: Date.now(),
      });

      expect(error.code).toBe(ErrorCode.DISK_LIMIT_EXCEEDED);
    });

    it('should create timeout error', () => {
      const error = ResourceEnforcer.createViolationError({
        resource: 'maxExecutionTimeMs',
        current: 1100,
        limit: 1000,
        overagePercent: 10,
        timestamp: Date.now(),
      });

      expect(error.code).toBe(ErrorCode.EXECUTION_TIMEOUT);
    });
  });

  describe('execution time', () => {
    it('should track execution time', async () => {
      const enforcer = new ResourceEnforcer();

      await new Promise(r => setTimeout(r, 50));

      const time = enforcer.getExecutionTime();
      expect(time).toBeGreaterThanOrEqual(45);
    });
  });
});

describe('createResourceEnforcer', () => {
  it('should create enforcer', () => {
    const enforcer = createResourceEnforcer({ maxMemoryBytes: 1000 });
    expect(enforcer).toBeInstanceOf(ResourceEnforcer);
  });
});

describe('RESOURCE_PRESETS', () => {
  it('should have light preset', () => {
    expect(RESOURCE_PRESETS.light.maxMemoryBytes).toBe(256 * 1024 * 1024);
  });

  it('should have medium preset', () => {
    expect(RESOURCE_PRESETS.medium.maxMemoryBytes).toBe(1024 * 1024 * 1024);
  });

  it('should have heavy preset', () => {
    expect(RESOURCE_PRESETS.heavy.maxMemoryBytes).toBe(4 * 1024 * 1024 * 1024);
  });

  it('should have unlimited preset', () => {
    expect(Object.keys(RESOURCE_PRESETS.unlimited)).toHaveLength(0);
  });
});
