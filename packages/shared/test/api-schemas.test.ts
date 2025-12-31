import { describe, it, expect } from 'vitest';
import {
  paginationQuerySchema,
  listWorkOrdersQuerySchema,
  createWorkOrderBodySchema,
  workOrderIdParamsSchema,
  runIdParamsSchema,
} from '../src/types/api.js';

describe('API Schemas', () => {
  describe('paginationQuerySchema', () => {
    it('should accept valid pagination params', () => {
      const result = paginationQuerySchema.safeParse({ limit: 10, offset: 0 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should use defaults for missing params', () => {
      const result = paginationQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should reject negative limit', () => {
      const result = paginationQuerySchema.safeParse({ limit: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject limit of zero', () => {
      const result = paginationQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = paginationQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should accept limit of exactly 100', () => {
      const result = paginationQuerySchema.safeParse({ limit: 100 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(100);
      }
    });

    it('should reject negative offset', () => {
      const result = paginationQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });

    it('should accept offset of zero', () => {
      const result = paginationQuerySchema.safeParse({ offset: 0 });
      expect(result.success).toBe(true);
    });

    it('should coerce string numbers', () => {
      const result = paginationQuerySchema.safeParse({ limit: '10', offset: '5' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.offset).toBe(5);
      }
    });

    it('should reject non-numeric strings', () => {
      const result = paginationQuerySchema.safeParse({ limit: 'abc' });
      expect(result.success).toBe(false);
    });

    it('should reject floating point numbers', () => {
      const result = paginationQuerySchema.safeParse({ limit: 10.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('listWorkOrdersQuerySchema', () => {
    it('should accept valid status filter', () => {
      const result = listWorkOrdersQuerySchema.safeParse({ status: 'queued' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('queued');
      }
    });

    it('should accept all valid status values', () => {
      const statuses = ['queued', 'running', 'succeeded', 'failed', 'canceled'];
      for (const status of statuses) {
        const result = listWorkOrdersQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.status).toBe(status);
        }
      }
    });

    it('should reject invalid status', () => {
      const result = listWorkOrdersQuerySchema.safeParse({ status: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should allow optional status', () => {
      const result = listWorkOrdersQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBeUndefined();
      }
    });

    it('should combine pagination and status', () => {
      const result = listWorkOrdersQuerySchema.safeParse({
        status: 'running',
        limit: 5,
        offset: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('running');
        expect(result.data.limit).toBe(5);
        expect(result.data.offset).toBe(10);
      }
    });

    it('should inherit pagination defaults', () => {
      const result = listWorkOrdersQuerySchema.safeParse({ status: 'succeeded' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should inherit pagination constraints', () => {
      const result = listWorkOrdersQuerySchema.safeParse({ status: 'queued', limit: 150 });
      expect(result.success).toBe(false);
    });
  });

  describe('createWorkOrderBodySchema', () => {
    const validLocalWorkspace = {
      taskPrompt: 'This is a valid task prompt with enough characters to pass validation',
      workspaceSource: { type: 'local' as const, path: '/tmp/workspace' },
    };

    it('should accept valid local workspace source', () => {
      const result = createWorkOrderBodySchema.safeParse(validLocalWorkspace);
      expect(result.success).toBe(true);
    });

    it('should accept valid github workspace source', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: {
          type: 'github',
          owner: 'testowner',
          repo: 'testrepo',
          branch: 'main'
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept github workspace without branch', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: {
          type: 'github',
          owner: 'testowner',
          repo: 'testrepo'
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid github-new workspace source', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: {
          type: 'github-new',
          owner: 'testowner',
          repoName: 'new-repo',
          private: true,
          template: 'typescript-base'
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept github-new with minimal fields', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: {
          type: 'github-new',
          owner: 'testowner',
          repoName: 'new-repo'
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty local path', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: { type: 'local', path: '' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty github owner', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: { type: 'github', owner: '', repo: 'testrepo' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty github repo', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: { type: 'github', owner: 'testowner', repo: '' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject taskPrompt shorter than 10 characters', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        taskPrompt: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should accept taskPrompt of exactly 10 characters', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        taskPrompt: '1234567890',
      });
      expect(result.success).toBe(true);
    });

    it('should use default agentType when not provided', () => {
      const result = createWorkOrderBodySchema.safeParse(validLocalWorkspace);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentType).toBe('claude-code-subscription');
      }
    });

    it('should accept valid agentType values', () => {
      const agentTypes = ['claude-code-subscription', 'openai-codex', 'opencode'];
      for (const agentType of agentTypes) {
        const result = createWorkOrderBodySchema.safeParse({
          ...validLocalWorkspace,
          agentType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid agentType', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        agentType: 'invalid-agent',
      });
      expect(result.success).toBe(false);
    });

    it('should use default maxIterations when not provided', () => {
      const result = createWorkOrderBodySchema.safeParse(validLocalWorkspace);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(3);
      }
    });

    it('should accept optional maxIterations', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxIterations: 5,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(5);
      }
    });

    it('should reject maxIterations below 1', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxIterations: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxIterations above 10', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxIterations: 11,
      });
      expect(result.success).toBe(false);
    });

    it('should accept maxIterations of exactly 1', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxIterations: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maxIterations of exactly 10', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxIterations: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional maxTime', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxTime: 1800,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxTime).toBe(1800);
      }
    });

    it('should reject maxTime below 60', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxTime: 59,
      });
      expect(result.success).toBe(false);
    });

    it('should reject maxTime above 3600', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxTime: 3601,
      });
      expect(result.success).toBe(false);
    });

    it('should accept maxTime of exactly 60', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxTime: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should accept maxTime of exactly 3600', () => {
      const result = createWorkOrderBodySchema.safeParse({
        ...validLocalWorkspace,
        maxTime: 3600,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing taskPrompt', () => {
      const result = createWorkOrderBodySchema.safeParse({
        workspaceSource: validLocalWorkspace.workspaceSource,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing workspaceSource', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid workspace source type', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: { type: 'invalid', path: '/tmp' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject workspace source with missing required fields', () => {
      const result = createWorkOrderBodySchema.safeParse({
        taskPrompt: validLocalWorkspace.taskPrompt,
        workspaceSource: { type: 'local' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('workOrderIdParamsSchema', () => {
    it('should accept valid id', () => {
      const result = workOrderIdParamsSchema.safeParse({ id: 'wo-123' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('wo-123');
      }
    });

    it('should reject empty id', () => {
      const result = workOrderIdParamsSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = workOrderIdParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('runIdParamsSchema', () => {
    it('should accept valid id', () => {
      const result = runIdParamsSchema.safeParse({ id: 'run-456' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('run-456');
      }
    });

    it('should reject empty id', () => {
      const result = runIdParamsSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = runIdParamsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
