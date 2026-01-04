/**
 * Tests for Gate Result Aggregator.
 * (v0.2.27 - Thrust 14: Custom Gate Type Support)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GateResultAggregator,
  createGateResultAggregator,
  createGateResult,
  type GateResult,
} from '../../src/gate/aggregator.js';

describe('GateResultAggregator', () => {
  let aggregator: GateResultAggregator;

  beforeEach(() => {
    aggregator = new GateResultAggregator();
  });

  describe('addResult', () => {
    it('should add a result', () => {
      const result = createGateResult({
        gateId: 'test-gate',
        type: 'verification-levels',
        passed: true,
        durationMs: 100,
      });

      aggregator.addResult(result);

      expect(aggregator.getResults()).toHaveLength(1);
    });
  });

  describe('addResults', () => {
    it('should add multiple results', () => {
      const results = [
        createGateResult({ gateId: 'gate1', type: 'test', passed: true, durationMs: 100 }),
        createGateResult({ gateId: 'gate2', type: 'test', passed: false, durationMs: 200 }),
      ];

      aggregator.addResults(results);

      expect(aggregator.getResults()).toHaveLength(2);
    });
  });

  describe('getResults', () => {
    it('should return copy of results', () => {
      const result = createGateResult({
        gateId: 'test',
        type: 'test',
        passed: true,
        durationMs: 100,
      });

      aggregator.addResult(result);
      const results = aggregator.getResults();

      expect(results).not.toBe(aggregator.getResults());
      expect(results).toEqual(aggregator.getResults());
    });
  });

  describe('allPassed', () => {
    it('should return true when all pass', () => {
      aggregator.addResult(createGateResult({ gateId: 'a', type: 't', passed: true, durationMs: 1 }));
      aggregator.addResult(createGateResult({ gateId: 'b', type: 't', passed: true, durationMs: 1 }));

      expect(aggregator.allPassed()).toBe(true);
    });

    it('should return false when any fails', () => {
      aggregator.addResult(createGateResult({ gateId: 'a', type: 't', passed: true, durationMs: 1 }));
      aggregator.addResult(createGateResult({ gateId: 'b', type: 't', passed: false, durationMs: 1 }));

      expect(aggregator.allPassed()).toBe(false);
    });

    it('should return true for empty results', () => {
      expect(aggregator.allPassed()).toBe(true);
    });
  });

  describe('hasCriticalFailures', () => {
    it('should return true when critical gate fails', () => {
      aggregator.addResult(createGateResult({
        gateId: 'critical',
        type: 'test',
        passed: false,
        weight: 'critical',
        durationMs: 1,
      }));

      expect(aggregator.hasCriticalFailures()).toBe(true);
    });

    it('should return false when only non-critical gates fail', () => {
      aggregator.addResult(createGateResult({
        gateId: 'normal',
        type: 'test',
        passed: false,
        weight: 'normal',
        durationMs: 1,
      }));

      expect(aggregator.hasCriticalFailures()).toBe(false);
    });

    it('should return false when critical gate passes', () => {
      aggregator.addResult(createGateResult({
        gateId: 'critical',
        type: 'test',
        passed: true,
        weight: 'critical',
        durationMs: 1,
      }));

      expect(aggregator.hasCriticalFailures()).toBe(false);
    });
  });

  describe('getFailedGates', () => {
    it('should return only failed gates', () => {
      aggregator.addResult(createGateResult({ gateId: 'pass', type: 't', passed: true, durationMs: 1 }));
      aggregator.addResult(createGateResult({ gateId: 'fail', type: 't', passed: false, durationMs: 1 }));

      const failed = aggregator.getFailedGates();

      expect(failed).toHaveLength(1);
      expect(failed[0].gateId).toBe('fail');
    });
  });

  describe('getPassedGates', () => {
    it('should return only passed gates', () => {
      aggregator.addResult(createGateResult({ gateId: 'pass', type: 't', passed: true, durationMs: 1 }));
      aggregator.addResult(createGateResult({ gateId: 'fail', type: 't', passed: false, durationMs: 1 }));

      const passed = aggregator.getPassedGates();

      expect(passed).toHaveLength(1);
      expect(passed[0].gateId).toBe('pass');
    });
  });

  describe('aggregate', () => {
    it('should aggregate successful results', () => {
      aggregator.addResult(createGateResult({ gateId: 'a', type: 't', passed: true, durationMs: 100 }));
      aggregator.addResult(createGateResult({ gateId: 'b', type: 't', passed: true, durationMs: 200 }));

      const result = aggregator.aggregate();

      expect(result.success).toBe(true);
      expect(result.totalGates).toBe(2);
      expect(result.passedGates).toBe(2);
      expect(result.failedGates).toBe(0);
      expect(result.totalDurationMs).toBe(300);
    });

    it('should aggregate failed results', () => {
      aggregator.addResult(createGateResult({ gateId: 'a', type: 't', passed: true, durationMs: 100 }));
      aggregator.addResult(createGateResult({
        gateId: 'b',
        type: 't',
        passed: false,
        weight: 'critical',
        durationMs: 200,
        message: 'Test failed',
      }));

      const result = aggregator.aggregate();

      expect(result.success).toBe(false);
      expect(result.failedGates).toBe(1);
      expect(result.criticalFailures).toBe(1);
    });

    it('should collect diagnostics from failed gates', () => {
      aggregator.addResult(createGateResult({
        gateId: 'test',
        type: 't',
        passed: false,
        durationMs: 100,
        message: 'Gate failed',
        diagnostics: [
          { severity: 'error', message: 'Type error in foo.ts', file: 'foo.ts', line: 10 },
          { severity: 'warning', message: 'Unused variable' },
        ],
      }));

      const result = aggregator.aggregate();

      // 2 from diagnostics + 1 from message
      expect(result.diagnostics).toHaveLength(3);
    });

    it('should sort diagnostics by severity', () => {
      aggregator.addResult(createGateResult({
        gateId: 'test',
        type: 't',
        passed: false,
        durationMs: 100,
        diagnostics: [
          { severity: 'warning', message: 'Warning' },
          { severity: 'error', message: 'Error' },
          { severity: 'info', message: 'Info' },
        ],
      }));

      const result = aggregator.aggregate();
      const severities = result.diagnostics.map(d => d.severity);

      expect(severities[0]).toBe('error');
    });

    it('should generate summary', () => {
      aggregator.addResult(createGateResult({ gateId: 'a', type: 't', passed: true, durationMs: 1 }));
      aggregator.addResult(createGateResult({ gateId: 'b', type: 't', passed: true, durationMs: 1 }));

      const result = aggregator.aggregate();

      expect(result.summary).toContain('2 gates passed');
    });

    it('should generate failure summary', () => {
      aggregator.addResult(createGateResult({
        gateId: 'a',
        type: 't',
        passed: false,
        weight: 'critical',
        durationMs: 1,
      }));

      const result = aggregator.aggregate();

      expect(result.summary).toContain('1 of 1 gates failed');
      expect(result.summary).toContain('1 critical');
    });

    it('should generate feedback for failures', () => {
      aggregator.addResult(createGateResult({
        gateId: 'contracts',
        type: 'verification-levels',
        passed: false,
        weight: 'critical',
        message: 'Contract verification failed',
        durationMs: 100,
      }));

      const result = aggregator.aggregate();

      expect(result.feedback).toContain('## Gate Verification Failed');
      expect(result.feedback).toContain('CRITICAL');
      expect(result.feedback).toContain('contracts');
    });

    it('should generate success feedback', () => {
      aggregator.addResult(createGateResult({
        gateId: 'test',
        type: 't',
        passed: true,
        durationMs: 100,
      }));

      const result = aggregator.aggregate();

      expect(result.feedback).toContain('All gates passed');
    });
  });

  describe('reset', () => {
    it('should clear all results', () => {
      aggregator.addResult(createGateResult({ gateId: 'a', type: 't', passed: true, durationMs: 1 }));
      aggregator.addResult(createGateResult({ gateId: 'b', type: 't', passed: true, durationMs: 1 }));

      aggregator.reset();

      expect(aggregator.getResults()).toHaveLength(0);
    });
  });
});

describe('createGateResultAggregator', () => {
  it('should create aggregator', () => {
    const aggregator = createGateResultAggregator();
    expect(aggregator).toBeInstanceOf(GateResultAggregator);
  });
});

describe('createGateResult', () => {
  it('should create result with required fields', () => {
    const result = createGateResult({
      gateId: 'test',
      type: 'verification-levels',
      passed: true,
      durationMs: 100,
    });

    expect(result.gateId).toBe('test');
    expect(result.type).toBe('verification-levels');
    expect(result.passed).toBe(true);
    expect(result.durationMs).toBe(100);
    expect(result.weight).toBe('normal'); // Default
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it('should create result with optional fields', () => {
    const result = createGateResult({
      gateId: 'test',
      type: 'test',
      passed: false,
      durationMs: 100,
      weight: 'critical',
      message: 'Failed',
      error: 'Error message',
      diagnostics: [{ severity: 'error', message: 'Diag' }],
      artifacts: [{ name: 'log', type: 'log', path: '/tmp/log' }],
    });

    expect(result.weight).toBe('critical');
    expect(result.message).toBe('Failed');
    expect(result.error).toBe('Error message');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.artifacts).toHaveLength(1);
  });
});
