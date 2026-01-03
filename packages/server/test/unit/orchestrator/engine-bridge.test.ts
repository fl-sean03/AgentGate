/**
 * Engine Bridge Unit Tests
 * v0.2.26: Tests for the service factory that bridges orchestrator callbacks to ExecutionEngine
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createServicesFromCallbacks,
  captureInitialBeforeState,
  type ServiceFactoryOptions,
} from '../../../src/orchestrator/engine-bridge.js';
import type { Workspace, GatePlan, WorkOrder, BeforeState, Snapshot, VerificationReport } from '../../../src/types/index.js';

// Mock the dynamic imports
vi.mock('../../../src/agent/defaults.js', () => ({
  EMPTY_CONTEXT_POINTERS: {
    files: [],
    urls: [],
    instructions: [],
  },
  DEFAULT_AGENT_CONSTRAINTS: {
    maxTokens: 100000,
    maxOutputTokens: 16000,
    temperature: 0.7,
  },
}));

vi.mock('../../../src/gate/summary.js', () => ({
  generateGateSummary: vi.fn().mockReturnValue('Gate summary: L0, L1, L2 checks'),
}));

vi.mock('../../../src/snapshot/snapshotter.js', () => ({
  captureBeforeState: vi.fn().mockResolvedValue({
    sha: 'abc123',
    branch: 'main',
    isDirty: false,
    capturedAt: new Date(),
  }),
  captureAfterState: vi.fn().mockResolvedValue({
    id: 'snapshot-1',
    runId: 'run-1',
    iteration: 1,
    beforeSha: 'abc123',
    afterSha: 'def456',
    branch: 'main',
    commitMessage: 'Test commit',
    patchPath: null,
    filesChanged: 3,
    insertions: 10,
    deletions: 2,
    createdAt: new Date(),
  }),
}));

vi.mock('../../../src/verifier/verifier.js', () => ({
  verify: vi.fn().mockResolvedValue({
    id: 'report-1',
    snapshotId: 'snapshot-1',
    runId: 'run-1',
    iteration: 1,
    passed: true,
    l0Result: { level: 'L0', passed: true, checks: [], duration: 10 },
    l1Result: { level: 'L1', passed: true, checks: [], duration: 100 },
    l2Result: { level: 'L2', passed: true, checks: [], duration: 0 },
    l3Result: { level: 'L3', passed: true, checks: [], duration: 0 },
    logs: '',
    diagnostics: [],
    totalDuration: 110,
    createdAt: new Date(),
  }),
}));

vi.mock('../../../src/feedback/generator.js', () => ({
  generateFeedback: vi.fn().mockReturnValue({
    iteration: 1,
    passed: false,
    summary: 'Test failed',
    failures: [],
    suggestions: [],
  }),
}));

vi.mock('../../../src/feedback/formatter.js', () => ({
  formatForAgent: vi.fn().mockReturnValue('Formatted feedback for agent'),
}));

vi.mock('../../../src/orchestrator/result-persister.js', () => ({
  resultPersister: {
    saveAgentResult: vi.fn().mockResolvedValue('/path/to/result.json'),
    saveVerificationReport: vi.fn().mockResolvedValue('/path/to/report.json'),
  },
}));

describe('Engine Bridge', () => {
  // Test fixtures
  const mockWorkspace: Workspace = {
    id: 'workspace-1',
    rootPath: '/tmp/workspace',
    source: { type: 'local', path: '/tmp/workspace' },
    leaseId: null,
    leasedAt: null,
    status: 'leased',
    gitInitialized: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockGatePlan: GatePlan = {
    id: 'gate-plan-1',
    source: 'default',
    sourceFile: null,
    environment: {
      runtime: 'node',
      runtimeVersion: '20',
      setupCommands: [],
    },
    contracts: {
      requiredFiles: [],
      requiredSchemas: [],
      forbiddenPatterns: [],
      namingConventions: [],
    },
    tests: [
      { name: 'test1', command: 'npm test', timeout: 60, expectedExit: 0 },
    ],
    blackbox: [],
    policy: {
      networkAllowed: false,
      maxRuntimeSeconds: 300,
      maxDiskMb: null,
      disallowedCommands: [],
    },
  };

  const mockWorkOrder: WorkOrder = {
    id: 'work-order-1',
    taskPrompt: 'Add a hello world function',
    workspaceSource: { type: 'local', path: '/tmp/workspace' },
    gatePlanSource: { type: 'default' },
    maxIterations: 3,
    maxWallClockSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'pending',
  };

  const mockDriver = {
    execute: vi.fn().mockResolvedValue({
      success: true,
      exitCode: 0,
      stdout: 'Task completed',
      stderr: '',
      structuredOutput: null,
      sessionId: 'session-123',
      tokensUsed: 500,
      durationMs: 1000,
    }),
  };

  let factoryOptions: ServiceFactoryOptions;

  beforeEach(() => {
    vi.clearAllMocks();
    factoryOptions = {
      driver: mockDriver,
      workspace: mockWorkspace,
      gatePlan: mockGatePlan,
      workOrder: mockWorkOrder,
      spawnLimits: null,
    };
  });

  describe('createServicesFromCallbacks', () => {
    it('should create all required services', () => {
      const services = createServicesFromCallbacks(factoryOptions);

      expect(services).toBeDefined();
      expect(services.agentDriver).toBeDefined();
      expect(services.snapshotter).toBeDefined();
      expect(services.verifier).toBeDefined();
      expect(services.feedbackGenerator).toBeDefined();
      expect(services.resultPersister).toBeDefined();
    });

    it('should create AgentDriver that calls underlying driver', async () => {
      const services = createServicesFromCallbacks(factoryOptions);

      const request = {
        workspacePath: '/tmp/workspace',
        taskPrompt: 'Test prompt',
        feedback: null,
        sessionId: null,
        iteration: 1,
      };

      const result = await services.agentDriver.execute(request);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-123');
      expect(mockDriver.execute).toHaveBeenCalled();
    });

    it('should create AgentDriver with spawn limits when provided', async () => {
      const spawnLimits = {
        maxDepth: 3,
        maxChildren: 5,
        maxTotalDescendants: 20,
      };

      factoryOptions.spawnLimits = spawnLimits;
      const services = createServicesFromCallbacks(factoryOptions);

      const request = {
        workspacePath: '/tmp/workspace',
        taskPrompt: 'Test prompt',
        feedback: null,
        sessionId: null,
        iteration: 1,
      };

      await services.agentDriver.execute(request);

      expect(mockDriver.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          spawnLimits,
        })
      );
    });

    it('should create AgentDriver cancel method that logs warning', async () => {
      const services = createServicesFromCallbacks(factoryOptions);

      // Should not throw
      await expect(services.agentDriver.cancel('session-123')).resolves.toBeUndefined();
    });

    it('should create Snapshotter that captures state', async () => {
      const services = createServicesFromCallbacks(factoryOptions);

      const beforeState: BeforeState = {
        sha: 'abc123',
        branch: 'main',
        isDirty: false,
        capturedAt: new Date(),
      };

      const snapshot = await services.snapshotter.capture(
        '/tmp/workspace',
        beforeState,
        { runId: 'run-1', iteration: 1, taskPrompt: 'Test' }
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBe('snapshot-1');
      expect(snapshot.runId).toBe('run-1');
    });

    it('should create Verifier that runs verification', async () => {
      const services = createServicesFromCallbacks(factoryOptions);

      const snapshot: Snapshot = {
        id: 'snapshot-1',
        runId: 'run-1',
        iteration: 1,
        beforeSha: 'abc123',
        afterSha: 'def456',
        branch: 'main',
        commitMessage: 'Test',
        patchPath: null,
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        createdAt: new Date(),
      };

      const report = await services.verifier.verify(
        snapshot,
        mockGatePlan,
        { runId: 'run-1', iteration: 1 }
      );

      expect(report).toBeDefined();
      expect(report.passed).toBe(true);
    });

    it('should create FeedbackGenerator that formats feedback', async () => {
      const services = createServicesFromCallbacks(factoryOptions);

      const snapshot: Snapshot = {
        id: 'snapshot-1',
        runId: 'run-1',
        iteration: 1,
        beforeSha: 'abc123',
        afterSha: 'def456',
        branch: 'main',
        commitMessage: 'Test',
        patchPath: null,
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        createdAt: new Date(),
      };

      const report: VerificationReport = {
        id: 'report-1',
        snapshotId: 'snapshot-1',
        runId: 'run-1',
        iteration: 1,
        passed: false,
        l0Result: { level: 'L0', passed: true, checks: [], duration: 10 },
        l1Result: { level: 'L1', passed: false, checks: [], duration: 100 },
        l2Result: { level: 'L2', passed: true, checks: [], duration: 0 },
        l3Result: { level: 'L3', passed: true, checks: [], duration: 0 },
        logs: '',
        diagnostics: [],
        totalDuration: 110,
        createdAt: new Date(),
      };

      const feedback = await services.feedbackGenerator.generate(
        snapshot,
        report,
        mockGatePlan,
        { runId: 'run-1', iteration: 1 }
      );

      expect(feedback).toBe('Formatted feedback for agent');
    });

    it('should create ResultPersister that saves results', async () => {
      const services = createServicesFromCallbacks(factoryOptions);

      const agentResult = {
        success: true,
        exitCode: 0,
        stdout: 'Done',
        stderr: '',
        structuredOutput: null,
        sessionId: 'session-1',
        tokensUsed: 100,
        durationMs: 500,
      };

      const path = await services.resultPersister.saveAgentResult('run-1', 1, agentResult);
      expect(path).toBe('/path/to/result.json');
    });

    it('should handle ResultPersister errors gracefully', async () => {
      const { resultPersister } = await import('../../../src/orchestrator/result-persister.js');
      vi.mocked(resultPersister.saveAgentResult).mockRejectedValueOnce(new Error('Save failed'));

      const services = createServicesFromCallbacks(factoryOptions);

      const path = await services.resultPersister.saveAgentResult('run-1', 1, {} as never);
      expect(path).toBeNull();
    });

    it('should pass skipVerification from work order to verifier', async () => {
      const workOrderWithSkip = {
        ...mockWorkOrder,
        skipVerification: ['L2', 'L3'],
      };
      factoryOptions.workOrder = workOrderWithSkip;

      const services = createServicesFromCallbacks(factoryOptions);

      const snapshot: Snapshot = {
        id: 'snapshot-1',
        runId: 'run-1',
        iteration: 1,
        beforeSha: 'abc123',
        afterSha: 'def456',
        branch: 'main',
        commitMessage: 'Test',
        patchPath: null,
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
        createdAt: new Date(),
      };

      await services.verifier.verify(
        snapshot,
        mockGatePlan,
        { runId: 'run-1', iteration: 1 }
      );

      const { verify } = await import('../../../src/verifier/verifier.js');
      expect(verify).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: ['L2', 'L3'],
        })
      );
    });
  });

  describe('captureInitialBeforeState', () => {
    it('should capture before state from workspace', async () => {
      const beforeState = await captureInitialBeforeState(mockWorkspace);

      expect(beforeState).toBeDefined();
      expect(beforeState.sha).toBe('abc123');
      expect(beforeState.branch).toBe('main');
    });
  });
});
