/**
 * Enhanced IterationData Unit Tests (v0.2.19 - Thrust 3)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createIterationData,
  IterationErrorType,
  RunState,
  type IterationData,
  type AgentResult,
  type VerificationReport,
  type LevelResult,
} from '../src/types/index.js';
import {
  saveIterationData,
  loadIterationData,
  listIterations,
  updateWithAgentResult,
  updateWithVerificationResult,
  updateWithError,
} from '../src/orchestrator/run-store.js';

describe('IterationData', () => {
  describe('createIterationData', () => {
    it('should create default iteration data with all fields', () => {
      const data = createIterationData(1);

      // Core metadata
      expect(data.iteration).toBe(1);
      expect(data.state).toBe(RunState.QUEUED);
      expect(data.startedAt).toBeInstanceOf(Date);
      expect(data.completedAt).toBeNull();
      expect(data.durationMs).toBeNull();

      // Snapshot
      expect(data.snapshotId).toBeNull();

      // Feedback loop
      expect(data.feedbackGenerated).toBe(false);

      // Agent defaults
      expect(data.agentSessionId).toBeNull();
      expect(data.agentResultFile).toBeNull();
      expect(data.agentDurationMs).toBeNull();
      expect(data.agentSuccess).toBeNull();
      expect(data.agentModel).toBeNull();
      expect(data.agentTokensUsed).toBeNull();
      expect(data.agentCostUsd).toBeNull();

      // Verification defaults
      expect(data.verificationFile).toBeNull();
      expect(data.verificationPassed).toBeNull();
      expect(data.verificationLevelsRun).toEqual([]);
      expect(data.verificationDurationMs).toBeNull();

      // Error defaults
      expect(data.errorType).toBe(IterationErrorType.NONE);
      expect(data.errorMessage).toBeNull();
      expect(data.errorDetails).toBeNull();
    });

    it('should create iteration data with different iteration numbers', () => {
      const data1 = createIterationData(1);
      const data5 = createIterationData(5);

      expect(data1.iteration).toBe(1);
      expect(data5.iteration).toBe(5);
    });
  });

  describe('updateWithAgentResult', () => {
    it('should update with agent result info', () => {
      const data = createIterationData(1);
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: 'Output',
        stderr: '',
        sessionId: 'session-123',
        model: 'claude-3-opus',
        durationMs: 5000,
        tokensUsed: { input: 1000, output: 500 },
        totalCostUsd: 0.25,
        structuredOutput: null,
      };

      const updated = updateWithAgentResult(data, result, 'agent-1.json');

      expect(updated.agentSessionId).toBe('session-123');
      expect(updated.agentResultFile).toBe('agent-1.json');
      expect(updated.agentDurationMs).toBe(5000);
      expect(updated.agentSuccess).toBe(true);
      expect(updated.agentModel).toBe('claude-3-opus');
      expect(updated.agentTokensUsed).toEqual({
        input: 1000,
        output: 500,
        total: 1500,
      });
      expect(updated.agentCostUsd).toBe(0.25);
    });

    it('should handle agent result without optional fields', () => {
      const data = createIterationData(1);
      const result: AgentResult = {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: 'Error',
        sessionId: null,
        tokensUsed: null,
        durationMs: 1000,
        structuredOutput: null,
      };

      const updated = updateWithAgentResult(data, result, 'agent-1.json');

      expect(updated.agentSessionId).toBeNull();
      expect(updated.agentModel).toBeNull();
      expect(updated.agentTokensUsed).toBeNull();
      expect(updated.agentCostUsd).toBeNull();
      expect(updated.agentSuccess).toBe(false);
    });

    it('should preserve other fields when updating', () => {
      const data = createIterationData(2);
      data.snapshotId = 'snap-123';
      data.feedbackGenerated = true;

      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'session-456',
        tokensUsed: null,
        durationMs: 2000,
        structuredOutput: null,
      };

      const updated = updateWithAgentResult(data, result, 'agent-2.json');

      // Should preserve existing fields
      expect(updated.iteration).toBe(2);
      expect(updated.snapshotId).toBe('snap-123');
      expect(updated.feedbackGenerated).toBe(true);

      // Should update agent fields
      expect(updated.agentSessionId).toBe('session-456');
    });
  });

  describe('updateWithVerificationResult', () => {
    it('should update with verification info', () => {
      const data = createIterationData(1);
      const l0Result: LevelResult = {
        level: 'L0',
        passed: true,
        checks: [],
        duration: 1000,
      };
      const l1Result: LevelResult = {
        level: 'L1',
        passed: true,
        checks: [],
        duration: 2000,
      };

      const report: VerificationReport = {
        id: 'ver-1',
        snapshotId: 'snap-1',
        runId: 'run-1',
        iteration: 1,
        passed: true,
        l0Result,
        l1Result,
        l2Result: { level: 'L2', passed: true, checks: [], duration: 500 },
        l3Result: { level: 'L3', passed: true, checks: [], duration: 300 },
        logs: '',
        diagnostics: [],
        totalDuration: 3800,
        createdAt: new Date(),
      };

      const updated = updateWithVerificationResult(data, report, 'verification-1.json');

      expect(updated.verificationFile).toBe('verification-1.json');
      expect(updated.verificationPassed).toBe(true);
      expect(updated.verificationLevelsRun).toEqual(['L0', 'L1', 'L2', 'L3']);
      expect(updated.verificationDurationMs).toBe(3800);
    });

    it('should handle failed verification', () => {
      const data = createIterationData(1);
      const l0Result: LevelResult = {
        level: 'L0',
        passed: false,
        checks: [{ name: 'typecheck', passed: false, message: 'Type error', details: null }],
        duration: 1000,
      };

      const report: VerificationReport = {
        id: 'ver-1',
        snapshotId: 'snap-1',
        runId: 'run-1',
        iteration: 1,
        passed: false,
        l0Result,
        l1Result: { level: 'L1', passed: false, checks: [], duration: 0 },
        l2Result: { level: 'L2', passed: false, checks: [], duration: 0 },
        l3Result: { level: 'L3', passed: false, checks: [], duration: 0 },
        logs: 'Build failed',
        diagnostics: [],
        totalDuration: 1000,
        createdAt: new Date(),
      };

      const updated = updateWithVerificationResult(data, report, 'verification-1.json');

      expect(updated.verificationPassed).toBe(false);
      expect(updated.verificationLevelsRun).toContain('L0');
    });
  });

  describe('updateWithError', () => {
    it('should update with error info and complete iteration', () => {
      const data = createIterationData(1);
      const startTime = data.startedAt.getTime();

      // Small delay to ensure durationMs > 0
      const updated = updateWithError(
        data,
        IterationErrorType.VERIFICATION_FAILED,
        'L0 failed: TypeScript compilation errors',
        { failedLevel: 'L0', failedCheck: 'typecheck' }
      );

      expect(updated.errorType).toBe(IterationErrorType.VERIFICATION_FAILED);
      expect(updated.errorMessage).toBe('L0 failed: TypeScript compilation errors');
      expect(updated.errorDetails).toEqual({ failedLevel: 'L0', failedCheck: 'typecheck' });
      expect(updated.completedAt).not.toBeNull();
      expect(updated.durationMs).toBeGreaterThanOrEqual(0);
      expect(updated.completedAt!.getTime()).toBeGreaterThanOrEqual(startTime);
    });

    it('should handle different error types', () => {
      const errorTypes = [
        IterationErrorType.NONE,
        IterationErrorType.AGENT_CRASH,
        IterationErrorType.AGENT_FAILURE,
        IterationErrorType.VERIFICATION_FAILED,
        IterationErrorType.TIMEOUT,
        IterationErrorType.SYSTEM_ERROR,
      ];

      for (const errorType of errorTypes) {
        const data = createIterationData(1);
        const updated = updateWithError(data, errorType, 'Test message');
        expect(updated.errorType).toBe(errorType);
      }
    });

    it('should handle missing details', () => {
      const data = createIterationData(1);
      const updated = updateWithError(
        data,
        IterationErrorType.TIMEOUT,
        'Execution timed out'
      );

      expect(updated.errorDetails).toBeNull();
    });
  });

  describe('IterationErrorType enum', () => {
    it('should have all expected values', () => {
      expect(IterationErrorType.NONE).toBe('none');
      expect(IterationErrorType.AGENT_CRASH).toBe('agent_crash');
      expect(IterationErrorType.AGENT_FAILURE).toBe('agent_failure');
      expect(IterationErrorType.VERIFICATION_FAILED).toBe('verification_failed');
      expect(IterationErrorType.TIMEOUT).toBe('timeout');
      expect(IterationErrorType.SYSTEM_ERROR).toBe('system_error');
    });
  });
});

describe('IterationData Persistence', () => {
  let testDir: string;
  let testRunId: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    testRunId = `test-run-${Date.now()}`;
    testDir = join(tmpdir(), 'agentgate-test', testRunId);
    await mkdir(testDir, { recursive: true });

    // Mock getRunDir to return our test directory
    // This is handled by the module structure
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(join(tmpdir(), 'agentgate-test'), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // Note: Full persistence tests require proper mocking of getRunDir
  // These tests verify the function signatures and basic behavior

  describe('saveIterationData', () => {
    it('should have correct function signature', () => {
      expect(typeof saveIterationData).toBe('function');
      expect(saveIterationData.length).toBe(2); // runId, data
    });
  });

  describe('loadIterationData', () => {
    it('should have correct function signature', () => {
      expect(typeof loadIterationData).toBe('function');
      expect(loadIterationData.length).toBe(2); // runId, iteration
    });

    it('should return null for non-existent iteration', async () => {
      const result = await loadIterationData('non-existent-run', 999);
      expect(result).toBeNull();
    });
  });

  describe('listIterations', () => {
    it('should have correct function signature', () => {
      expect(typeof listIterations).toBe('function');
      expect(listIterations.length).toBe(1); // runId
    });

    it('should return empty array for non-existent run', async () => {
      const result = await listIterations('non-existent-run');
      expect(result).toEqual([]);
    });
  });
});
