import { describe, it, expect } from 'vitest';
import {
  WorkOrderStatus,
  AgentType,
  GatePlanSource,
  WorkspaceTemplate,
  workspaceSourceSchema,
  executionPoliciesSchema,
  submitRequestSchema,
  listFiltersSchema,
} from '../src/types/work-order.js';

describe('Work Order Types', () => {
  describe('WorkOrderStatus', () => {
    it('should have all expected status values', () => {
      expect(WorkOrderStatus.QUEUED).toBe('queued');
      expect(WorkOrderStatus.RUNNING).toBe('running');
      expect(WorkOrderStatus.SUCCEEDED).toBe('succeeded');
      expect(WorkOrderStatus.FAILED).toBe('failed');
      expect(WorkOrderStatus.CANCELED).toBe('canceled');
    });

    it('should cover all 5 statuses', () => {
      const statuses = Object.values(WorkOrderStatus);
      expect(statuses).toHaveLength(5);
    });

    it('should identify terminal statuses', () => {
      const terminalStatuses = [
        WorkOrderStatus.SUCCEEDED,
        WorkOrderStatus.FAILED,
        WorkOrderStatus.CANCELED,
      ];

      for (const status of terminalStatuses) {
        expect([WorkOrderStatus.SUCCEEDED, WorkOrderStatus.FAILED, WorkOrderStatus.CANCELED])
          .toContain(status);
      }
    });

    it('should identify non-terminal statuses', () => {
      const nonTerminalStatuses = [
        WorkOrderStatus.QUEUED,
        WorkOrderStatus.RUNNING,
      ];

      for (const status of nonTerminalStatuses) {
        expect([WorkOrderStatus.SUCCEEDED, WorkOrderStatus.FAILED, WorkOrderStatus.CANCELED])
          .not.toContain(status);
      }
    });
  });

  describe('AgentType', () => {
    it('should have all expected agent types', () => {
      expect(AgentType.CLAUDE_CODE).toBe('claude-code');
      expect(AgentType.CLAUDE_CODE_SUBSCRIPTION).toBe('claude-code-subscription');
      expect(AgentType.OPENAI_CODEX).toBe('openai-codex');
      expect(AgentType.OPENCODE).toBe('opencode');
    });

    it('should have exactly 4 agent types', () => {
      const types = Object.values(AgentType);
      expect(types).toHaveLength(4);
    });
  });

  describe('GatePlanSource', () => {
    it('should have all expected sources', () => {
      expect(GatePlanSource.VERIFY_PROFILE).toBe('verify-profile');
      expect(GatePlanSource.CI_WORKFLOW).toBe('ci-workflow');
      expect(GatePlanSource.AUTO).toBe('auto');
      expect(GatePlanSource.DEFAULT).toBe('default');
    });

    it('should have exactly 4 sources', () => {
      const sources = Object.values(GatePlanSource);
      expect(sources).toHaveLength(4);
    });
  });

  describe('WorkspaceTemplate', () => {
    it('should have all expected templates', () => {
      expect(WorkspaceTemplate.MINIMAL).toBe('minimal');
      expect(WorkspaceTemplate.TYPESCRIPT).toBe('typescript');
      expect(WorkspaceTemplate.PYTHON).toBe('python');
    });

    it('should have exactly 3 templates', () => {
      const templates = Object.values(WorkspaceTemplate);
      expect(templates).toHaveLength(3);
    });
  });

  describe('workspaceSourceSchema', () => {
    it('should accept valid local workspace', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'local',
        path: '/tmp/workspace',
      });
      expect(result.success).toBe(true);
    });

    it('should reject local workspace with empty path', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'local',
        path: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid git workspace', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'git',
        url: 'https://github.com/owner/repo.git',
        branch: 'main',
      });
      expect(result.success).toBe(true);
    });

    it('should accept git workspace without branch', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'git',
        url: 'https://github.com/owner/repo.git',
      });
      expect(result.success).toBe(true);
    });

    it('should reject git workspace with invalid url', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'git',
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid fresh workspace', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'fresh',
        destPath: '/tmp/new-project',
        template: 'typescript',
        projectName: 'my-project',
      });
      expect(result.success).toBe(true);
    });

    it('should accept fresh workspace with minimal fields', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'fresh',
        destPath: '/tmp/new-project',
      });
      expect(result.success).toBe(true);
    });

    it('should reject fresh workspace with empty destPath', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'fresh',
        destPath: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject fresh workspace with invalid template', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'fresh',
        destPath: '/tmp/new-project',
        template: 'invalid-template',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid github workspace', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github',
        owner: 'testowner',
        repo: 'testrepo',
        branch: 'develop',
      });
      expect(result.success).toBe(true);
    });

    it('should accept github workspace without branch', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github',
        owner: 'testowner',
        repo: 'testrepo',
      });
      expect(result.success).toBe(true);
    });

    it('should reject github workspace with empty owner', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github',
        owner: '',
        repo: 'testrepo',
      });
      expect(result.success).toBe(false);
    });

    it('should reject github workspace with empty repo', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github',
        owner: 'testowner',
        repo: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid github-new workspace', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github-new',
        owner: 'testowner',
        repoName: 'new-repo',
        private: true,
        template: 'python',
      });
      expect(result.success).toBe(true);
    });

    it('should accept github-new workspace with minimal fields', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github-new',
        owner: 'testowner',
        repoName: 'new-repo',
      });
      expect(result.success).toBe(true);
    });

    it('should reject github-new workspace with empty owner', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github-new',
        owner: '',
        repoName: 'new-repo',
      });
      expect(result.success).toBe(false);
    });

    it('should reject github-new workspace with empty repoName', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'github-new',
        owner: 'testowner',
        repoName: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject unknown workspace type', () => {
      const result = workspaceSourceSchema.safeParse({
        type: 'unknown',
        path: '/tmp',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('executionPoliciesSchema', () => {
    it('should accept valid policies with all fields', () => {
      const result = executionPoliciesSchema.safeParse({
        networkAllowed: true,
        allowedPaths: ['/tmp', '/home/user'],
        forbiddenPatterns: ['**/.env', '**/secrets/**'],
        maxDiskMb: 1024,
      });
      expect(result.success).toBe(true);
    });

    it('should use defaults when not provided', () => {
      const result = executionPoliciesSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.networkAllowed).toBe(false);
        expect(result.data.allowedPaths).toEqual([]);
        expect(result.data.forbiddenPatterns).toEqual([
          '**/.env',
          '**/.env.*',
          '**/secrets/**',
          '**/*.pem',
          '**/*.key',
          '**/credentials.json',
          '**/service-account*.json',
        ]);
      }
    });

    it('should accept partial policies', () => {
      const result = executionPoliciesSchema.safeParse({
        networkAllowed: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.networkAllowed).toBe(true);
        expect(result.data.allowedPaths).toEqual([]);
      }
    });

    it('should reject negative maxDiskMb', () => {
      const result = executionPoliciesSchema.safeParse({
        maxDiskMb: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero maxDiskMb', () => {
      const result = executionPoliciesSchema.safeParse({
        maxDiskMb: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should accept positive maxDiskMb', () => {
      const result = executionPoliciesSchema.safeParse({
        maxDiskMb: 500,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('submitRequestSchema', () => {
    const validRequest = {
      taskPrompt: 'Implement new feature',
      workspaceSource: {
        type: 'local' as const,
        path: '/tmp/workspace',
      },
    };

    it('should accept valid request with defaults', () => {
      const result = submitRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentType).toBe('claude-code-subscription');
        expect(result.data.maxIterations).toBe(3);
        expect(result.data.maxWallClockSeconds).toBe(3600);
        expect(result.data.gatePlanSource).toBe('auto');
      }
    });

    it('should accept request with all fields', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        agentType: 'openai-codex',
        maxIterations: 5,
        maxWallClockSeconds: 7200,
        gatePlanSource: 'verify-profile',
        policies: {
          networkAllowed: true,
          allowedPaths: ['/tmp'],
          forbiddenPatterns: ['**/.env'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty taskPrompt', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        taskPrompt: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject taskPrompt over 10000 characters', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        taskPrompt: 'a'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept taskPrompt of exactly 10000 characters', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        taskPrompt: 'a'.repeat(10000),
      });
      expect(result.success).toBe(true);
    });

    it('should reject maxIterations below 1', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        maxIterations: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations above 10', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        maxIterations: 11,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxWallClockSeconds below 60', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        maxWallClockSeconds: 59,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxWallClockSeconds above 86400', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        maxWallClockSeconds: 86401,
      });
      expect(result.success).toBe(false);
    });

    it('should accept maxWallClockSeconds of exactly 60', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        maxWallClockSeconds: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maxWallClockSeconds of exactly 86400', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        maxWallClockSeconds: 86400,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid agentType', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        agentType: 'invalid-agent',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid gatePlanSource', () => {
      const result = submitRequestSchema.safeParse({
        ...validRequest,
        gatePlanSource: 'invalid-source',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing taskPrompt', () => {
      const result = submitRequestSchema.safeParse({
        workspaceSource: validRequest.workspaceSource,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing workspaceSource', () => {
      const result = submitRequestSchema.safeParse({
        taskPrompt: validRequest.taskPrompt,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('listFiltersSchema', () => {
    it('should accept valid filters', () => {
      const result = listFiltersSchema.safeParse({
        status: 'running',
        limit: 10,
        offset: 20,
      });
      expect(result.success).toBe(true);
    });

    it('should use defaults when empty', () => {
      const result = listFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
        expect(result.data.status).toBeUndefined();
      }
    });

    it('should accept all valid status values', () => {
      const statuses = ['queued', 'running', 'succeeded', 'failed', 'canceled'];
      for (const status of statuses) {
        const result = listFiltersSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = listFiltersSchema.safeParse({
        status: 'invalid',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative limit', () => {
      const result = listFiltersSchema.safeParse({
        limit: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero limit', () => {
      const result = listFiltersSchema.safeParse({
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = listFiltersSchema.safeParse({
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should accept limit of exactly 100', () => {
      const result = listFiltersSchema.safeParse({
        limit: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative offset', () => {
      const result = listFiltersSchema.safeParse({
        offset: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept offset of zero', () => {
      const result = listFiltersSchema.safeParse({
        offset: 0,
      });
      expect(result.success).toBe(true);
    });
  });
});
