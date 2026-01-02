/**
 * ResultPersister Unit Tests
 * (v0.2.19 - Thrust 1)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ResultPersister } from '../src/orchestrator/result-persister.js';
import { rm, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setAgentGateRoot, getRunDir } from '../src/artifacts/paths.js';
import { tmpdir } from 'node:os';
import type { AgentResult } from '../src/types/agent.js';

describe('ResultPersister', () => {
  let persister: ResultPersister;
  let testRoot: string;
  const testRunId = 'test-run-' + Date.now();

  beforeEach(() => {
    persister = new ResultPersister();
    // Use a temp directory for tests
    testRoot = join(tmpdir(), `agentgate-test-${Date.now()}`);
    setAgentGateRoot(testRoot);
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      await rm(testRoot, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('saveAgentResult', () => {
    it('should save full agent result to disk', async () => {
      const result: AgentResult = {
        success: false,
        exitCode: 1,
        stdout: 'Agent output here',
        stderr: 'Error message here',
        sessionId: 'test-session',
        model: 'claude-3-opus',
        durationMs: 5000,
        tokensUsed: { input: 1000, output: 500 },
        structuredOutput: null,
        toolCalls: [
          {
            tool: 'Write',
            input: { path: 'test.ts' },
            output: 'ok',
            durationMs: 100,
            timestamp: new Date(),
          },
        ],
      };

      const filePath = await persister.saveAgentResult(testRunId, 1, result);

      expect(filePath).toContain('agent-1.json');

      // Verify file was created
      const runDir = getRunDir(testRunId);
      const files = await readdir(runDir);
      expect(files).toContain('agent-1.json');

      // Load and verify content
      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded).not.toBeNull();
      expect(loaded!.stdout).toBe('Agent output here');
      expect(loaded!.stderr).toBe('Error message here');
      expect(loaded!.toolCalls).toHaveLength(1);
      expect(loaded!.success).toBe(false);
      expect(loaded!.exitCode).toBe(1);
      expect(loaded!.sessionId).toBe('test-session');
      expect(loaded!.model).toBe('claude-3-opus');
      expect(loaded!.durationMs).toBe(5000);
      expect(loaded!.tokensUsed).toEqual({ input: 1000, output: 500 });
    });

    it('should truncate large output', async () => {
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: 'x'.repeat(2_000_000), // 2MB
        stderr: '',
        sessionId: 'test-session',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, result, {
        maxStdoutBytes: 1024,
      });

      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded!.stdout.length).toBeLessThan(2000);
      expect(loaded!.stdout).toContain('[TRUNCATED');
    });

    it('should handle missing optional fields', async () => {
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: 'output',
        stderr: '',
        sessionId: null,
        tokensUsed: null,
        durationMs: 100,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, result);

      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('unknown');
      expect(loaded!.model).toBeNull();
      expect(loaded!.toolCalls).toEqual([]);
      expect(loaded!.totalCostUsd).toBeNull();
    });

    it('should not include tool calls when disabled', async () => {
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
        toolCalls: [
          { tool: 'Read', input: {}, output: 'ok', durationMs: 50, timestamp: new Date() },
        ],
      };

      await persister.saveAgentResult(testRunId, 1, result, {
        includeToolCalls: false,
      });

      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded!.toolCalls).toEqual([]);
    });

    it('should include capturedAt timestamp', async () => {
      const beforeTime = new Date().toISOString();
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 100,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, result);
      const afterTime = new Date().toISOString();

      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded!.capturedAt).toBeDefined();
      expect(loaded!.capturedAt >= beforeTime).toBe(true);
      expect(loaded!.capturedAt <= afterTime).toBe(true);
    });
  });

  describe('loadAgentResult', () => {
    it('should return null for non-existent file', async () => {
      const loaded = await persister.loadAgentResult('non-existent-run', 1);
      expect(loaded).toBeNull();
    });

    it('should return null for non-existent iteration', async () => {
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 100,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, result);

      const loaded = await persister.loadAgentResult(testRunId, 99);
      expect(loaded).toBeNull();
    });
  });

  describe('listAgentResults', () => {
    it('should list all iterations', async () => {
      const baseResult: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, baseResult);
      await persister.saveAgentResult(testRunId, 2, baseResult);
      await persister.saveAgentResult(testRunId, 3, baseResult);

      const iterations = await persister.listAgentResults(testRunId);
      expect(iterations).toEqual([1, 2, 3]);
    });

    it('should return empty array for non-existent run', async () => {
      const iterations = await persister.listAgentResults('non-existent-run');
      expect(iterations).toEqual([]);
    });

    it('should sort iterations numerically', async () => {
      const baseResult: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
      };

      // Save in non-sequential order
      await persister.saveAgentResult(testRunId, 10, baseResult);
      await persister.saveAgentResult(testRunId, 2, baseResult);
      await persister.saveAgentResult(testRunId, 1, baseResult);

      const iterations = await persister.listAgentResults(testRunId);
      expect(iterations).toEqual([1, 2, 10]);
    });

    it('should ignore non-agent files in run directory', async () => {
      const baseResult: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 1000,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, baseResult);

      // Create other files in the run directory
      const runDir = getRunDir(testRunId);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(join(runDir, 'run.json'), '{}');
      await writeFile(join(runDir, 'iteration-1.json'), '{}');

      const iterations = await persister.listAgentResults(testRunId);
      expect(iterations).toEqual([1]);
    });
  });

  describe('truncate', () => {
    it('should not truncate text below limit', async () => {
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: 'short output',
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 100,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, result, {
        maxStdoutBytes: 1024 * 1024,
      });

      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded!.stdout).toBe('short output');
    });

    it('should include truncation message when truncated', async () => {
      const result: AgentResult = {
        success: true,
        exitCode: 0,
        stdout: 'a'.repeat(500),
        stderr: '',
        sessionId: 'test',
        model: null,
        durationMs: 100,
        tokensUsed: null,
        structuredOutput: null,
      };

      await persister.saveAgentResult(testRunId, 1, result, {
        maxStdoutBytes: 200,
      });

      const loaded = await persister.loadAgentResult(testRunId, 1);
      expect(loaded!.stdout).toContain('[TRUNCATED - exceeded 200 bytes]');
      expect(loaded!.stdout.length).toBeLessThanOrEqual(200);
    });
  });
});
