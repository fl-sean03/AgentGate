/**
 * Metrics Collector Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, Phase } from '../src/metrics/index.js';
import type { AgentResult, Snapshot, VerificationReport, LevelResult } from '../src/types/index.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector('test-run-id');
  });

  describe('iteration lifecycle', () => {
    it('should track current iteration', () => {
      collector.startIteration(1);
      expect(collector.getCurrentIteration()).toBe(1);

      collector.startIteration(2);
      expect(collector.getCurrentIteration()).toBe(2);
    });

    it('should return null for metrics before iteration ends', () => {
      collector.startIteration(1);
      expect(collector.getIterationMetrics(1)).toBeNull();
    });

    it('should return metrics after iteration ends', () => {
      collector.startIteration(1);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      const metrics = collector.getIterationMetrics(1);
      expect(metrics).not.toBeNull();
      expect(metrics?.iteration).toBe(1);
      expect(metrics?.runId).toBe('test-run-id');
    });
  });

  describe('phase timing', () => {
    it('should record phase duration', async () => {
      collector.startIteration(1);
      collector.startPhase(Phase.BUILD);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      const metrics = collector.getIterationMetrics(1);
      expect(metrics).not.toBeNull();

      const buildPhase = metrics?.phases.find(p => p.phase === Phase.BUILD);
      expect(buildPhase).toBeDefined();
      expect(buildPhase?.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('should track multiple phases', () => {
      collector.startIteration(1);

      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);

      collector.startPhase(Phase.SNAPSHOT);
      collector.endPhase(Phase.SNAPSHOT);

      collector.startPhase(Phase.VERIFY);
      collector.endPhase(Phase.VERIFY);

      collector.endIteration(1);

      const phases = collector.getPhaseMetrics(1);
      expect(phases).toHaveLength(3);
      expect(phases.map(p => p.phase)).toContain(Phase.BUILD);
      expect(phases.map(p => p.phase)).toContain(Phase.SNAPSHOT);
      expect(phases.map(p => p.phase)).toContain(Phase.VERIFY);
    });

    it('should get current phase duration for in-progress phase', () => {
      collector.startIteration(1);
      collector.startPhase(Phase.BUILD);

      const duration = collector.getCurrentPhaseDuration(Phase.BUILD);
      expect(duration).not.toBeNull();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return null for phase not started', () => {
      collector.startIteration(1);
      expect(collector.getCurrentPhaseDuration(Phase.BUILD)).toBeNull();
    });
  });

  describe('agent result recording', () => {
    it('should record token usage', () => {
      collector.startIteration(1);

      const agentResult: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        structuredOutput: null,
        sessionId: 'session-1',
        tokensUsed: { input: 1000, output: 500 },
        durationMs: 5000,
      };

      collector.recordAgentResult(agentResult);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      const metrics = collector.getIterationMetrics(1);
      expect(metrics?.agentTokensInput).toBe(1000);
      expect(metrics?.agentTokensOutput).toBe(500);
      expect(metrics?.agentExitCode).toBe(0);
      expect(metrics?.agentDurationMs).toBe(5000);
    });

    it('should handle null token usage', () => {
      collector.startIteration(1);

      const agentResult: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        structuredOutput: null,
        sessionId: 'session-1',
        tokensUsed: null,
        durationMs: 5000,
      };

      collector.recordAgentResult(agentResult);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      const metrics = collector.getIterationMetrics(1);
      expect(metrics?.agentTokensInput).toBeNull();
      expect(metrics?.agentTokensOutput).toBeNull();
    });
  });

  describe('snapshot recording', () => {
    it('should record code changes', () => {
      collector.startIteration(1);

      const snapshot: Snapshot = {
        id: 'snap-1',
        runId: 'test-run-id',
        iteration: 1,
        beforeSha: 'abc123',
        afterSha: 'def456',
        branch: 'main',
        commitMessage: 'Test commit',
        patchPath: null,
        filesChanged: 5,
        insertions: 100,
        deletions: 25,
        createdAt: new Date(),
      };

      collector.recordSnapshot(snapshot);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      const metrics = collector.getIterationMetrics(1);
      expect(metrics?.filesChanged).toBe(5);
      expect(metrics?.insertions).toBe(100);
      expect(metrics?.deletions).toBe(25);
    });
  });

  describe('verification recording', () => {
    it('should record verification results', () => {
      collector.startIteration(1);

      const createLevelResult = (level: string, passed: boolean): LevelResult => ({
        level: level as 'L0' | 'L1' | 'L2' | 'L3',
        passed,
        checks: [{ name: 'test', passed, message: null, details: null }],
        duration: 1000,
      });

      const report: VerificationReport = {
        id: 'report-1',
        snapshotId: 'snap-1',
        runId: 'test-run-id',
        iteration: 1,
        passed: true,
        l0Result: createLevelResult('L0', true),
        l1Result: createLevelResult('L1', true),
        l2Result: createLevelResult('L2', true),
        l3Result: createLevelResult('L3', true),
        logs: '',
        diagnostics: [],
        totalDuration: 4000,
        createdAt: new Date(),
      };

      collector.recordVerification(report);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      const metrics = collector.getIterationMetrics(1);
      expect(metrics?.verificationPassed).toBe(true);
      expect(metrics?.verificationDurationMs).toBe(4000);
      expect(metrics?.verificationLevels).toHaveLength(4);
      expect(metrics?.verificationLevels.every(l => l.passed)).toBe(true);
    });
  });

  describe('getAllIterationMetrics', () => {
    it('should return all completed iterations sorted', () => {
      // Create iterations in non-sequential order
      collector.startIteration(2);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(2);

      collector.startIteration(1);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      collector.startIteration(3);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(3);

      const all = collector.getAllIterationMetrics();
      expect(all).toHaveLength(3);
      expect(all[0].iteration).toBe(1);
      expect(all[1].iteration).toBe(2);
      expect(all[2].iteration).toBe(3);
    });

    it('should not include incomplete iterations', () => {
      collector.startIteration(1);
      collector.startPhase(Phase.BUILD);
      collector.endPhase(Phase.BUILD);
      collector.endIteration(1);

      collector.startIteration(2);
      // Don't end this iteration

      const all = collector.getAllIterationMetrics();
      expect(all).toHaveLength(1);
      expect(all[0].iteration).toBe(1);
    });
  });
});
