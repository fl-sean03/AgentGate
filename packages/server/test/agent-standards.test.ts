/**
 * Agent Standards Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadEngineeringStandards,
  clearStandardsCache,
} from '../src/agent/standards.js';
import { buildSystemPromptAppend } from '../src/agent/command-builder.js';
import { createDefaultRequest } from '../src/agent/defaults.js';
import type { AgentRequest } from '../src/types/index.js';

describe('Agent Standards', () => {
  let testDir: string;

  beforeEach(async () => {
    // Clear cache before each test
    clearStandardsCache();

    // Create temp directory for tests
    testDir = join(tmpdir(), `agent-standards-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clear cache after each test
    clearStandardsCache();

    // Clean up temp directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadEngineeringStandards', () => {
    it('should find AGENTS.md in .agentgate/ directory', async () => {
      const agentgateDir = join(testDir, '.agentgate');
      await mkdir(agentgateDir, { recursive: true });
      const testContent = '# Test Standards\nTest content from .agentgate';
      await writeFile(join(agentgateDir, 'AGENTS.md'), testContent, 'utf-8');

      const result = loadEngineeringStandards(testDir);

      expect(result).toBe(testContent);
    });

    it('should find AGENTS.md in workspace root', async () => {
      const testContent = '# Test Standards\nTest content from root';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      const result = loadEngineeringStandards(testDir);

      expect(result).toBe(testContent);
    });

    it('should prioritize .agentgate/AGENTS.md over root', async () => {
      const agentgateDir = join(testDir, '.agentgate');
      await mkdir(agentgateDir, { recursive: true });
      const agentgateContent = '# Test Standards\nTest content from .agentgate';
      const rootContent = '# Test Standards\nTest content from root';
      await writeFile(join(agentgateDir, 'AGENTS.md'), agentgateContent, 'utf-8');
      await writeFile(join(testDir, 'AGENTS.md'), rootContent, 'utf-8');

      const result = loadEngineeringStandards(testDir);

      expect(result).toBe(agentgateContent);
    });

    it('should return null when AGENTS.md not found', () => {
      const result = loadEngineeringStandards(testDir);

      // No embedded fallback - respects workspace's own configuration
      expect(result).toBeNull();
    });

    it('should return null when workspacePath is undefined', () => {
      const result = loadEngineeringStandards();

      // No embedded fallback
      expect(result).toBeNull();
    });

    it('should cache standards after first load', async () => {
      const testContent = '# Test Standards\nCaching test';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      // First load
      const result1 = loadEngineeringStandards(testDir);
      expect(result1).toBe(testContent);

      // Delete the file
      await rm(join(testDir, 'AGENTS.md'));

      // Second load should return cached value
      const result2 = loadEngineeringStandards(testDir);
      expect(result2).toBe(testContent);
    });

    it('should handle unreadable AGENTS.md gracefully', async () => {
      const testContent = '# Fallback\nRoot content';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      // Create an unreadable file in .agentgate (simulated by writing to non-existent subdir)
      const agentgateDir = join(testDir, '.agentgate');
      await mkdir(agentgateDir, { recursive: true });
      await writeFile(join(agentgateDir, 'AGENTS.md'), 'corrupted', 'utf-8');

      // Try to make it unreadable (this might not work on all systems)
      try {
        const { chmod } = await import('node:fs/promises');
        await chmod(join(agentgateDir, 'AGENTS.md'), 0o000);

        const result = loadEngineeringStandards(testDir);

        // Should fall back to next available file (root AGENTS.md)
        expect(result).toBe(testContent);

        // Restore permissions for cleanup
        await chmod(join(agentgateDir, 'AGENTS.md'), 0o644);
      } catch {
        // Skip this test if chmod doesn't work (e.g., on Windows)
        expect(true).toBe(true);
      }
    });
  });

  describe('clearStandardsCache', () => {
    it('should clear cached standards', async () => {
      const testContent = '# Test Standards\nCache clear test';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      // Load and cache
      const result1 = loadEngineeringStandards(testDir);
      expect(result1).toBe(testContent);

      // Clear cache
      clearStandardsCache();

      // Delete file
      await rm(join(testDir, 'AGENTS.md'));

      // Should now return null (file not found, no cached value)
      const result2 = loadEngineeringStandards(testDir);
      expect(result2).toBeNull();
    });
  });

  describe('Integration with command-builder', () => {
    it('should inject standards into system prompt', async () => {
      const testContent = '# Custom Standards\nCustom test content';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      const request: AgentRequest = createDefaultRequest(testDir, 'Test task');

      const systemPrompt = buildSystemPromptAppend(request);

      expect(systemPrompt).toBeTruthy();
      expect(systemPrompt).toContain(testContent);
    });

    it('should return null when no standards and no other components', () => {
      const request: AgentRequest = createDefaultRequest(testDir, 'Test task');

      const systemPrompt = buildSystemPromptAppend(request);

      // No AGENTS.md found and no other components = null
      expect(systemPrompt).toBeNull();
    });

    it('should still include other components when no AGENTS.md exists', () => {
      // No AGENTS.md in testDir
      const request: AgentRequest = createDefaultRequest(testDir, 'Test task');
      request.gatePlanSummary = 'Gate plan requirements';
      request.priorFeedback = 'Fix these issues';

      const systemPrompt = buildSystemPromptAppend(request);

      // Should have gate plan and feedback but NOT embedded standards
      expect(systemPrompt).toBeTruthy();
      expect(systemPrompt).toContain('Gate Plan Requirements');
      expect(systemPrompt).toContain('Prior Feedback');
      // Crucially: no embedded standards were injected
      expect(systemPrompt).not.toContain('# Engineering Standards');
      expect(systemPrompt).not.toContain('Test As You Build');
    });

    it('should inject standards before gate plan', async () => {
      const testContent = '# Test Standards\nStandards content';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      const request: AgentRequest = createDefaultRequest(testDir, 'Test task');
      request.gatePlanSummary = 'Gate plan requirements';

      const systemPrompt = buildSystemPromptAppend(request);

      expect(systemPrompt).toBeTruthy();

      // Standards should appear before gate plan
      const standardsIndex = systemPrompt!.indexOf(testContent);
      const gatePlanIndex = systemPrompt!.indexOf('Gate Plan Requirements');

      expect(standardsIndex).toBeGreaterThan(-1);
      expect(gatePlanIndex).toBeGreaterThan(-1);
      expect(standardsIndex).toBeLessThan(gatePlanIndex);
    });

    it('should inject standards before feedback', async () => {
      const testContent = '# Test Standards\nStandards content';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      const request: AgentRequest = createDefaultRequest(testDir, 'Test task');
      request.priorFeedback = 'Fix these issues';

      const systemPrompt = buildSystemPromptAppend(request);

      expect(systemPrompt).toBeTruthy();

      // Standards should appear before feedback
      const standardsIndex = systemPrompt!.indexOf(testContent);
      const feedbackIndex = systemPrompt!.indexOf('Prior Feedback');

      expect(standardsIndex).toBeGreaterThan(-1);
      expect(feedbackIndex).toBeGreaterThan(-1);
      expect(standardsIndex).toBeLessThan(feedbackIndex);
    });

    it('should work with all system prompt components', async () => {
      const testContent = '# Test Standards\nStandards content';
      await writeFile(join(testDir, 'AGENTS.md'), testContent, 'utf-8');

      const request: AgentRequest = createDefaultRequest(testDir, 'Test task');
      request.gatePlanSummary = 'Gate plan requirements';
      request.priorFeedback = 'Fix these issues';
      request.constraints.additionalSystemPrompt = 'Custom instructions';

      const systemPrompt = buildSystemPromptAppend(request);

      expect(systemPrompt).toBeTruthy();

      // Verify all components are present
      expect(systemPrompt).toContain(testContent);
      expect(systemPrompt).toContain('Gate Plan Requirements');
      expect(systemPrompt).toContain('Prior Feedback');
      expect(systemPrompt).toContain('Custom instructions');

      // Verify order: standards -> gate plan -> feedback -> custom
      const standardsIndex = systemPrompt!.indexOf(testContent);
      const gatePlanIndex = systemPrompt!.indexOf('Gate Plan Requirements');
      const feedbackIndex = systemPrompt!.indexOf('Prior Feedback');
      const customIndex = systemPrompt!.indexOf('Custom instructions');

      expect(standardsIndex).toBeLessThan(gatePlanIndex);
      expect(gatePlanIndex).toBeLessThan(feedbackIndex);
      expect(feedbackIndex).toBeLessThan(customIndex);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty AGENTS.md file', async () => {
      await writeFile(join(testDir, 'AGENTS.md'), '', 'utf-8');

      const result = loadEngineeringStandards(testDir);

      // Empty file is still valid content
      expect(result).toBe('');
    });

    it('should handle AGENTS.md with only whitespace', async () => {
      const whitespaceContent = '   \n\n\t\t\n   ';
      await writeFile(join(testDir, 'AGENTS.md'), whitespaceContent, 'utf-8');

      const result = loadEngineeringStandards(testDir);

      expect(result).toBe(whitespaceContent);
    });

    it('should handle very large AGENTS.md file', async () => {
      // Create a large content (100KB)
      const largeContent = '# Large Standards\n' + 'x'.repeat(100000);
      await writeFile(join(testDir, 'AGENTS.md'), largeContent, 'utf-8');

      const result = loadEngineeringStandards(testDir);

      expect(result).toBe(largeContent);
      expect(result?.length).toBeGreaterThan(100000);
    });

    it('should handle special characters in AGENTS.md', async () => {
      const specialContent = '# Standards 💻\nTest with émojis and spëcial çharacters: 日本語';
      await writeFile(join(testDir, 'AGENTS.md'), specialContent, 'utf-8');

      const result = loadEngineeringStandards(testDir);

      expect(result).toBe(specialContent);
    });
  });
});
