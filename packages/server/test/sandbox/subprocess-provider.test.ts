/**
 * Subprocess Provider Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SubprocessProvider } from '../../src/sandbox/subprocess-provider.js';
import type { Sandbox } from '../../src/sandbox/types.js';

describe('SubprocessProvider', () => {
  let provider: SubprocessProvider;
  let tempDir: string;
  let sandbox: Sandbox | null = null;

  beforeEach(async () => {
    provider = new SubprocessProvider();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
  });

  afterEach(async () => {
    // Destroy sandbox if created
    if (sandbox) {
      await sandbox.destroy();
      sandbox = null;
    }

    // Cleanup provider
    await provider.cleanup();

    // Remove temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('provider basics', () => {
    it('should have name "subprocess"', () => {
      expect(provider.name).toBe('subprocess');
    });

    it('should always be available', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should list sandboxes', async () => {
      const sandboxes = await provider.listSandboxes();
      expect(sandboxes).toEqual([]);
    });
  });

  describe('createSandbox', () => {
    it('should create sandbox with valid workspace path', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      expect(sandbox).toBeDefined();
      expect(sandbox.id).toMatch(/^subprocess-/);
      expect(sandbox.status).toBe('running');
    });

    it('should throw if workspace path does not exist', async () => {
      await expect(
        provider.createSandbox({
          workspacePath: '/nonexistent/path',
        })
      ).rejects.toThrow('Workspace path does not exist');
    });

    it('should register sandbox in provider', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      const sandboxes = await provider.listSandboxes();
      expect(sandboxes).toHaveLength(1);
      expect(sandboxes[0]?.id).toBe(sandbox.id);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });
    });

    it('should execute simple command', async () => {
      const result = await sandbox!.execute('echo', ['hello world']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello world');
      expect(result.stderr).toBe('');
      expect(result.timedOut).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should capture stderr', async () => {
      const result = await sandbox!.execute('sh', [
        '-c',
        'echo error >&2; exit 1',
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr.trim()).toBe('error');
    });

    it('should handle node execution', async () => {
      const result = await sandbox!.execute('node', [
        '-e',
        'console.log("test output")',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test output');
    });

    it('should use workspace as cwd', async () => {
      const result = await sandbox!.execute('pwd', []);

      expect(result.exitCode).toBe(0);
      // Normalize path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
      const expectedPath = await fs.realpath(tempDir);
      expect(result.stdout.trim()).toBe(expectedPath);
    });

    it('should use custom cwd within workspace', async () => {
      const subdir = 'subdir';
      const subdirPath = path.join(tempDir, subdir);
      await fs.mkdir(subdirPath);

      const result = await sandbox!.execute('pwd', [], {
        cwd: subdir,
      });

      expect(result.exitCode).toBe(0);
      // Normalize path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
      const expectedPath = await fs.realpath(subdirPath);
      expect(result.stdout.trim()).toBe(expectedPath);
    });

    it('should pass environment variables', async () => {
      const result = await sandbox!.execute('sh', ['-c', 'echo $TEST_VAR'], {
        env: { TEST_VAR: 'test_value' },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test_value');
    });

    it('should handle timeout', async () => {
      const result = await sandbox!.execute('sleep', ['10'], {
        timeout: 1, // 1 second timeout
      });

      expect(result.timedOut).toBe(true);
      expect(result.exitCode).not.toBe(0);
    });

    it('should handle stdin', async () => {
      const result = await sandbox!.execute('cat', [], {
        stdin: 'input text',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('input text');
    });

    it('should throw if sandbox is destroyed', async () => {
      await sandbox!.destroy();

      await expect(sandbox!.execute('echo', ['test'])).rejects.toThrow(
        'Sandbox is not running'
      );
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });
    });

    it('should write and read file', async () => {
      await sandbox!.writeFile('test.txt', 'file content');
      const content = await sandbox!.readFile('test.txt');

      expect(content).toBe('file content');
    });

    it('should create nested directories for writeFile', async () => {
      await sandbox!.writeFile('nested/deep/file.txt', 'nested content');
      const content = await sandbox!.readFile('nested/deep/file.txt');

      expect(content).toBe('nested content');
    });

    it('should list files in directory', async () => {
      await sandbox!.writeFile('file1.txt', 'content1');
      await sandbox!.writeFile('file2.txt', 'content2');

      const files = await sandbox!.listFiles('.');

      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });

    it('should block path traversal in writeFile', async () => {
      await expect(
        sandbox!.writeFile('../escape.txt', 'malicious')
      ).rejects.toThrow('Path traversal detected');
    });

    it('should block path traversal in readFile', async () => {
      await expect(sandbox!.readFile('../../../etc/passwd')).rejects.toThrow(
        'Path traversal detected'
      );
    });

    it('should block path traversal in listFiles', async () => {
      await expect(sandbox!.listFiles('../..')).rejects.toThrow(
        'Path traversal detected'
      );
    });

    it('should throw if sandbox is destroyed', async () => {
      await sandbox!.destroy();

      await expect(sandbox!.writeFile('test.txt', 'content')).rejects.toThrow(
        'Sandbox is not running'
      );

      await expect(sandbox!.readFile('test.txt')).rejects.toThrow(
        'Sandbox is not running'
      );

      await expect(sandbox!.listFiles('.')).rejects.toThrow(
        'Sandbox is not running'
      );
    });
  });

  describe('destroy', () => {
    it('should set status to destroyed', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      expect(sandbox.status).toBe('running');

      await sandbox.destroy();

      expect(sandbox.status).toBe('destroyed');
    });

    it('should unregister from provider', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      const sandboxId = sandbox.id;
      await sandbox.destroy();
      sandbox = null; // Don't double-destroy in afterEach

      const sandboxes = await provider.listSandboxes();
      expect(sandboxes.find((s) => s.id === sandboxId)).toBeUndefined();
    });

    it('should be idempotent', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      await sandbox.destroy();
      await sandbox.destroy(); // Should not throw
      sandbox = null;

      expect(true).toBe(true); // If we get here, no error
    });

    it('should kill running processes', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      // Start a long-running process (don't await)
      const execPromise = sandbox.execute('sleep', ['60']);

      // Destroy immediately
      await sandbox.destroy();
      sandbox = null;

      // The exec should complete (possibly with error) after destroy
      const result = await execPromise;
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return empty stats', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
      });

      const stats = await sandbox.getStats();

      expect(stats).toEqual({});
    });
  });

  describe('cleanup', () => {
    it('should destroy all sandboxes', async () => {
      const sandbox1 = await provider.createSandbox({
        workspacePath: tempDir,
      });
      const sandbox2 = await provider.createSandbox({
        workspacePath: tempDir,
      });

      expect(await provider.listSandboxes()).toHaveLength(2);

      await provider.cleanup();

      expect(await provider.listSandboxes()).toHaveLength(0);
      expect(sandbox1.status).toBe('destroyed');
      expect(sandbox2.status).toBe('destroyed');
    });
  });

  describe('config options', () => {
    it('should use env from config', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
        env: { CONFIG_VAR: 'from_config' },
      });

      const result = await sandbox.execute('sh', ['-c', 'echo $CONFIG_VAR']);

      expect(result.stdout.trim()).toBe('from_config');
    });

    it('should use resourceLimits.timeoutSeconds as default timeout', async () => {
      sandbox = await provider.createSandbox({
        workspacePath: tempDir,
        resourceLimits: {
          timeoutSeconds: 1,
        },
      });

      // This will use the default 1 second timeout
      const result = await sandbox.execute('sleep', ['10']);

      expect(result.timedOut).toBe(true);
    });
  });
});
