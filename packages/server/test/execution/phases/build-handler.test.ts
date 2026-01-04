/**
 * Tests for Build Phase Handler
 * Covers: successful execution, timeout handling, session ID management,
 * error handling/recovery, and log capture
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuildPhaseHandler, type BuildPhaseOptions } from '../../../src/execution/phases/build-handler.js';
import {
  type PhaseContext,
  type PhaseServices,
  type BuildPhaseInput,
  type AgentDriver,
  Phase,
} from '../../../src/execution/phases/types.js';
import type { AgentResult } from '../../../src/types/index.js';
import type { Logger } from 'pino';

// Mock logger factory
function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

// Mock agent driver factory
function createMockAgentDriver(
  executeResult: Partial<AgentResult> = {}
): AgentDriver {
  const defaultResult: AgentResult = {
    success: true,
    exitCode: 0,
    stdout: 'Agent output',
    stderr: '',
    structuredOutput: null,
    sessionId: 'session-123',
    tokensUsed: { input: 100, output: 50 },
    durationMs: 1000,
  };

  return {
    execute: vi.fn().mockResolvedValue({ ...defaultResult, ...executeResult }),
    cancel: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock result persister factory
function createMockResultPersister() {
  return {
    saveAgentResult: vi.fn().mockResolvedValue('result-123'),
    saveVerificationReport: vi.fn().mockResolvedValue('report-123'),
    saveSnapshot: vi.fn().mockResolvedValue('snapshot-123'),
  };
}

// Mock phase services factory
function createMockServices(
  agentDriverOverrides: Partial<AgentResult> = {}
): PhaseServices {
  return {
    agentDriver: createMockAgentDriver(agentDriverOverrides),
    snapshotter: { capture: vi.fn() },
    verifier: { verify: vi.fn() },
    feedbackGenerator: { generate: vi.fn() },
    resultPersister: createMockResultPersister(),
  };
}

// Create mock phase context
function createMockContext(
  overrides: Partial<PhaseContext> = {},
  agentDriverOverrides: Partial<AgentResult> = {}
): PhaseContext {
  const services = createMockServices(agentDriverOverrides);

  return {
    workOrderId: 'wo-123',
    runId: 'run-123',
    iteration: 1,
    taskSpec: {
      apiVersion: 'agentgate.io/v1',
      kind: 'TaskSpec',
      metadata: { name: 'test-task' },
      spec: {
        goal: { prompt: 'Test task' },
        convergence: {
          strategy: { type: 'fixed' as const },
          limits: { maxIterations: 3 },
        },
        execution: {
          workspace: { type: 'local' as const, path: '/workspace' },
          sandbox: { provider: 'subprocess' as const },
          agent: { driver: 'claude-code' as const },
        },
        delivery: { git: { mode: 'commit' as const } },
      },
      _resolved: true as const,
      _hash: 'abc123',
      _resolvedAt: new Date(),
      _source: { type: 'inline' as const },
    },
    workspace: {
      id: 'ws-123',
      rootPath: '/workspace/test',
      source: { type: 'local' as const, path: '/workspace/test' },
      leaseId: null,
      leasedAt: null,
      status: 'available' as const,
      gitInitialized: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    run: {
      id: 'run-123',
      workOrderId: 'wo-123',
      workspaceId: 'ws-123',
      state: 'building' as const,
      iteration: 1,
      maxIterations: 3,
      startedAt: new Date(),
      updatedAt: new Date(),
      history: [],
    },
    beforeState: {
      headCommit: 'abc123',
      branchName: 'main',
      trackedFiles: [],
      timestamp: new Date().toISOString(),
    },
    services,
    logger: createMockLogger(),
    ...overrides,
  };
}

describe('BuildPhaseHandler', () => {
  let handler: BuildPhaseHandler;

  beforeEach(() => {
    handler = new BuildPhaseHandler();
  });

  describe('constructor', () => {
    it('should use default timeout when no options provided', () => {
      const defaultHandler = new BuildPhaseHandler();
      expect(defaultHandler.name).toBe('build');
      expect(defaultHandler.phase).toBe(Phase.BUILD);
    });

    it('should accept custom timeout option', () => {
      const customHandler = new BuildPhaseHandler({ defaultTimeoutMs: 60000 });
      expect(customHandler.name).toBe('build');
    });
  });

  describe('validate', () => {
    it('should pass validation with valid input', () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = handler.validate(context, input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when taskPrompt is empty', () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: '',
        feedback: null,
        sessionId: null,
      };

      const result = handler.validate(context, input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Task prompt is required');
    });

    it('should fail validation when taskPrompt is whitespace only', () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: '   ',
        feedback: null,
        sessionId: null,
      };

      const result = handler.validate(context, input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Task prompt is required');
    });

    it('should fail validation when workspace rootPath is missing', () => {
      const context = createMockContext({
        workspace: {
          id: 'ws-123',
          rootPath: '',
          source: { type: 'local' as const, path: '' },
          leaseId: null,
          leasedAt: null,
          status: 'available' as const,
          gitInitialized: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Test task',
        feedback: null,
        sessionId: null,
      };

      const result = handler.validate(context, input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Workspace path is required');
    });
  });

  describe('execute - successful agent execution', () => {
    it('should execute agent successfully and return result', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('session-123');
      expect(result.agentResult).toBeDefined();
      expect(result.agentResult?.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should pass correct request to agent driver', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: 'Previous error: type mismatch',
        sessionId: 'prev-session',
      };

      await handler.execute(context, input);

      const agentDriver = context.services.agentDriver;
      expect(agentDriver.execute).toHaveBeenCalledTimes(1);

      const request = vi.mocked(agentDriver.execute).mock.calls[0]![0];
      expect(request.workspacePath).toBe('/workspace/test');
      expect(request.taskPrompt).toBe('Fix the bug');
      expect(request.feedback).toBe('Previous error: type mismatch');
      expect(request.sessionId).toBe('prev-session');
      expect(request.iteration).toBe(1);
    });

    it('should persist agent result after execution', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      expect(context.services.resultPersister.saveAgentResult).toHaveBeenCalledWith(
        'run-123',
        1,
        expect.objectContaining({ success: true })
      );
    });

    it('should log start and completion messages', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      expect(context.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-123',
          iteration: 1,
          hasFeedback: false,
          hasSessionId: false,
        }),
        'Build phase started'
      );

      expect(context.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-123',
          iteration: 1,
          success: true,
          sessionId: 'session-123',
        }),
        'Build phase completed'
      );
    });
  });

  describe('execute - session ID management', () => {
    it('should use session ID from agent result when available', async () => {
      const context = createMockContext({}, { sessionId: 'new-session-456' });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: 'old-session-123',
      };

      const result = await handler.execute(context, input);

      expect(result.sessionId).toBe('new-session-456');
    });

    it('should fall back to input session ID when agent result has none', async () => {
      const context = createMockContext({}, { sessionId: null });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: 'input-session',
      };

      const result = await handler.execute(context, input);

      expect(result.sessionId).toBe('input-session');
    });

    it('should use "unknown" when no session ID is available', async () => {
      const context = createMockContext({}, { sessionId: null });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.sessionId).toBe('unknown');
    });
  });

  describe('execute - agent timeout handling', () => {
    it('should detect timeout error from agent stderr', async () => {
      const context = createMockContext(
        {},
        {
          success: false,
          stderr: 'Error: Agent execution timeout exceeded',
          sessionId: 'timeout-session',
        }
      );
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.buildError).toBeDefined();
      expect(result.buildError?.type).toBe('agent_timeout');
      expect(result.buildError?.recoverable).toBe(true);
    });

    it('should use custom timeout from task spec when provided', async () => {
      const context = createMockContext({
        taskSpec: {
          apiVersion: 'agentgate.io/v1',
          kind: 'TaskSpec',
          metadata: { name: 'test-task' },
          spec: {
            goal: { prompt: 'Test task' },
            convergence: {
              strategy: { type: 'fixed' as const },
              limits: { maxIterations: 3, maxWallClock: '2h' },
            },
            execution: {
              workspace: { type: 'local' as const, path: '/workspace' },
              sandbox: { provider: 'subprocess' as const },
              agent: { driver: 'claude-code' as const },
            },
            delivery: { git: { mode: 'commit' as const } },
          },
          _resolved: true as const,
          _hash: 'abc123',
          _resolvedAt: new Date(),
          _source: { type: 'inline' as const },
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const agentDriver = context.services.agentDriver;
      const request = vi.mocked(agentDriver.execute).mock.calls[0]![0];
      expect(request.timeoutMs).toBe(2 * 60 * 60 * 1000); // 2 hours in ms
    });

    it('should use default timeout when task spec has no maxWallClock', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const agentDriver = context.services.agentDriver;
      const request = vi.mocked(agentDriver.execute).mock.calls[0]![0];
      expect(request.timeoutMs).toBe(300000); // Default 5 minutes
    });
  });

  describe('execute - error handling and recovery', () => {
    it('should handle agent failure result', async () => {
      const context = createMockContext(
        {},
        {
          success: false,
          stderr: 'Agent execution failed: Unable to complete task',
          stdout: 'Partial output before failure',
          sessionId: 'failed-session',
        }
      );
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.buildError).toBeDefined();
      expect(result.buildError?.type).toBe('agent_failure');
      expect(result.buildError?.message).toBe('Agent execution failed: Unable to complete task');
      expect(result.buildError?.agentOutput).toBe('Partial output before failure');
      expect(result.buildError?.recoverable).toBe(true);
    });

    it('should handle agent crash error', async () => {
      const context = createMockContext(
        {},
        {
          success: false,
          stderr: 'Agent crash: Segmentation fault',
          sessionId: 'crashed-session',
        }
      );
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.buildError?.type).toBe('agent_crash');
      expect(result.buildError?.recoverable).toBe(false);
    });

    it('should handle exception during agent execution', async () => {
      const services = createMockServices();
      vi.mocked(services.agentDriver.execute).mockRejectedValue(
        new Error('Network connection failed')
      );
      const context = createMockContext({ services });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: 'prev-session',
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.buildError?.type).toBe('exception');
      expect(result.buildError?.message).toBe('Network connection failed');
      expect(result.sessionId).toBe('prev-session');
    });

    it('should handle non-Error exception', async () => {
      const services = createMockServices();
      vi.mocked(services.agentDriver.execute).mockRejectedValue('String error');
      const context = createMockContext({ services });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.buildError?.message).toBe('String error');
    });

    it('should log error when exception occurs', async () => {
      const services = createMockServices();
      const testError = new Error('Test exception');
      vi.mocked(services.agentDriver.execute).mockRejectedValue(testError);
      const context = createMockContext({ services });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      expect(context.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: 'run-123',
          iteration: 1,
          error: testError,
        }),
        'Build phase failed with exception'
      );
    });

    it('should handle validation failure in execute', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: '', // Invalid: empty prompt
        feedback: null,
        sessionId: 'some-session',
      };

      const result = await handler.execute(context, input);

      expect(result.success).toBe(false);
      expect(result.buildError?.type).toBe('agent_failure');
      expect(result.buildError?.message).toContain('Validation failed');
      expect(result.sessionId).toBe('some-session');
    });
  });

  describe('execute - log capture', () => {
    it('should capture stdout from agent result', async () => {
      const context = createMockContext(
        {},
        {
          success: true,
          stdout: 'Step 1: Analyzed codebase\nStep 2: Fixed bug\nStep 3: Added tests',
        }
      );
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.agentResult?.stdout).toBe(
        'Step 1: Analyzed codebase\nStep 2: Fixed bug\nStep 3: Added tests'
      );
    });

    it('should capture stderr from agent result', async () => {
      const context = createMockContext(
        {},
        {
          success: false,
          stderr: 'Warning: Deprecated API usage\nError: Type mismatch',
        }
      );
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.buildError?.message).toBe('Warning: Deprecated API usage\nError: Type mismatch');
    });

    it('should include agent output in build error', async () => {
      const context = createMockContext(
        {},
        {
          success: false,
          stdout: 'Partial work completed before failure',
          stderr: 'Error: out of memory',
        }
      );
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.buildError?.agentOutput).toBe('Partial work completed before failure');
    });
  });

  describe('execute - agent constraints', () => {
    it('should include maxTokens constraint when specified in task spec', async () => {
      const context = createMockContext({
        taskSpec: {
          apiVersion: 'agentgate.io/v1',
          kind: 'TaskSpec',
          metadata: { name: 'test-task' },
          spec: {
            goal: { prompt: 'Test task' },
            convergence: {
              strategy: { type: 'fixed' as const },
              limits: { maxIterations: 3 },
            },
            execution: {
              workspace: { type: 'local' as const, path: '/workspace' },
              sandbox: { provider: 'subprocess' as const },
              agent: { driver: 'claude-code' as const, maxTokens: 10000 },
            },
            delivery: { git: { mode: 'commit' as const } },
          },
          _resolved: true as const,
          _hash: 'abc123',
          _resolvedAt: new Date(),
          _source: { type: 'inline' as const },
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const agentDriver = context.services.agentDriver;
      const request = vi.mocked(agentDriver.execute).mock.calls[0]![0];
      expect(request.constraints?.maxTokens).toBe(10000);
    });

    it('should not include constraints when maxTokens not specified', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const agentDriver = context.services.agentDriver;
      const request = vi.mocked(agentDriver.execute).mock.calls[0]![0];
      expect(request.constraints).toBeUndefined();
    });
  });

  describe('execute - timeout parsing', () => {
    it('should parse seconds timeout', async () => {
      const context = createMockContext({
        taskSpec: {
          apiVersion: 'agentgate.io/v1',
          kind: 'TaskSpec',
          metadata: { name: 'test-task' },
          spec: {
            goal: { prompt: 'Test task' },
            convergence: {
              strategy: { type: 'fixed' as const },
              limits: { maxIterations: 3, maxWallClock: '30s' },
            },
            execution: {
              workspace: { type: 'local' as const, path: '/workspace' },
              sandbox: { provider: 'subprocess' as const },
              agent: { driver: 'claude-code' as const },
            },
            delivery: { git: { mode: 'commit' as const } },
          },
          _resolved: true as const,
          _hash: 'abc123',
          _resolvedAt: new Date(),
          _source: { type: 'inline' as const },
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const request = vi.mocked(context.services.agentDriver.execute).mock.calls[0]![0];
      expect(request.timeoutMs).toBe(30 * 1000);
    });

    it('should parse minutes timeout', async () => {
      const context = createMockContext({
        taskSpec: {
          apiVersion: 'agentgate.io/v1',
          kind: 'TaskSpec',
          metadata: { name: 'test-task' },
          spec: {
            goal: { prompt: 'Test task' },
            convergence: {
              strategy: { type: 'fixed' as const },
              limits: { maxIterations: 3, maxWallClock: '45m' },
            },
            execution: {
              workspace: { type: 'local' as const, path: '/workspace' },
              sandbox: { provider: 'subprocess' as const },
              agent: { driver: 'claude-code' as const },
            },
            delivery: { git: { mode: 'commit' as const } },
          },
          _resolved: true as const,
          _hash: 'abc123',
          _resolvedAt: new Date(),
          _source: { type: 'inline' as const },
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const request = vi.mocked(context.services.agentDriver.execute).mock.calls[0]![0];
      expect(request.timeoutMs).toBe(45 * 60 * 1000);
    });

    it('should parse days timeout', async () => {
      const context = createMockContext({
        taskSpec: {
          apiVersion: 'agentgate.io/v1',
          kind: 'TaskSpec',
          metadata: { name: 'test-task' },
          spec: {
            goal: { prompt: 'Test task' },
            convergence: {
              strategy: { type: 'fixed' as const },
              limits: { maxIterations: 3, maxWallClock: '1d' },
            },
            execution: {
              workspace: { type: 'local' as const, path: '/workspace' },
              sandbox: { provider: 'subprocess' as const },
              agent: { driver: 'claude-code' as const },
            },
            delivery: { git: { mode: 'commit' as const } },
          },
          _resolved: true as const,
          _hash: 'abc123',
          _resolvedAt: new Date(),
          _source: { type: 'inline' as const },
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const request = vi.mocked(context.services.agentDriver.execute).mock.calls[0]![0];
      expect(request.timeoutMs).toBe(24 * 60 * 60 * 1000);
    });

    it('should use default timeout for invalid format', async () => {
      const context = createMockContext({
        taskSpec: {
          apiVersion: 'agentgate.io/v1',
          kind: 'TaskSpec',
          metadata: { name: 'test-task' },
          spec: {
            goal: { prompt: 'Test task' },
            convergence: {
              strategy: { type: 'fixed' as const },
              limits: { maxIterations: 3, maxWallClock: 'invalid' },
            },
            execution: {
              workspace: { type: 'local' as const, path: '/workspace' },
              sandbox: { provider: 'subprocess' as const },
              agent: { driver: 'claude-code' as const },
            },
            delivery: { git: { mode: 'commit' as const } },
          },
          _resolved: true as const,
          _hash: 'abc123',
          _resolvedAt: new Date(),
          _source: { type: 'inline' as const },
        },
      });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      const request = vi.mocked(context.services.agentDriver.execute).mock.calls[0]![0];
      expect(request.timeoutMs).toBe(300000); // Default 5 minutes
    });
  });

  describe('execute - streaming callback', () => {
    it('should pass streaming callback to agent driver', async () => {
      const streamingCallback = vi.fn();
      const context = createMockContext({ streamingCallback });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      expect(context.services.agentDriver.execute).toHaveBeenCalledWith(
        expect.any(Object),
        streamingCallback
      );
    });

    it('should pass undefined when no streaming callback provided', async () => {
      const context = createMockContext({ streamingCallback: undefined });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      await handler.execute(context, input);

      expect(context.services.agentDriver.execute).toHaveBeenCalledWith(
        expect.any(Object),
        undefined
      );
    });
  });

  describe('execute - result duration tracking', () => {
    it('should include duration in successful result', async () => {
      const context = createMockContext();
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should include duration in error result', async () => {
      const services = createMockServices();
      vi.mocked(services.agentDriver.execute).mockRejectedValue(new Error('Test error'));
      const context = createMockContext({ services });
      const input: BuildPhaseInput = {
        taskPrompt: 'Fix the bug',
        feedback: null,
        sessionId: null,
      };

      const result = await handler.execute(context, input);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});
