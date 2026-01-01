/**
 * File Watcher Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  FileWatcher,
  createFileWatcher,
  DEFAULT_IGNORE_PATTERNS,
} from '../src/agent/file-watcher.js';
import type { FileChangedEvent } from '../src/server/websocket/types.js';

/**
 * Helper to wait for a specified duration
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('FileWatcher', () => {
  let tempDir: string;
  let watcher: FileWatcher;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-test-'));
  });

  afterEach(async () => {
    if (watcher) {
      watcher.stop();
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create watcher with default options', () => {
      watcher = new FileWatcher(tempDir);
      expect(watcher).toBeDefined();
      expect(watcher.isRunning()).toBe(false);
    });

    it('should create watcher with custom options', () => {
      watcher = new FileWatcher(tempDir, {
        ignorePatterns: ['.git', 'dist'],
        debounceMs: 50,
        recursive: false,
        trackSizes: false,
      });
      expect(watcher).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('should start and stop watching', () => {
      watcher = new FileWatcher(tempDir);

      expect(watcher.isRunning()).toBe(false);

      watcher.start();
      expect(watcher.isRunning()).toBe(true);

      watcher.stop();
      expect(watcher.isRunning()).toBe(false);
    });

    it('should handle multiple start calls', () => {
      watcher = new FileWatcher(tempDir);

      watcher.start();
      watcher.start(); // Should log warning but not throw

      expect(watcher.isRunning()).toBe(true);
    });

    it('should handle stop when not started', () => {
      watcher = new FileWatcher(tempDir);

      // Should not throw
      watcher.stop();

      expect(watcher.isRunning()).toBe(false);
    });
  });

  describe('onFileChange', () => {
    it('should register callbacks', () => {
      watcher = new FileWatcher(tempDir);

      expect(watcher.getCallbackCount()).toBe(0);

      watcher.onFileChange(() => {});
      expect(watcher.getCallbackCount()).toBe(1);

      watcher.onFileChange(() => {});
      expect(watcher.getCallbackCount()).toBe(2);
    });
  });

  describe('file detection', () => {
    it('should detect file creation', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50 });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      await writeFile(join(tempDir, 'test.txt'), 'hello');
      await wait(200);

      expect(events.length).toBeGreaterThanOrEqual(1);
      const createEvent = events.find(e => e.path === 'test.txt' && e.action === 'created');
      expect(createEvent).toBeDefined();
    });

    it('should detect file modification', async () => {
      // Create file first
      await writeFile(join(tempDir, 'existing.txt'), 'initial');

      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50 });
      watcher.markFileKnown('existing.txt');
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      // Modify the file
      await writeFile(join(tempDir, 'existing.txt'), 'modified');
      await wait(200);

      expect(events.length).toBeGreaterThanOrEqual(1);
      const modifyEvent = events.find(e => e.path === 'existing.txt' && e.action === 'modified');
      expect(modifyEvent).toBeDefined();
    });

    it('should detect file deletion', async () => {
      // Create file first
      const filePath = join(tempDir, 'to-delete.txt');
      await writeFile(filePath, 'delete me');

      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50 });
      watcher.markFileKnown('to-delete.txt');
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      // Delete the file
      await unlink(filePath);
      await wait(200);

      expect(events.length).toBeGreaterThanOrEqual(1);
      const deleteEvent = events.find(e => e.path === 'to-delete.txt' && e.action === 'deleted');
      expect(deleteEvent).toBeDefined();
    });

    it('should include file size for created files', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50, trackSizes: true });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      const content = 'hello world';
      await writeFile(join(tempDir, 'sized.txt'), content);
      await wait(200);

      const createEvent = events.find(e => e.path === 'sized.txt');
      expect(createEvent).toBeDefined();
      expect(createEvent?.sizeBytes).toBe(content.length);
    });
  });

  describe('ignore patterns', () => {
    it('should ignore .git directory', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50 });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      await mkdir(join(tempDir, '.git'), { recursive: true });
      await writeFile(join(tempDir, '.git', 'config'), 'test');
      await wait(200);

      const gitEvents = events.filter(e => e.path.includes('.git'));
      expect(gitEvents.length).toBe(0);
    });

    it('should ignore node_modules directory', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50 });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      await mkdir(join(tempDir, 'node_modules'), { recursive: true });
      await writeFile(join(tempDir, 'node_modules', 'package.json'), '{}');
      await wait(200);

      const nmEvents = events.filter(e => e.path.includes('node_modules'));
      expect(nmEvents.length).toBe(0);
    });

    it('should ignore *.log files', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 50 });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      await writeFile(join(tempDir, 'debug.log'), 'log content');
      await wait(200);

      const logEvents = events.filter(e => e.path.endsWith('.log'));
      expect(logEvents.length).toBe(0);
    });

    it('should use custom ignore patterns', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, {
        debounceMs: 50,
        ignorePatterns: ['custom-ignore'],
      });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      await mkdir(join(tempDir, 'custom-ignore'), { recursive: true });
      await writeFile(join(tempDir, 'custom-ignore', 'file.txt'), 'test');
      await wait(200);

      const customEvents = events.filter(e => e.path.includes('custom-ignore'));
      expect(customEvents.length).toBe(0);
    });
  });

  describe('debouncing', () => {
    it('should debounce rapid changes', async () => {
      const events: FileChangedEvent[] = [];
      watcher = new FileWatcher(tempDir, { debounceMs: 100 });
      watcher.onFileChange(e => events.push(e));
      watcher.start();

      const filePath = join(tempDir, 'rapid.txt');

      // Rapid writes
      await writeFile(filePath, 'v1');
      await writeFile(filePath, 'v2');
      await writeFile(filePath, 'v3');
      await wait(300);

      // Should have at most a couple of events, not 3
      expect(events.filter(e => e.path === 'rapid.txt').length).toBeLessThanOrEqual(2);
    });
  });

  describe('markFileKnown', () => {
    it('should allow marking files as known', () => {
      watcher = new FileWatcher(tempDir);

      // Should not throw
      watcher.markFileKnown('known-file.txt');
    });

    it('should clear known files', () => {
      watcher = new FileWatcher(tempDir);

      watcher.markFileKnown('file1.txt');
      watcher.markFileKnown('file2.txt');

      // Should not throw
      watcher.clearKnownFiles();
    });
  });
});

describe('createFileWatcher', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'watcher-ctx-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should create watcher with context', () => {
    const ctx = createFileWatcher(tempDir, 'wo-123', 'run-456');

    expect(ctx.watcher).toBeDefined();
    expect(typeof ctx.start).toBe('function');
    expect(typeof ctx.stop).toBe('function');
    expect(typeof ctx.onFileChange).toBe('function');
  });

  it('should inject work order context into events', async () => {
    const events: FileChangedEvent[] = [];
    const ctx = createFileWatcher(tempDir, 'wo-123', 'run-456', { debounceMs: 50 });

    ctx.onFileChange(e => events.push(e));
    ctx.start();

    await writeFile(join(tempDir, 'context-test.txt'), 'content');
    await wait(200);

    ctx.stop();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const event = events.find(e => e.path === 'context-test.txt');
    expect(event?.workOrderId).toBe('wo-123');
    expect(event?.runId).toBe('run-456');
  });
});

describe('DEFAULT_IGNORE_PATTERNS', () => {
  it('should include common patterns', () => {
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.git');
    expect(DEFAULT_IGNORE_PATTERNS).toContain('node_modules');
    expect(DEFAULT_IGNORE_PATTERNS).toContain('*.log');
    expect(DEFAULT_IGNORE_PATTERNS).toContain('.DS_Store');
  });
});
