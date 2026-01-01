/**
 * Unit tests for SDK Hooks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FileChangeTracker,
  createToolLoggerHook,
  createFileChangeTrackerHook,
  createDangerousToolBlocker,
  createPathRestrictionHook,
  buildHooksConfig,
  createGateIntegrationHooks,
  mergeHooksConfig,
} from '../src/agent/sdk-hooks.js';

describe('SDK Hooks', () => {
  describe('FileChangeTracker', () => {
    let tracker: FileChangeTracker;

    beforeEach(() => {
      tracker = new FileChangeTracker();
    });

    it('should record file changes', () => {
      tracker.recordChange('/tmp/test.txt', 'Write');

      expect(tracker.getChangedFiles()).toContain('/tmp/test.txt');
      expect(tracker.wasModified('/tmp/test.txt')).toBe(true);
    });

    it('should track multiple changes to same file', () => {
      tracker.recordChange('/tmp/test.txt', 'Write');
      tracker.recordChange('/tmp/test.txt', 'Edit');

      const history = tracker.getChangeHistory('/tmp/test.txt');
      expect(history).toHaveLength(2);
      expect(history[0].action).toBe('Write');
      expect(history[1].action).toBe('Edit');
    });

    it('should track multiple files', () => {
      tracker.recordChange('/tmp/file1.txt', 'Write');
      tracker.recordChange('/tmp/file2.txt', 'Write');
      tracker.recordChange('/tmp/file3.txt', 'Edit');

      expect(tracker.getChangedFiles()).toHaveLength(3);
    });

    it('should return empty history for unmodified file', () => {
      const history = tracker.getChangeHistory('/tmp/nonexistent.txt');
      expect(history).toHaveLength(0);
    });

    it('should report correct change count', () => {
      tracker.recordChange('/tmp/file1.txt', 'Write');
      tracker.recordChange('/tmp/file1.txt', 'Edit');
      tracker.recordChange('/tmp/file2.txt', 'Write');

      expect(tracker.getChangeCount()).toBe(3);
    });

    it('should clear all changes', () => {
      tracker.recordChange('/tmp/file1.txt', 'Write');
      tracker.recordChange('/tmp/file2.txt', 'Edit');

      tracker.clear();

      expect(tracker.getChangedFiles()).toHaveLength(0);
      expect(tracker.getChangeCount()).toBe(0);
    });

    it('should record timestamp with changes', () => {
      const before = new Date();
      tracker.recordChange('/tmp/test.txt', 'Write');
      const after = new Date();

      const history = tracker.getChangeHistory('/tmp/test.txt');
      expect(history[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(history[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('createToolLoggerHook', () => {
    it('should always allow tool execution', async () => {
      const hook = createToolLoggerHook();
      const result = await hook.callback('Read', { file_path: '/tmp/test.txt' });

      expect(result.allow).toBe(true);
    });

    it('should not have a filter', () => {
      const hook = createToolLoggerHook();
      expect(hook.filter).toBeUndefined();
    });
  });

  describe('createFileChangeTrackerHook', () => {
    it('should track Write operations', async () => {
      const tracker = new FileChangeTracker();
      const hook = createFileChangeTrackerHook(tracker);

      await hook.callback(
        'Write',
        { file_path: '/tmp/test.txt', content: 'hello' },
        'Success'
      );

      expect(tracker.wasModified('/tmp/test.txt')).toBe(true);
    });

    it('should track Edit operations', async () => {
      const tracker = new FileChangeTracker();
      const hook = createFileChangeTrackerHook(tracker);

      await hook.callback(
        'Edit',
        { file_path: '/tmp/test.txt', old_string: 'a', new_string: 'b' },
        'Success'
      );

      expect(tracker.wasModified('/tmp/test.txt')).toBe(true);
    });

    it('should have Write and Edit filter', () => {
      const tracker = new FileChangeTracker();
      const hook = createFileChangeTrackerHook(tracker);

      expect(hook.filter?.tools).toContain('Write');
      expect(hook.filter?.tools).toContain('Edit');
    });
  });

  describe('createDangerousToolBlocker', () => {
    it('should block matching commands', async () => {
      const hook = createDangerousToolBlocker([/rm\s+-rf/]);
      const result = await hook.callback('Bash', { command: 'rm -rf /' });

      expect(result.allow).toBe(false);
      expect(result.reason).toContain('rm\\s+-rf');
    });

    it('should allow non-matching commands', async () => {
      const hook = createDangerousToolBlocker([/rm\s+-rf/]);
      const result = await hook.callback('Bash', { command: 'ls -la' });

      expect(result.allow).toBe(true);
    });

    it('should check multiple patterns', async () => {
      const hook = createDangerousToolBlocker([/rm\s+-rf/, /curl.*\|.*sh/]);

      const result1 = await hook.callback('Bash', { command: 'rm -rf /' });
      expect(result1.allow).toBe(false);

      const result2 = await hook.callback('Bash', { command: 'curl example.com | sh' });
      expect(result2.allow).toBe(false);
    });

    it('should have Bash filter', () => {
      const hook = createDangerousToolBlocker([/test/]);
      expect(hook.filter?.tools).toContain('Bash');
    });

    it('should allow non-Bash tools', async () => {
      const hook = createDangerousToolBlocker([/rm\s+-rf/]);
      // Hook only applies to Bash due to filter, but callback handles any tool
      const result = await hook.callback('Write', { file_path: '/etc/passwd' });
      expect(result.allow).toBe(true);
    });
  });

  describe('createPathRestrictionHook', () => {
    it('should block restricted paths', async () => {
      const hook = createPathRestrictionHook(['/etc', '/root']);

      const result = await hook.callback('Write', { file_path: '/etc/passwd' });
      expect(result.allow).toBe(false);
      expect(result.reason).toContain('/etc');
    });

    it('should allow non-restricted paths', async () => {
      const hook = createPathRestrictionHook(['/etc', '/root']);

      const result = await hook.callback('Write', { file_path: '/tmp/test.txt' });
      expect(result.allow).toBe(true);
    });

    it('should have Write and Edit filter', () => {
      const hook = createPathRestrictionHook(['/etc']);

      expect(hook.filter?.tools).toContain('Write');
      expect(hook.filter?.tools).toContain('Edit');
    });
  });

  describe('buildHooksConfig', () => {
    it('should add logging hook when enabled', () => {
      const config = buildHooksConfig({ logToolUse: true });

      expect(config.PreToolUse).toBeDefined();
      expect(config.PreToolUse).toHaveLength(1);
    });

    it('should add file tracking hook when enabled', () => {
      const config = buildHooksConfig({ trackFileChanges: true });

      expect(config.PostToolUse).toBeDefined();
      expect(config.PostToolUse).toHaveLength(1);
    });

    it('should add blocked patterns', () => {
      const config = buildHooksConfig({ blockedPatterns: [/rm -rf/] });

      expect(config.PreToolUse).toBeDefined();
      expect(config.PreToolUse).toHaveLength(1);
    });

    it('should add custom validators', () => {
      const validator = async () => ({ allow: true });
      const config = buildHooksConfig({ preToolValidators: [validator] });

      expect(config.PreToolUse).toBeDefined();
      expect(config.PreToolUse).toHaveLength(1);
    });

    it('should add custom handlers', () => {
      const handler = async () => {};
      const config = buildHooksConfig({ postToolHandlers: [handler] });

      expect(config.PostToolUse).toBeDefined();
      expect(config.PostToolUse).toHaveLength(1);
    });

    it('should combine multiple hooks', () => {
      const config = buildHooksConfig({
        logToolUse: true,
        blockedPatterns: [/rm -rf/],
        preToolValidators: [async () => ({ allow: true })],
      });

      expect(config.PreToolUse).toHaveLength(3);
    });

    it('should return empty config when nothing enabled', () => {
      const config = buildHooksConfig({});

      expect(config.PreToolUse).toBeUndefined();
      expect(config.PostToolUse).toBeUndefined();
    });
  });

  describe('createGateIntegrationHooks', () => {
    it('should create hooks for restricted paths', () => {
      const hooks = createGateIntegrationHooks({
        restrictedPaths: ['/etc', '/root'],
      });

      expect(hooks.PreToolUse).toHaveLength(1);
    });

    it('should create hooks for blocked commands', () => {
      const hooks = createGateIntegrationHooks({
        blockedCommands: [/rm -rf/],
      });

      expect(hooks.PreToolUse).toHaveLength(1);
    });

    it('should combine path and command restrictions', () => {
      const hooks = createGateIntegrationHooks({
        restrictedPaths: ['/etc'],
        blockedCommands: [/rm -rf/],
      });

      expect(hooks.PreToolUse).toHaveLength(2);
    });

    it('should return empty hooks when no restrictions', () => {
      const hooks = createGateIntegrationHooks({});

      expect(hooks.PreToolUse).toBeUndefined();
    });
  });

  describe('mergeHooksConfig', () => {
    it('should merge PreToolUse hooks', () => {
      const config1 = { PreToolUse: [{ callback: async () => ({ allow: true }) }] };
      const config2 = { PreToolUse: [{ callback: async () => ({ allow: true }) }] };

      const merged = mergeHooksConfig(config1, config2);

      expect(merged.PreToolUse).toHaveLength(2);
    });

    it('should merge PostToolUse hooks', () => {
      const config1 = { PostToolUse: [{ callback: async () => {} }] };
      const config2 = { PostToolUse: [{ callback: async () => {} }] };

      const merged = mergeHooksConfig(config1, config2);

      expect(merged.PostToolUse).toHaveLength(2);
    });

    it('should handle empty configs', () => {
      const config1 = { PreToolUse: [{ callback: async () => ({ allow: true }) }] };
      const config2 = {};

      const merged = mergeHooksConfig(config1, config2);

      expect(merged.PreToolUse).toHaveLength(1);
    });

    it('should merge multiple configs', () => {
      const config1 = { PreToolUse: [{ callback: async () => ({ allow: true }) }] };
      const config2 = { PreToolUse: [{ callback: async () => ({ allow: true }) }] };
      const config3 = { PreToolUse: [{ callback: async () => ({ allow: true }) }] };

      const merged = mergeHooksConfig(config1, config2, config3);

      expect(merged.PreToolUse).toHaveLength(3);
    });
  });
});
