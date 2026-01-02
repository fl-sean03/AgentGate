/**
 * IterationData Tests (v0.2.19 - Thrust 3)
 *
 * Tests for enhanced IterationData interface and createIterationData factory.
 */

import { describe, it, expect } from 'vitest';
import {
  IterationErrorType,
  RunState,
  createIterationData,
  type IterationData,
} from '../src/types/index.js';

describe('IterationErrorType', () => {
  it('should have all expected error types', () => {
    expect(IterationErrorType.NONE).toBe('none');
    expect(IterationErrorType.AGENT_CRASH).toBe('agent_crash');
    expect(IterationErrorType.AGENT_FAILURE).toBe('agent_failure');
    expect(IterationErrorType.VERIFICATION_FAILED).toBe('verification_failed');
    expect(IterationErrorType.TIMEOUT).toBe('timeout');
    expect(IterationErrorType.SYSTEM_ERROR).toBe('system_error');
  });

  it('should be usable as a type', () => {
    const errorType: IterationErrorType = IterationErrorType.AGENT_CRASH;
    expect(errorType).toBe('agent_crash');
  });
});

describe('createIterationData', () => {
  it('should create iteration data with required fields', () => {
    const data = createIterationData(1, RunState.BUILDING);

    expect(data.iteration).toBe(1);
    expect(data.state).toBe(RunState.BUILDING);
    expect(data.startedAt).toBeInstanceOf(Date);
  });

  it('should initialize agent fields to null', () => {
    const data = createIterationData(1, RunState.BUILDING);

    expect(data.agentSessionId).toBeNull();
    expect(data.agentResultFile).toBeNull();
    expect(data.agentDurationMs).toBeNull();
    expect(data.agentSuccess).toBeNull();
    expect(data.agentModel).toBeNull();
    expect(data.agentTokensUsed).toBeNull();
    expect(data.agentCostUsd).toBeNull();
  });

  it('should initialize verification fields to null/empty', () => {
    const data = createIterationData(1, RunState.BUILDING);

    expect(data.verificationFile).toBeNull();
    expect(data.verificationLevelsRun).toEqual([]);
    expect(data.verificationDurationMs).toBeNull();
    expect(data.verificationPassed).toBeNull();
  });

  it('should initialize error fields with NONE type', () => {
    const data = createIterationData(1, RunState.BUILDING);

    expect(data.errorType).toBe(IterationErrorType.NONE);
    expect(data.errorMessage).toBeNull();
    expect(data.errorDetails).toBeNull();
  });

  it('should initialize other fields with defaults', () => {
    const data = createIterationData(1, RunState.BUILDING);

    expect(data.snapshotId).toBeNull();
    expect(data.feedbackGenerated).toBe(false);
    expect(data.completedAt).toBeNull();
    expect(data.durationMs).toBeNull();
  });

  it('should work with different iterations', () => {
    const data1 = createIterationData(1, RunState.BUILDING);
    const data2 = createIterationData(5, RunState.VERIFYING);

    expect(data1.iteration).toBe(1);
    expect(data2.iteration).toBe(5);
    expect(data1.state).toBe(RunState.BUILDING);
    expect(data2.state).toBe(RunState.VERIFYING);
  });
});

describe('IterationData interface', () => {
  it('should allow setting agent fields', () => {
    const data = createIterationData(1, RunState.BUILDING);

    data.agentSessionId = 'test-session-123';
    data.agentResultFile = '/path/to/agent-1.json';
    data.agentDurationMs = 5000;
    data.agentSuccess = true;
    data.agentModel = 'claude-3-opus';
    data.agentTokensUsed = 1500;
    data.agentCostUsd = 0.05;

    expect(data.agentSessionId).toBe('test-session-123');
    expect(data.agentResultFile).toBe('/path/to/agent-1.json');
    expect(data.agentDurationMs).toBe(5000);
    expect(data.agentSuccess).toBe(true);
    expect(data.agentModel).toBe('claude-3-opus');
    expect(data.agentTokensUsed).toBe(1500);
    expect(data.agentCostUsd).toBe(0.05);
  });

  it('should allow setting verification fields', () => {
    const data = createIterationData(1, RunState.BUILDING);

    data.verificationFile = '/path/to/verification-1.json';
    data.verificationLevelsRun = ['L0', 'L1', 'L2'];
    data.verificationDurationMs = 3000;
    data.verificationPassed = false;

    expect(data.verificationFile).toBe('/path/to/verification-1.json');
    expect(data.verificationLevelsRun).toEqual(['L0', 'L1', 'L2']);
    expect(data.verificationDurationMs).toBe(3000);
    expect(data.verificationPassed).toBe(false);
  });

  it('should allow setting error fields', () => {
    const data = createIterationData(1, RunState.BUILDING);

    data.errorType = IterationErrorType.AGENT_CRASH;
    data.errorMessage = 'Agent process crashed unexpectedly';
    data.errorDetails = {
      exitCode: 1,
      signal: 'SIGKILL',
      lastOutput: 'Error: Out of memory',
    };

    expect(data.errorType).toBe(IterationErrorType.AGENT_CRASH);
    expect(data.errorMessage).toBe('Agent process crashed unexpectedly');
    expect(data.errorDetails).toEqual({
      exitCode: 1,
      signal: 'SIGKILL',
      lastOutput: 'Error: Out of memory',
    });
  });

  it('should allow completing iteration data', () => {
    const data = createIterationData(1, RunState.BUILDING);
    const startTime = data.startedAt.getTime();

    // Simulate some work
    data.agentSuccess = true;
    data.verificationPassed = true;

    // Complete the iteration
    data.completedAt = new Date();
    data.durationMs = data.completedAt.getTime() - startTime;

    expect(data.completedAt).toBeInstanceOf(Date);
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should handle failed iteration with full error context', () => {
    const data = createIterationData(2, RunState.VERIFYING);

    // Agent succeeded but verification failed
    data.agentSessionId = 'session-abc';
    data.agentSuccess = true;
    data.agentDurationMs = 10000;

    // Verification failed
    data.verificationPassed = false;
    data.verificationLevelsRun = ['L0', 'L1'];
    data.verificationDurationMs = 2000;

    // Error details
    data.errorType = IterationErrorType.VERIFICATION_FAILED;
    data.errorMessage = 'Test failure: 3 tests failed';
    data.errorDetails = {
      failedLevel: 'L1',
      failedTests: ['test1', 'test2', 'test3'],
      diagnostics: [
        { level: 'L1', message: 'Expected 5 but got 3' },
      ],
    };

    data.completedAt = new Date();
    data.durationMs = 12000;

    expect(data.agentSuccess).toBe(true);
    expect(data.verificationPassed).toBe(false);
    expect(data.errorType).toBe(IterationErrorType.VERIFICATION_FAILED);
    expect(data.errorDetails?.failedLevel).toBe('L1');
  });
});
