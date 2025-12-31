/**
 * CLI Exec Command Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExecCommand, executeExec } from '../src/control-plane/commands/exec.js';
import { workOrderService } from '../src/control-plane/work-order-service.js';
import { createOrchestrator } from '../src/orchestrator/orchestrator.js';
import { WorkOrderStatus, RunResult, RunState, type WorkOrder, type Run } from '../src/types/index.js';

// Mock dependencies
vi.mock('../src/control-plane/work-order-service.js');
vi.mock('../src/orchestrator/orchestrator.js');
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
}));

describe('CLI Exec Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createExecCommand', () => {
    it('should create a command with correct name and description', () => {
      const command = createExecCommand();
      expect(command.name()).toBe('exec');
      expect(command.description()).toBe('Submit and execute a work order immediately');
    });

    it('should have required prompt option', () => {
      const command = createExecCommand();
      const options = command.options;
      const promptOption = options.find((opt) => opt.long === '--prompt');
      expect(promptOption).toBeDefined();
      expect(promptOption?.required).toBe(true);
    });

    it('should have all submit command options', () => {
      const command = createExecCommand();
      const optionNames = command.options.map((opt) => opt.long);

      // Check for key options
      expect(optionNames).toContain('--prompt');
      expect(optionNames).toContain('--path');
      expect(optionNames).toContain('--git-url');
      expect(optionNames).toContain('--github');
      expect(optionNames).toContain('--github-new');
      expect(optionNames).toContain('--agent');
      expect(optionNames).toContain('--max-iterations');
      expect(optionNames).toContain('--max-time');
      expect(optionNames).toContain('--gate-plan');
      expect(optionNames).toContain('--network');
      expect(optionNames).toContain('--json');
    });
  });

  describe('executeExec', () => {
    const mockWorkOrder: WorkOrder = {
      id: 'test-wo-1',
      taskPrompt: 'Test task',
      workspaceSource: { type: 'local', path: '/test/path' },
      agentType: 'claude-code-api',
      maxIterations: 3,
      maxWallClockSeconds: 3600,
      gatePlanSource: 'auto',
      policies: {
        networkAllowed: false,
        allowedPaths: [],
        forbiddenPatterns: ['**/.env'],
      },
      status: WorkOrderStatus.QUEUED,
      submittedAt: new Date(),
    };

    const mockRun: Run = {
      id: 'test-run-1',
      workOrderId: 'test-wo-1',
      workspaceId: 'test-ws-1',
      state: RunState.SUCCEEDED,
      result: RunResult.PASSED,
      iteration: 3,
      maxIterations: 3,
      startedAt: new Date(),
      completedAt: new Date(),
      error: null,
      gitHubBranch: null,
      gitHubPrUrl: null,
    };

    it('should submit and execute a work order successfully', async () => {
      // Mock submit
      vi.mocked(workOrderService.submit).mockResolvedValue(mockWorkOrder);

      // Mock orchestrator
      const mockExecute = vi.fn().mockResolvedValue(mockRun);
      vi.mocked(createOrchestrator).mockReturnValue({
        execute: mockExecute,
      } as any);

      // Mock mark succeeded
      vi.mocked(workOrderService.markSucceeded).mockResolvedValue(undefined);

      const options = {
        prompt: 'Test task',
        path: '/test/path',
        agent: 'claude-code-api',
        maxIterations: 3,
        maxTime: 3600,
        gatePlan: 'auto',
        network: false,
      };

      await executeExec(options);

      // Verify submit was called
      expect(workOrderService.submit).toHaveBeenCalledTimes(1);
      expect(workOrderService.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          taskPrompt: 'Test task',
          agentType: 'claude-code-api',
          maxIterations: 3,
        })
      );

      // Verify execute was called with the work order
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith(mockWorkOrder);

      // Verify mark succeeded was called
      expect(workOrderService.markSucceeded).toHaveBeenCalledTimes(1);
      expect(workOrderService.markSucceeded).toHaveBeenCalledWith('test-wo-1');
    });

    it('should handle submit failure gracefully', async () => {
      // Mock submit to fail
      const submitError = new Error('Submit failed');
      vi.mocked(workOrderService.submit).mockRejectedValue(submitError);

      const options = {
        prompt: 'Test task',
        path: '/test/path',
        agent: 'claude-code-api',
        maxIterations: 3,
        maxTime: 3600,
        gatePlan: 'auto',
        network: false,
      };

      await executeExec(options);

      // Verify submit was called
      expect(workOrderService.submit).toHaveBeenCalledTimes(1);

      // Verify execute was NOT called since submit failed
      expect(createOrchestrator).not.toHaveBeenCalled();

      // Verify exit code was set
      expect(process.exitCode).toBe(1);
    });

    it('should handle execution failure and mark work order as failed', async () => {
      const failedRun: Run = {
        ...mockRun,
        state: RunState.FAILED,
        result: RunResult.FAILED_VERIFICATION,
        error: 'Verification failed',
      };

      // Mock submit
      vi.mocked(workOrderService.submit).mockResolvedValue(mockWorkOrder);

      // Mock orchestrator to return failed run
      const mockExecute = vi.fn().mockResolvedValue(failedRun);
      vi.mocked(createOrchestrator).mockReturnValue({
        execute: mockExecute,
      } as any);

      // Mock mark failed
      vi.mocked(workOrderService.markFailed).mockResolvedValue(undefined);

      const options = {
        prompt: 'Test task',
        path: '/test/path',
        agent: 'claude-code-api',
        maxIterations: 3,
        maxTime: 3600,
        gatePlan: 'auto',
        network: false,
      };

      await executeExec(options);

      // Verify mark failed was called
      expect(workOrderService.markFailed).toHaveBeenCalledTimes(1);
      expect(workOrderService.markFailed).toHaveBeenCalledWith(
        'test-wo-1',
        'Verification failed'
      );

      // Verify exit code was set
      expect(process.exitCode).toBe(1);
    });

    it('should handle execution exception and mark work order as failed', async () => {
      const executionError = new Error('Orchestration error');

      // Mock submit
      vi.mocked(workOrderService.submit).mockResolvedValue(mockWorkOrder);

      // Mock orchestrator to throw error
      const mockExecute = vi.fn().mockRejectedValue(executionError);
      vi.mocked(createOrchestrator).mockReturnValue({
        execute: mockExecute,
      } as any);

      // Mock mark failed
      vi.mocked(workOrderService.markFailed).mockResolvedValue(undefined);

      const options = {
        prompt: 'Test task',
        path: '/test/path',
        agent: 'claude-code-api',
        maxIterations: 3,
        maxTime: 3600,
        gatePlan: 'auto',
        network: false,
      };

      await expect(executeExec(options)).rejects.toThrow('Orchestration error');

      // Verify mark failed was called
      expect(workOrderService.markFailed).toHaveBeenCalledTimes(1);
      expect(workOrderService.markFailed).toHaveBeenCalledWith(
        'test-wo-1',
        'Orchestration error'
      );
    });

    it('should pass through all options correctly', async () => {
      // Mock submit
      vi.mocked(workOrderService.submit).mockResolvedValue(mockWorkOrder);

      // Mock orchestrator
      const mockExecute = vi.fn().mockResolvedValue(mockRun);
      vi.mocked(createOrchestrator).mockReturnValue({
        execute: mockExecute,
      } as any);

      // Mock mark succeeded
      vi.mocked(workOrderService.markSucceeded).mockResolvedValue(undefined);

      const options = {
        prompt: 'Test task with options',
        path: '/custom/path',
        agent: 'claude-code-subscription',
        maxIterations: 5,
        maxTime: 7200,
        gatePlan: 'ci-workflow',
        network: true,
      };

      await executeExec(options);

      // Verify submit was called with correct options
      expect(workOrderService.submit).toHaveBeenCalledWith(
        expect.objectContaining({
          taskPrompt: 'Test task with options',
          agentType: 'claude-code-subscription',
          maxIterations: 5,
          maxWallClockSeconds: 7200,
          gatePlanSource: 'ci-workflow',
          policies: expect.objectContaining({
            networkAllowed: true,
          }),
        })
      );
    });

    it('should handle validation errors gracefully', async () => {
      const options = {
        // Missing required prompt
        path: '/test/path',
      };

      await executeExec(options);

      // Verify submit was NOT called
      expect(workOrderService.submit).not.toHaveBeenCalled();

      // Verify exit code was set
      expect(process.exitCode).toBe(1);
    });

    it('should handle non-existent path gracefully', async () => {
      // Mock existsSync to return false for this test
      const fs = await import('node:fs');
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const options = {
        prompt: 'Test task',
        path: '/non/existent/path',
        agent: 'claude-code-api',
        maxIterations: 3,
        maxTime: 3600,
        gatePlan: 'auto',
        network: false,
      };

      await executeExec(options);

      // Verify submit was NOT called
      expect(workOrderService.submit).not.toHaveBeenCalled();

      // Verify exit code was set
      expect(process.exitCode).toBe(1);
    });
  });
});
