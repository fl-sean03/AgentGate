/**
 * Unit tests for SDK Options Builder
 */

import { describe, it, expect } from 'vitest';
import {
  buildSDKOptions,
  getRequiredConfig,
  type ClaudeAgentSDKDriverConfig,
} from '../src/agent/sdk-options-builder.js';
import type { AgentRequest, AgentConstraints, ContextPointers } from '../src/types/index.js';

describe('SDK Options Builder', () => {
  const createMockRequest = (overrides?: Partial<AgentRequest>): AgentRequest => {
    const defaultConstraints: AgentConstraints = {
      allowedTools: [],
      disallowedTools: [],
      maxTurns: 100,
      permissionMode: 'bypassPermissions',
      additionalSystemPrompt: null,
    };

    const defaultContextPointers: ContextPointers = {
      manifestPath: null,
      testsPath: null,
      docsPath: null,
      gatePlanPath: null,
      srcPath: null,
    };

    return {
      workspacePath: '/tmp/workspace',
      taskPrompt: 'Test task',
      gatePlanSummary: '',
      constraints: defaultConstraints,
      priorFeedback: null,
      contextPointers: defaultContextPointers,
      timeoutMs: 300000,
      sessionId: null,
      ...overrides,
    };
  };

  describe('buildSDKOptions', () => {
    it('should set maxTurns from request constraints', () => {
      const request = createMockRequest({
        constraints: {
          allowedTools: [],
          disallowedTools: [],
          maxTurns: 50,
          permissionMode: 'bypassPermissions',
          additionalSystemPrompt: null,
        },
      });

      const options = buildSDKOptions(request, {});

      expect(options.maxTurns).toBe(50);
    });

    it('should set maxTurns from config if not in request', () => {
      const request = createMockRequest();
      const config: ClaudeAgentSDKDriverConfig = { maxTurns: 75 };

      const options = buildSDKOptions(request, config);

      expect(options.maxTurns).toBe(100); // request.constraints.maxTurns takes precedence
    });

    it('should set resume from sessionId', () => {
      const request = createMockRequest({ sessionId: 'session-abc' });

      const options = buildSDKOptions(request, {});

      expect(options.resume).toBe('session-abc');
    });

    it('should not set resume when no sessionId', () => {
      const request = createMockRequest({ sessionId: null });

      const options = buildSDKOptions(request, {});

      expect(options.resume).toBeUndefined();
    });

    it('should set allowedTools from constraints', () => {
      const request = createMockRequest({
        constraints: {
          allowedTools: ['Read', 'Write'],
          disallowedTools: [],
          maxTurns: 100,
          permissionMode: 'bypassPermissions',
          additionalSystemPrompt: null,
        },
      });

      const options = buildSDKOptions(request, {});

      expect(options.allowedTools).toEqual(['Read', 'Write']);
    });

    it('should set disallowedTools from constraints', () => {
      const request = createMockRequest({
        constraints: {
          allowedTools: [],
          disallowedTools: ['Bash'],
          maxTurns: 100,
          permissionMode: 'bypassPermissions',
          additionalSystemPrompt: null,
        },
      });

      const options = buildSDKOptions(request, {});

      expect(options.disallowedTools).toEqual(['Bash']);
    });

    it('should not set tool restrictions when empty', () => {
      const request = createMockRequest();

      const options = buildSDKOptions(request, {});

      expect(options.allowedTools).toBeUndefined();
      expect(options.disallowedTools).toBeUndefined();
    });

    it('should set dangerouslySkipPermissions for bypassPermissions mode', () => {
      const request = createMockRequest({
        constraints: {
          allowedTools: [],
          disallowedTools: [],
          maxTurns: 100,
          permissionMode: 'bypassPermissions',
          additionalSystemPrompt: null,
        },
      });

      const options = buildSDKOptions(request, {});

      expect(options.dangerouslySkipPermissions).toBe(true);
    });

    it('should not set dangerouslySkipPermissions for other modes', () => {
      const request = createMockRequest({
        constraints: {
          allowedTools: [],
          disallowedTools: [],
          maxTurns: 100,
          permissionMode: 'plan',
          additionalSystemPrompt: null,
        },
      });

      const options = buildSDKOptions(request, {});

      expect(options.dangerouslySkipPermissions).toBeUndefined();
    });

    it('should include hooks config when provided', () => {
      const request = createMockRequest();
      const hooksConfig = {
        PreToolUse: [{ callback: async () => ({ allow: true }) }],
      };

      const options = buildSDKOptions(request, {}, hooksConfig);

      expect(options.hooks).toBe(hooksConfig);
    });

    it('should set systemPrompt from gate plan', () => {
      const request = createMockRequest({
        gatePlanSummary: 'Must pass all tests',
      });

      const options = buildSDKOptions(request, {});

      expect(options.systemPrompt).toBeDefined();
      expect(options.systemPrompt).toContain('Must pass all tests');
    });

    it('should set systemPrompt from prior feedback', () => {
      const request = createMockRequest({
        priorFeedback: 'Fix the typo in line 10',
      });

      const options = buildSDKOptions(request, {});

      expect(options.systemPrompt).toBeDefined();
      expect(options.systemPrompt).toContain('Fix the typo in line 10');
    });
  });

  describe('getRequiredConfig', () => {
    it('should apply default values', () => {
      const config = getRequiredConfig({});

      expect(config.timeoutMs).toBe(300000);
      expect(config.enableSandbox).toBe(true);
      expect(config.hooks).toEqual({});
      expect(config.env).toEqual({});
      expect(config.maxTurns).toBe(100);
    });

    it('should preserve provided values', () => {
      const config = getRequiredConfig({
        timeoutMs: 60000,
        enableSandbox: false,
        maxTurns: 50,
      });

      expect(config.timeoutMs).toBe(60000);
      expect(config.enableSandbox).toBe(false);
      expect(config.maxTurns).toBe(50);
    });

    it('should preserve hooks config', () => {
      const hooks = { logToolUse: true };
      const config = getRequiredConfig({ hooks });

      expect(config.hooks).toBe(hooks);
    });

    it('should preserve env config', () => {
      const env = { CUSTOM_VAR: 'value' };
      const config = getRequiredConfig({ env });

      expect(config.env).toBe(env);
    });
  });
});
