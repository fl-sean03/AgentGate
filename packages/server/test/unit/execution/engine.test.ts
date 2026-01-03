/**
 * Execution Engine Unit Tests
 * v0.2.26: Tests for the core ExecutionEngine
 *
 * These tests focus on:
 * - Engine factory and configuration
 * - Error types (ConcurrencyLimitError, RunNotFoundError)
 * - Engine methods (cancel, getStatus, getActiveCount)
 *
 * Full integration tests for execute() are in e2e tests since they
 * require proper state machine transitions through all phases.
 *
 * Note: The ExecutionEngine's execute() method requires full state machine
 * integration because:
 * 1. Engine transitions to BUILDING state before calling PhaseOrchestrator
 * 2. PhaseOrchestrator returns final events (VERIFY_PASSED, VERIFY_FAILED_RETRYABLE)
 * 3. State machine requires intermediate transitions (BUILD_COMPLETED, SNAPSHOT_COMPLETED)
 *
 * This is covered by:
 * - test/integration/orchestrator.test.ts - Full orchestrator integration
 * - test/e2e/github-e2e.test.ts - End-to-end with real GitHub
 * - test/state-machine-complete.test.ts - State machine transitions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createExecutionEngine,
  DefaultExecutionEngine,
  ConcurrencyLimitError,
  RunNotFoundError,
} from '../../../src/execution/engine.js';
import { createDefaultEngineConfig } from '../../../src/execution/context.js';

// Mock observability to avoid side effects
vi.mock('../../../src/observability/progress-emitter.js', () => ({
  getProgressEmitter: () => ({
    emitRunStarted: vi.fn(),
    emitIterationStarted: vi.fn(),
    emitIterationCompleted: vi.fn(),
    emitRunCompleted: vi.fn(),
    emitRunFailed: vi.fn(),
    emitRunCanceled: vi.fn(),
  }),
}));

vi.mock('../../../src/observability/metrics-collector.js', () => ({
  getMetricsCollector: () => ({
    incrementRunsStarted: vi.fn(),
    incrementRunsCompleted: vi.fn(),
    setActiveRuns: vi.fn(),
    recordRunDuration: vi.fn(),
  }),
}));

describe('ExecutionEngine', () => {
  let engine: DefaultExecutionEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new DefaultExecutionEngine({
      maxConcurrentRuns: 10,
      defaultTimeoutMs: 3600000,
      emitProgressEvents: true,
      collectMetrics: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createExecutionEngine factory', () => {
    it('should create an engine with default config', () => {
      const engine = createExecutionEngine();
      expect(engine).toBeDefined();
      expect(engine.getActiveCount()).toBe(0);
    });

    it('should create an engine with custom config', () => {
      const engine = createExecutionEngine({
        maxConcurrentRuns: 5,
        defaultTimeoutMs: 1800000,
      });
      expect(engine).toBeDefined();
      expect(engine.getActiveCount()).toBe(0);
    });

    it('should create a DefaultExecutionEngine instance', () => {
      const engine = createExecutionEngine();
      // Duck-type check for ExecutionEngine interface
      expect(typeof engine.execute).toBe('function');
      expect(typeof engine.cancel).toBe('function');
      expect(typeof engine.getStatus).toBe('function');
      expect(typeof engine.getActiveCount).toBe('function');
    });
  });

  describe('createDefaultEngineConfig', () => {
    it('should create config with sensible defaults', () => {
      const config = createDefaultEngineConfig();

      expect(config.defaultTimeoutMs).toBe(3600000); // 1 hour
      expect(config.maxConcurrentRuns).toBe(10);
      expect(config.emitProgressEvents).toBe(true);
      expect(config.collectMetrics).toBe(true);
    });

    it('should return a valid ExecutionEngineConfig object', () => {
      const config = createDefaultEngineConfig();

      expect(typeof config.defaultTimeoutMs).toBe('number');
      expect(typeof config.maxConcurrentRuns).toBe('number');
      expect(typeof config.emitProgressEvents).toBe('boolean');
      expect(typeof config.collectMetrics).toBe('boolean');
    });
  });

  describe('ConcurrencyLimitError', () => {
    it('should create error with correct message and limit', () => {
      const error = new ConcurrencyLimitError(5);

      expect(error.name).toBe('ConcurrencyLimitError');
      expect(error.message).toContain('5');
      expect(error instanceof Error).toBe(true);
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new ConcurrencyLimitError(1);
      }).toThrow(ConcurrencyLimitError);
    });

    it('should preserve stack trace', () => {
      const error = new ConcurrencyLimitError(10);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ConcurrencyLimitError');
    });
  });

  describe('RunNotFoundError', () => {
    it('should create error with correct message and run ID', () => {
      const runId = 'test-run-123';
      const error = new RunNotFoundError(runId);

      expect(error.name).toBe('RunNotFoundError');
      expect(error.message).toContain(runId);
      expect(error instanceof Error).toBe(true);
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new RunNotFoundError('unknown-id');
      }).toThrow(RunNotFoundError);
    });
  });

  describe('cancel', () => {
    it('should throw RunNotFoundError for unknown run', async () => {
      await expect(engine.cancel('unknown-run-id', 'test reason')).rejects.toThrow(
        RunNotFoundError
      );
    });

    it('should include run ID in error message', async () => {
      const runId = 'non-existent-run-123';
      try {
        await engine.cancel(runId, 'test');
        expect.fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).message).toContain(runId);
      }
    });
  });

  describe('getStatus', () => {
    it('should return null for unknown run', () => {
      const status = engine.getStatus('unknown-run-id');
      expect(status).toBeNull();
    });

    it('should return null for any random UUID', () => {
      const randomId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const status = engine.getStatus(randomId);
      expect(status).toBeNull();
    });
  });

  describe('getActiveCount', () => {
    it('should return 0 initially', () => {
      expect(engine.getActiveCount()).toBe(0);
    });

    it('should return 0 for new engine instances', () => {
      const engine1 = createExecutionEngine();
      const engine2 = createExecutionEngine();

      expect(engine1.getActiveCount()).toBe(0);
      expect(engine2.getActiveCount()).toBe(0);
    });
  });

  describe('DefaultExecutionEngine constructor', () => {
    it('should accept custom configuration', () => {
      const customConfig = {
        maxConcurrentRuns: 20,
        defaultTimeoutMs: 7200000, // 2 hours
        emitProgressEvents: false,
        collectMetrics: false,
      };

      const engine = new DefaultExecutionEngine(customConfig);
      expect(engine).toBeDefined();
      expect(engine.getActiveCount()).toBe(0);
    });

    it('should work with minimal configuration', () => {
      const minimalConfig = {
        maxConcurrentRuns: 1,
        defaultTimeoutMs: 1000,
        emitProgressEvents: false,
        collectMetrics: false,
      };

      const engine = new DefaultExecutionEngine(minimalConfig);
      expect(engine).toBeDefined();
    });
  });
});
