/**
 * Artifact Store Tests
 *
 * Comprehensive tests for the artifact store module covering:
 * - saveRunMetadata/loadRunMetadata with Date serialization
 * - listRuns with sorting
 * - listIterations
 * - getLatestIteration
 * - Error handling for missing directories and corrupted JSON
 * - Edge cases with empty results
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import type { Dirent } from 'node:fs';
import type { Run, RunState, IterationData, VerificationReport, GatePlan, StructuredFeedback } from '../../src/types/index.js';
import type { RunSummary } from '../../src/types/summary.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn(),
}));

// Mock paths module
vi.mock('../../src/artifacts/paths.js', () => {
  return {
    getRunDir: vi.fn().mockImplementation((runId: string) => `/mock/runs/${runId}`),
    getRunMetadataPath: vi.fn().mockImplementation((runId: string) => `/mock/runs/${runId}/run.json`),
    getRunGatePlanPath: vi.fn().mockImplementation((runId: string) => `/mock/runs/${runId}/gate-plan.json`),
    getRunSummaryPath: vi.fn().mockImplementation((runId: string) => `/mock/runs/${runId}/summary.json`),
    getIterationMetadataPath: vi.fn().mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/iteration.json`),
    getAgentLogsPath: vi.fn().mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/agent-logs.txt`),
    getVerificationReportPath: vi.fn().mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/verification/report.json`),
    getFeedbackPath: vi.fn().mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/feedback.json`),
    getVerificationLogsPath: vi.fn().mockImplementation((runId: string, iteration: number, level: string) => `/mock/runs/${runId}/iterations/${iteration}/verification/${level.toLowerCase()}-logs.txt`),
    getRunsDir: vi.fn().mockReturnValue('/mock/runs'),
    ensureRunStructure: vi.fn().mockResolvedValue(undefined),
    ensureIterationStructure: vi.fn().mockResolvedValue(undefined),
    ensureDir: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock json module
vi.mock('../../src/artifacts/json.js', () => ({
  writeJson: vi.fn().mockResolvedValue(undefined),
  readJson: vi.fn(),
  writeLog: vi.fn().mockResolvedValue(undefined),
  readLog: vi.fn(),
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Import after mocks
import { readdir } from 'node:fs/promises';
import {
  saveRunMetadata,
  loadRunMetadata,
  saveIterationMetadata,
  loadIterationMetadata,
  saveAgentLogs,
  loadAgentLogs,
  saveVerificationReport,
  loadVerificationReport,
  saveVerificationLogs,
  loadVerificationLogs,
  saveFeedback,
  loadFeedback,
  saveGatePlan,
  loadGatePlan,
  saveRunSummary,
  loadRunSummary,
  listRuns,
  listIterations,
  getLatestIteration,
} from '../../src/artifacts/store.js';
import { writeJson, readJson, writeLog, readLog } from '../../src/artifacts/json.js';
import { ensureRunStructure, ensureIterationStructure, getRunMetadataPath, getRunsDir, getRunDir } from '../../src/artifacts/paths.js';

/**
 * Helper to create a mock Dirent object
 */
function createMockDirent(name: string, isDirectory: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '/mock/path',
    parentPath: '/mock',
  };
}

/**
 * Helper to create a mock Run object
 */
function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-123',
    workOrderId: 'wo-456',
    workspaceId: 'ws-789',
    iteration: 1,
    maxIterations: 5,
    state: 'building' as RunState,
    snapshotBeforeSha: 'abc123',
    snapshotAfterSha: null,
    snapshotIds: [],
    startedAt: new Date('2024-01-15T10:00:00Z'),
    completedAt: null,
    result: null,
    error: null,
    sessionId: 'session-001',
    gitHubBranch: null,
    gitHubPrUrl: null,
    gitHubPrNumber: null,
    warnings: [],
    ciEnabled: false,
    ciIterationCount: 0,
    maxCiIterations: 0,
    ciStatus: null,
    ciPollingStartedAt: null,
    ciCompletedAt: null,
    ciWorkflowUrl: null,
    ...overrides,
  };
}

/**
 * Helper to create a mock RunSummary object
 */
function createMockRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: 'run-123',
    workOrderId: 'wo-456',
    taskPrompt: 'Test task',
    workspacePath: '/workspace',
    status: 'succeeded',
    iterations: 1,
    duration: 1000,
    finalSnapshotSha: 'abc123',
    verificationPassed: true,
    startedAt: new Date('2024-01-15T10:00:00Z'),
    completedAt: new Date('2024-01-15T10:10:00Z'),
    artifactsPath: '/mock/runs/run-123',
    ...overrides,
  };
}

/**
 * Helper to create a mock IterationData object
 */
function createMockIterationData(overrides: Partial<IterationData> = {}): IterationData {
  return {
    iteration: 1,
    state: 'building' as RunState,
    snapshotId: null,
    verificationPassed: null,
    feedbackGenerated: false,
    startedAt: new Date('2024-01-15T10:00:00Z'),
    completedAt: null,
    durationMs: null,
    agentSessionId: null,
    agentResultFile: null,
    agentDurationMs: null,
    agentSuccess: null,
    agentModel: null,
    agentTokensUsed: null,
    agentCostUsd: null,
    verificationFile: null,
    verificationLevelsRun: [],
    verificationDurationMs: null,
    errorType: 'none',
    errorMessage: null,
    errorDetails: null,
    ...overrides,
  };
}

// Import mocked modules for re-setup
import * as pathsMock from '../../src/artifacts/paths.js';

describe('Artifact Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-establish mock implementations after clearAllMocks
    vi.mocked(pathsMock.getRunDir).mockImplementation((runId: string) => `/mock/runs/${runId}`);
    vi.mocked(pathsMock.getRunMetadataPath).mockImplementation((runId: string) => `/mock/runs/${runId}/run.json`);
    vi.mocked(pathsMock.getRunGatePlanPath).mockImplementation((runId: string) => `/mock/runs/${runId}/gate-plan.json`);
    vi.mocked(pathsMock.getRunSummaryPath).mockImplementation((runId: string) => `/mock/runs/${runId}/summary.json`);
    vi.mocked(pathsMock.getIterationMetadataPath).mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/iteration.json`);
    vi.mocked(pathsMock.getAgentLogsPath).mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/agent-logs.txt`);
    vi.mocked(pathsMock.getVerificationReportPath).mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/verification/report.json`);
    vi.mocked(pathsMock.getFeedbackPath).mockImplementation((runId: string, iteration: number) => `/mock/runs/${runId}/iterations/${iteration}/feedback.json`);
    vi.mocked(pathsMock.getVerificationLogsPath).mockImplementation((runId: string, iteration: number, level: string) => `/mock/runs/${runId}/iterations/${iteration}/verification/${level.toLowerCase()}-logs.txt`);
    vi.mocked(pathsMock.getRunsDir).mockReturnValue('/mock/runs');
    vi.mocked(pathsMock.ensureRunStructure).mockResolvedValue(undefined);
    vi.mocked(pathsMock.ensureIterationStructure).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveRunMetadata', () => {
    it('should save run metadata with ensured directory structure', async () => {
      const run = createMockRun();

      await saveRunMetadata(run);

      expect(ensureRunStructure).toHaveBeenCalledWith('run-123');
      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/run.json', run);
    });

    it('should save run metadata with completedAt date', async () => {
      const run = createMockRun({
        completedAt: new Date('2024-01-15T11:00:00Z'),
        result: 'passed',
      });

      await saveRunMetadata(run);

      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/run.json', run);
    });
  });

  describe('loadRunMetadata', () => {
    it('should load and deserialize run metadata with Date objects', async () => {
      const storedRun = {
        id: 'run-123',
        workOrderId: 'wo-456',
        workspaceId: 'ws-789',
        iteration: 1,
        maxIterations: 5,
        state: 'building',
        snapshotBeforeSha: 'abc123',
        snapshotAfterSha: null,
        snapshotIds: [],
        startedAt: '2024-01-15T10:00:00.000Z', // Stored as string
        completedAt: null,
        result: null,
        error: null,
        sessionId: 'session-001',
        gitHubBranch: null,
        gitHubPrUrl: null,
        gitHubPrNumber: null,
        warnings: [],
        ciEnabled: false,
        ciIterationCount: 0,
        maxCiIterations: 0,
        ciStatus: null,
        ciPollingStartedAt: null,
        ciCompletedAt: null,
        ciWorkflowUrl: null,
      };

      vi.mocked(readJson).mockResolvedValue(storedRun);

      const result = await loadRunMetadata('run-123');

      expect(result).not.toBeNull();
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.startedAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
      expect(result!.completedAt).toBeNull();
    });

    it('should properly deserialize completedAt when present', async () => {
      const storedRun = {
        id: 'run-123',
        workOrderId: 'wo-456',
        workspaceId: 'ws-789',
        iteration: 1,
        maxIterations: 5,
        state: 'succeeded',
        snapshotBeforeSha: 'abc123',
        snapshotAfterSha: 'def456',
        snapshotIds: ['snap-1'],
        startedAt: '2024-01-15T10:00:00.000Z',
        completedAt: '2024-01-15T11:30:00.000Z',
        result: 'passed',
        error: null,
        sessionId: 'session-001',
        gitHubBranch: null,
        gitHubPrUrl: null,
        gitHubPrNumber: null,
        warnings: [],
        ciEnabled: false,
        ciIterationCount: 0,
        maxCiIterations: 0,
        ciStatus: null,
        ciPollingStartedAt: null,
        ciCompletedAt: null,
        ciWorkflowUrl: null,
      };

      vi.mocked(readJson).mockResolvedValue(storedRun);

      const result = await loadRunMetadata('run-123');

      expect(result).not.toBeNull();
      expect(result!.completedAt).toBeInstanceOf(Date);
      expect(result!.completedAt!.toISOString()).toBe('2024-01-15T11:30:00.000Z');
    });

    it('should return null when run metadata does not exist', async () => {
      vi.mocked(readJson).mockResolvedValue(null);

      const result = await loadRunMetadata('nonexistent-run');

      expect(result).toBeNull();
    });
  });

  describe('saveIterationMetadata', () => {
    it('should save iteration metadata with ensured directory structure', async () => {
      const iterationData = createMockIterationData();

      await saveIterationMetadata('run-123', 1, iterationData);

      expect(ensureIterationStructure).toHaveBeenCalledWith('run-123', 1);
      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/iterations/1/iteration.json', iterationData);
    });
  });

  describe('loadIterationMetadata', () => {
    it('should load and deserialize iteration metadata with Date objects', async () => {
      const storedData = {
        iteration: 1,
        state: 'building',
        snapshotId: null,
        verificationPassed: null,
        feedbackGenerated: false,
        startedAt: '2024-01-15T10:00:00.000Z',
        completedAt: null,
        durationMs: null,
        agentSessionId: null,
        agentResultFile: null,
        agentDurationMs: null,
        agentSuccess: null,
        agentModel: null,
        agentTokensUsed: null,
        agentCostUsd: null,
        verificationFile: null,
        verificationLevelsRun: [],
        verificationDurationMs: null,
        errorType: 'none',
        errorMessage: null,
        errorDetails: null,
      };

      vi.mocked(readJson).mockResolvedValue(storedData);

      const result = await loadIterationMetadata('run-123', 1);

      expect(result).not.toBeNull();
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.startedAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
    });

    it('should deserialize completedAt when present', async () => {
      const storedData = {
        iteration: 1,
        state: 'succeeded',
        snapshotId: 'snap-1',
        verificationPassed: true,
        feedbackGenerated: false,
        startedAt: '2024-01-15T10:00:00.000Z',
        completedAt: '2024-01-15T10:30:00.000Z',
        durationMs: 1800000,
        agentSessionId: null,
        agentResultFile: null,
        agentDurationMs: null,
        agentSuccess: null,
        agentModel: null,
        agentTokensUsed: null,
        agentCostUsd: null,
        verificationFile: null,
        verificationLevelsRun: [],
        verificationDurationMs: null,
        errorType: 'none',
        errorMessage: null,
        errorDetails: null,
      };

      vi.mocked(readJson).mockResolvedValue(storedData);

      const result = await loadIterationMetadata('run-123', 1);

      expect(result!.completedAt).toBeInstanceOf(Date);
      expect(result!.completedAt!.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should return null when iteration metadata does not exist', async () => {
      vi.mocked(readJson).mockResolvedValue(null);

      const result = await loadIterationMetadata('run-123', 99);

      expect(result).toBeNull();
    });
  });

  describe('saveAgentLogs', () => {
    it('should save agent logs with ensured directory structure', async () => {
      await saveAgentLogs('run-123', 1, 'Agent log content');

      expect(ensureIterationStructure).toHaveBeenCalledWith('run-123', 1);
      expect(writeLog).toHaveBeenCalledWith('/mock/runs/run-123/iterations/1/agent-logs.txt', 'Agent log content');
    });
  });

  describe('loadAgentLogs', () => {
    it('should load agent logs', async () => {
      vi.mocked(readLog).mockResolvedValue('Agent log content');

      const result = await loadAgentLogs('run-123', 1);

      expect(result).toBe('Agent log content');
    });

    it('should return null when logs do not exist', async () => {
      vi.mocked(readLog).mockResolvedValue(null);

      const result = await loadAgentLogs('run-123', 99);

      expect(result).toBeNull();
    });
  });

  describe('saveVerificationReport', () => {
    it('should save verification report with ensured directory structure', async () => {
      const report: VerificationReport = {
        passed: true,
        levels: [],
        createdAt: new Date('2024-01-15T10:00:00Z'),
        durationMs: 5000,
        summary: 'All checks passed',
      };

      await saveVerificationReport('run-123', 1, report);

      expect(ensureIterationStructure).toHaveBeenCalledWith('run-123', 1);
      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/iterations/1/verification/report.json', report);
    });
  });

  describe('loadVerificationReport', () => {
    it('should load and deserialize verification report with Date', async () => {
      const storedReport = {
        passed: true,
        levels: [],
        createdAt: '2024-01-15T10:00:00.000Z',
        durationMs: 5000,
        summary: 'All checks passed',
      };

      vi.mocked(readJson).mockResolvedValue(storedReport);

      const result = await loadVerificationReport('run-123', 1);

      expect(result).not.toBeNull();
      expect(result!.createdAt).toBeInstanceOf(Date);
      expect(result!.createdAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
    });

    it('should return null when verification report does not exist', async () => {
      vi.mocked(readJson).mockResolvedValue(null);

      const result = await loadVerificationReport('run-123', 99);

      expect(result).toBeNull();
    });
  });

  describe('saveVerificationLogs', () => {
    it('should save verification logs with ensured directory structure', async () => {
      await saveVerificationLogs('run-123', 1, 'L0', 'L0 log content');

      expect(ensureIterationStructure).toHaveBeenCalledWith('run-123', 1);
      expect(writeLog).toHaveBeenCalledWith('/mock/runs/run-123/iterations/1/verification/l0-logs.txt', 'L0 log content');
    });
  });

  describe('loadVerificationLogs', () => {
    it('should load verification logs', async () => {
      vi.mocked(readLog).mockResolvedValue('L0 log content');

      const result = await loadVerificationLogs('run-123', 1, 'L0');

      expect(result).toBe('L0 log content');
    });

    it('should return null when verification logs do not exist', async () => {
      vi.mocked(readLog).mockResolvedValue(null);

      const result = await loadVerificationLogs('run-123', 99, 'L0');

      expect(result).toBeNull();
    });
  });

  describe('saveFeedback', () => {
    it('should save feedback with ensured directory structure', async () => {
      const feedback: StructuredFeedback = {
        summary: 'Fix the issues',
        failures: [],
        suggestions: [],
        priority: 'medium',
      };

      await saveFeedback('run-123', 1, feedback);

      expect(ensureIterationStructure).toHaveBeenCalledWith('run-123', 1);
      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/iterations/1/feedback.json', feedback);
    });
  });

  describe('loadFeedback', () => {
    it('should load feedback', async () => {
      const storedFeedback: StructuredFeedback = {
        summary: 'Fix the issues',
        failures: [],
        suggestions: [],
        priority: 'medium',
      };

      vi.mocked(readJson).mockResolvedValue(storedFeedback);

      const result = await loadFeedback('run-123', 1);

      expect(result).toEqual(storedFeedback);
    });

    it('should return null when feedback does not exist', async () => {
      vi.mocked(readJson).mockResolvedValue(null);

      const result = await loadFeedback('run-123', 99);

      expect(result).toBeNull();
    });
  });

  describe('saveGatePlan', () => {
    it('should save gate plan with ensured directory structure', async () => {
      const gatePlan: GatePlan = {
        source: 'default',
        environment: { runtime: 'node' },
        contracts: {},
        tests: [],
        blackbox: [],
        sanity: [],
        executionPolicy: {},
      };

      await saveGatePlan('run-123', gatePlan);

      expect(ensureRunStructure).toHaveBeenCalledWith('run-123');
      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/gate-plan.json', gatePlan);
    });
  });

  describe('loadGatePlan', () => {
    it('should load gate plan', async () => {
      const storedGatePlan: GatePlan = {
        source: 'default',
        environment: { runtime: 'node' },
        contracts: {},
        tests: [],
        blackbox: [],
        sanity: [],
        executionPolicy: {},
      };

      vi.mocked(readJson).mockResolvedValue(storedGatePlan);

      const result = await loadGatePlan('run-123');

      expect(result).toEqual(storedGatePlan);
    });

    it('should return null when gate plan does not exist', async () => {
      vi.mocked(readJson).mockResolvedValue(null);

      const result = await loadGatePlan('nonexistent-run');

      expect(result).toBeNull();
    });
  });

  describe('saveRunSummary', () => {
    it('should save run summary with ensured directory structure', async () => {
      const summary = createMockRunSummary();

      await saveRunSummary('run-123', summary);

      expect(ensureRunStructure).toHaveBeenCalledWith('run-123');
      expect(writeJson).toHaveBeenCalledWith('/mock/runs/run-123/summary.json', summary);
    });
  });

  describe('loadRunSummary', () => {
    it('should load and deserialize run summary with Date objects', async () => {
      const storedSummary = {
        runId: 'run-123',
        workOrderId: 'wo-456',
        taskPrompt: 'Test task',
        workspacePath: '/workspace',
        status: 'succeeded',
        iterations: 1,
        duration: 1000,
        finalSnapshotSha: 'abc123',
        verificationPassed: true,
        startedAt: '2024-01-15T10:00:00.000Z',
        completedAt: '2024-01-15T10:10:00.000Z',
        artifactsPath: '/mock/runs/run-123',
      };

      vi.mocked(readJson).mockResolvedValue(storedSummary);

      const result = await loadRunSummary('run-123');

      expect(result).not.toBeNull();
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.completedAt).toBeInstanceOf(Date);
      expect(result!.startedAt.toISOString()).toBe('2024-01-15T10:00:00.000Z');
      expect(result!.completedAt.toISOString()).toBe('2024-01-15T10:10:00.000Z');
    });

    it('should return null when run summary does not exist', async () => {
      vi.mocked(readJson).mockResolvedValue(null);

      const result = await loadRunSummary('nonexistent-run');

      expect(result).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('should list runs sorted by startedAt in descending order', async () => {
      const dirents = [
        createMockDirent('run-1', true),
        createMockDirent('run-2', true),
        createMockDirent('run-3', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      // Mock loadRunSummary for each run (readJson is called internally)
      vi.mocked(readJson)
        .mockResolvedValueOnce({
          runId: 'run-1',
          workOrderId: 'wo-1',
          taskPrompt: 'Task 1',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'abc',
          verificationPassed: true,
          startedAt: '2024-01-15T08:00:00.000Z', // Oldest
          completedAt: '2024-01-15T08:10:00.000Z',
          artifactsPath: '/mock/runs/run-1',
        })
        .mockResolvedValueOnce({
          runId: 'run-2',
          workOrderId: 'wo-2',
          taskPrompt: 'Task 2',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'def',
          verificationPassed: true,
          startedAt: '2024-01-15T12:00:00.000Z', // Newest
          completedAt: '2024-01-15T12:10:00.000Z',
          artifactsPath: '/mock/runs/run-2',
        })
        .mockResolvedValueOnce({
          runId: 'run-3',
          workOrderId: 'wo-3',
          taskPrompt: 'Task 3',
          workspacePath: '/workspace',
          status: 'failed',
          iterations: 3,
          duration: 5000,
          finalSnapshotSha: null,
          verificationPassed: false,
          startedAt: '2024-01-15T10:00:00.000Z', // Middle
          completedAt: '2024-01-15T10:50:00.000Z',
          artifactsPath: '/mock/runs/run-3',
        });

      const result = await listRuns();

      expect(result).toHaveLength(3);
      // Should be sorted by startedAt descending (newest first)
      expect(result[0].runId).toBe('run-2');
      expect(result[1].runId).toBe('run-3');
      expect(result[2].runId).toBe('run-1');
    });

    it('should skip non-directory entries', async () => {
      const dirents = [
        createMockDirent('run-1', true),
        createMockDirent('README.md', false), // File, not directory
        createMockDirent('run-2', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      vi.mocked(readJson)
        .mockResolvedValueOnce({
          runId: 'run-1',
          workOrderId: 'wo-1',
          taskPrompt: 'Task 1',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'abc',
          verificationPassed: true,
          startedAt: '2024-01-15T10:00:00.000Z',
          completedAt: '2024-01-15T10:10:00.000Z',
          artifactsPath: '/mock/runs/run-1',
        })
        .mockResolvedValueOnce({
          runId: 'run-2',
          workOrderId: 'wo-2',
          taskPrompt: 'Task 2',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'def',
          verificationPassed: true,
          startedAt: '2024-01-15T11:00:00.000Z',
          completedAt: '2024-01-15T11:10:00.000Z',
          artifactsPath: '/mock/runs/run-2',
        });

      const result = await listRuns();

      expect(result).toHaveLength(2);
    });

    it('should skip runs without valid summary', async () => {
      const dirents = [
        createMockDirent('run-1', true),
        createMockDirent('run-orphaned', true), // Has no summary
        createMockDirent('run-2', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      vi.mocked(readJson)
        .mockResolvedValueOnce({
          runId: 'run-1',
          workOrderId: 'wo-1',
          taskPrompt: 'Task 1',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'abc',
          verificationPassed: true,
          startedAt: '2024-01-15T10:00:00.000Z',
          completedAt: '2024-01-15T10:10:00.000Z',
          artifactsPath: '/mock/runs/run-1',
        })
        .mockResolvedValueOnce(null) // No summary for orphaned run
        .mockResolvedValueOnce({
          runId: 'run-2',
          workOrderId: 'wo-2',
          taskPrompt: 'Task 2',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'def',
          verificationPassed: true,
          startedAt: '2024-01-15T11:00:00.000Z',
          completedAt: '2024-01-15T11:10:00.000Z',
          artifactsPath: '/mock/runs/run-2',
        });

      const result = await listRuns();

      expect(result).toHaveLength(2);
      expect(result.find(r => r.runId === 'run-orphaned')).toBeUndefined();
    });

    it('should return empty array when runs directory does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(readdir).mockRejectedValue(error);

      const result = await listRuns();

      expect(result).toEqual([]);
    });

    it('should throw error for non-ENOENT errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(readdir).mockRejectedValue(error);

      await expect(listRuns()).rejects.toThrow('Permission denied');
    });

    it('should return empty array when no runs exist', async () => {
      vi.mocked(readdir).mockResolvedValue([]);

      const result = await listRuns();

      expect(result).toEqual([]);
    });
  });

  describe('listIterations', () => {
    it('should list iterations sorted in ascending order', async () => {
      const dirents = [
        createMockDirent('3', true),
        createMockDirent('1', true),
        createMockDirent('2', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await listIterations('run-123');

      expect(result).toEqual([1, 2, 3]);
    });

    it('should filter out non-numeric directory names', async () => {
      const dirents = [
        createMockDirent('1', true),
        createMockDirent('temp', true), // Non-numeric
        createMockDirent('2', true),
        createMockDirent('backup', true), // Non-numeric
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await listIterations('run-123');

      expect(result).toEqual([1, 2]);
    });

    it('should filter out non-directory entries', async () => {
      const dirents = [
        createMockDirent('1', true),
        createMockDirent('2', false), // File
        createMockDirent('3', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await listIterations('run-123');

      expect(result).toEqual([1, 3]);
    });

    it('should return empty array when iterations directory does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(readdir).mockRejectedValue(error);

      const result = await listIterations('run-123');

      expect(result).toEqual([]);
    });

    it('should throw error for non-ENOENT errors', async () => {
      const error = new Error('Permission denied') as NodeJS.ErrnoException;
      error.code = 'EACCES';
      vi.mocked(readdir).mockRejectedValue(error);

      await expect(listIterations('run-123')).rejects.toThrow('Permission denied');
    });

    it('should return empty array when no iterations exist', async () => {
      vi.mocked(readdir).mockResolvedValue([]);

      const result = await listIterations('run-123');

      expect(result).toEqual([]);
    });
  });

  describe('getLatestIteration', () => {
    it('should return the highest iteration number', async () => {
      const dirents = [
        createMockDirent('1', true),
        createMockDirent('5', true),
        createMockDirent('3', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await getLatestIteration('run-123');

      expect(result).toBe(5);
    });

    it('should return 0 when no iterations exist', async () => {
      vi.mocked(readdir).mockResolvedValue([]);

      const result = await getLatestIteration('run-123');

      expect(result).toBe(0);
    });

    it('should return 0 when iterations directory does not exist', async () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      vi.mocked(readdir).mockRejectedValue(error);

      const result = await getLatestIteration('run-123');

      expect(result).toBe(0);
    });

    it('should handle single iteration', async () => {
      const dirents = [createMockDirent('1', true)];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await getLatestIteration('run-123');

      expect(result).toBe(1);
    });
  });

  describe('Error handling for corrupted JSON', () => {
    it('should propagate JSON parse errors from readJson', async () => {
      const jsonError = new SyntaxError('Unexpected token');
      vi.mocked(readJson).mockRejectedValue(jsonError);

      await expect(loadRunMetadata('run-123')).rejects.toThrow('Unexpected token');
    });

    it('should propagate JSON parse errors when loading iteration metadata', async () => {
      const jsonError = new SyntaxError('Invalid JSON');
      vi.mocked(readJson).mockRejectedValue(jsonError);

      await expect(loadIterationMetadata('run-123', 1)).rejects.toThrow('Invalid JSON');
    });

    it('should propagate JSON parse errors when loading verification report', async () => {
      const jsonError = new SyntaxError('Malformed JSON');
      vi.mocked(readJson).mockRejectedValue(jsonError);

      await expect(loadVerificationReport('run-123', 1)).rejects.toThrow('Malformed JSON');
    });

    it('should propagate JSON parse errors when loading gate plan', async () => {
      const jsonError = new SyntaxError('Bad JSON format');
      vi.mocked(readJson).mockRejectedValue(jsonError);

      await expect(loadGatePlan('run-123')).rejects.toThrow('Bad JSON format');
    });

    it('should propagate JSON parse errors when loading run summary', async () => {
      const jsonError = new SyntaxError('Corrupted JSON');
      vi.mocked(readJson).mockRejectedValue(jsonError);

      await expect(loadRunSummary('run-123')).rejects.toThrow('Corrupted JSON');
    });
  });

  describe('Edge cases', () => {
    it('should handle run with all null optional fields', async () => {
      const storedRun = {
        id: 'run-minimal',
        workOrderId: 'wo-1',
        workspaceId: 'ws-1',
        iteration: 0,
        maxIterations: 1,
        state: 'queued',
        snapshotBeforeSha: null,
        snapshotAfterSha: null,
        snapshotIds: [],
        startedAt: '2024-01-15T10:00:00.000Z',
        completedAt: null,
        result: null,
        error: null,
        sessionId: null,
        gitHubBranch: null,
        gitHubPrUrl: null,
        gitHubPrNumber: null,
        warnings: [],
        ciEnabled: false,
        ciIterationCount: 0,
        maxCiIterations: 0,
        ciStatus: null,
        ciPollingStartedAt: null,
        ciCompletedAt: null,
        ciWorkflowUrl: null,
      };

      vi.mocked(readJson).mockResolvedValue(storedRun);

      const result = await loadRunMetadata('run-minimal');

      expect(result).not.toBeNull();
      expect(result!.completedAt).toBeNull();
      expect(result!.snapshotBeforeSha).toBeNull();
      expect(result!.sessionId).toBeNull();
    });

    it('should handle iteration with zero duration', async () => {
      const storedData = {
        iteration: 1,
        state: 'succeeded',
        snapshotId: null,
        verificationPassed: true,
        feedbackGenerated: false,
        startedAt: '2024-01-15T10:00:00.000Z',
        completedAt: '2024-01-15T10:00:00.000Z', // Same as startedAt
        durationMs: 0,
        agentSessionId: null,
        agentResultFile: null,
        agentDurationMs: null,
        agentSuccess: null,
        agentModel: null,
        agentTokensUsed: null,
        agentCostUsd: null,
        verificationFile: null,
        verificationLevelsRun: [],
        verificationDurationMs: null,
        errorType: 'none',
        errorMessage: null,
        errorDetails: null,
      };

      vi.mocked(readJson).mockResolvedValue(storedData);

      const result = await loadIterationMetadata('run-123', 1);

      expect(result!.durationMs).toBe(0);
    });

    it('should handle empty agent logs', async () => {
      vi.mocked(readLog).mockResolvedValue('');

      const result = await loadAgentLogs('run-123', 1);

      expect(result).toBe('');
    });

    it('should handle listRuns with only file entries (no directories)', async () => {
      const dirents = [
        createMockDirent('file1.txt', false),
        createMockDirent('file2.json', false),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await listRuns();

      expect(result).toEqual([]);
    });

    it('should handle listIterations with only non-numeric directories', async () => {
      const dirents = [
        createMockDirent('temp', true),
        createMockDirent('backup', true),
        createMockDirent('old', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await listIterations('run-123');

      expect(result).toEqual([]);
    });

    it('should handle runs with same startedAt timestamp (stable sort)', async () => {
      const sameTimestamp = '2024-01-15T10:00:00.000Z';
      const dirents = [
        createMockDirent('run-a', true),
        createMockDirent('run-b', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      vi.mocked(readJson)
        .mockResolvedValueOnce({
          runId: 'run-a',
          workOrderId: 'wo-a',
          taskPrompt: 'Task A',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'abc',
          verificationPassed: true,
          startedAt: sameTimestamp,
          completedAt: '2024-01-15T10:10:00.000Z',
          artifactsPath: '/mock/runs/run-a',
        })
        .mockResolvedValueOnce({
          runId: 'run-b',
          workOrderId: 'wo-b',
          taskPrompt: 'Task B',
          workspacePath: '/workspace',
          status: 'succeeded',
          iterations: 1,
          duration: 1000,
          finalSnapshotSha: 'def',
          verificationPassed: true,
          startedAt: sameTimestamp,
          completedAt: '2024-01-15T10:10:00.000Z',
          artifactsPath: '/mock/runs/run-b',
        });

      const result = await listRuns();

      expect(result).toHaveLength(2);
      // Both runs exist, order is stable based on sort behavior
    });

    it('should handle large iteration numbers', async () => {
      const dirents = [
        createMockDirent('999', true),
        createMockDirent('1000', true),
        createMockDirent('1', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await listIterations('run-123');

      expect(result).toEqual([1, 999, 1000]);
    });

    it('should handle getLatestIteration with large iteration numbers', async () => {
      const dirents = [
        createMockDirent('50', true),
        createMockDirent('999', true),
        createMockDirent('100', true),
      ];

      vi.mocked(readdir).mockResolvedValue(dirents as Dirent[]);

      const result = await getLatestIteration('run-123');

      expect(result).toBe(999);
    });
  });
});
