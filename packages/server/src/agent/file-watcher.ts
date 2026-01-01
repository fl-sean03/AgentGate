/**
 * File Watcher Module
 *
 * Watches workspace directories for file changes and emits FileChangedEvents.
 * Uses native fs.watch with debouncing and pattern filtering.
 */

import { watch, type FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createLogger } from '../utils/index.js';
import type { FileChangeAction, FileChangedEvent } from '../server/websocket/types.js';

const logger = createLogger('agent:file-watcher');

/**
 * Default ignore patterns for file watching
 */
export const DEFAULT_IGNORE_PATTERNS = [
  '.git',
  'node_modules',
  '.next',
  '.nuxt',
  'dist',
  'build',
  '.turbo',
  '.cache',
  '*.log',
  '*.swp',
  '*.swo',
  '.DS_Store',
  'Thumbs.db',
];

/**
 * Options for the FileWatcher
 */
export interface FileWatcherOptions {
  /** Patterns to ignore (glob-like matching) */
  ignorePatterns?: string[];
  /** Debounce window in milliseconds (default: 100) */
  debounceMs?: number;
  /** Watch subdirectories recursively (default: true) */
  recursive?: boolean;
  /** Track file sizes (default: true) */
  trackSizes?: boolean;
}

/**
 * Internal pending change entry for debouncing
 */
interface PendingChange {
  path: string;
  action: FileChangeAction;
  timer: NodeJS.Timeout;
}

/**
 * FileWatcher monitors a workspace directory for file changes.
 *
 * Features:
 * - Watches for file create, modify, and delete events
 * - Filters out ignored patterns (.git, node_modules, etc.)
 * - Debounces rapid changes to reduce noise
 * - Provides file size information
 */
export class FileWatcher {
  private readonly workspacePath: string;
  private readonly ignorePatterns: string[];
  private readonly debounceMs: number;
  private readonly recursive: boolean;
  private readonly trackSizes: boolean;

  private watcher: FSWatcher | null = null;
  private callbacks: Array<(event: FileChangedEvent) => void> = [];
  private pendingChanges: Map<string, PendingChange> = new Map();
  private knownFiles: Set<string> = new Set();
  private started = false;

  constructor(workspacePath: string, options?: FileWatcherOptions) {
    this.workspacePath = workspacePath;
    this.ignorePatterns = options?.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
    this.debounceMs = options?.debounceMs ?? 100;
    this.recursive = options?.recursive ?? true;
    this.trackSizes = options?.trackSizes ?? true;

    logger.debug(
      {
        workspacePath,
        ignorePatterns: this.ignorePatterns,
        debounceMs: this.debounceMs,
        recursive: this.recursive,
      },
      'FileWatcher initialized'
    );
  }

  /**
   * Register a callback for file change events
   */
  onFileChange(callback: (event: FileChangedEvent) => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Start watching the workspace directory
   */
  start(): void {
    if (this.started) {
      logger.warn('FileWatcher already started');
      return;
    }

    try {
      this.watcher = watch(
        this.workspacePath,
        { recursive: this.recursive, persistent: false },
        (eventType, filename) => {
          if (filename) {
            this.handleChange(eventType, filename);
          }
        }
      );

      this.watcher.on('error', (error: Error) => {
        logger.error({ err: error }, 'File watcher error');
      });

      this.started = true;
      logger.info({ workspacePath: this.workspacePath }, 'FileWatcher started');
    } catch (error) {
      logger.error({ err: error, workspacePath: this.workspacePath }, 'Failed to start file watcher');
      throw error;
    }
  }

  /**
   * Stop watching and cleanup
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    // Clear all pending timers
    for (const pending of this.pendingChanges.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingChanges.clear();

    // Close the watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.started = false;
    logger.info({ workspacePath: this.workspacePath }, 'FileWatcher stopped');
  }

  /**
   * Check if the watcher is currently running
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * Handle a file change event from fs.watch
   */
  private handleChange(eventType: 'rename' | 'change', filename: string): void {
    // Normalize the path
    const fullPath = join(this.workspacePath, filename);
    const relativePath = filename;

    // Check if path should be ignored
    if (this.shouldIgnore(relativePath)) {
      logger.debug({ path: relativePath }, 'Ignoring file change');
      return;
    }

    // Debounce the change
    this.debouncedEmit(relativePath, fullPath, eventType);
  }

  /**
   * Check if a path matches any ignore pattern
   */
  private shouldIgnore(relativePath: string): boolean {
    const pathParts = relativePath.split(/[/\\]/);
    const fileName = basename(relativePath);

    for (const pattern of this.ignorePatterns) {
      // Check for directory patterns (without *)
      if (!pattern.includes('*')) {
        if (pathParts.includes(pattern)) {
          return true;
        }
        if (fileName === pattern) {
          return true;
        }
      }

      // Check for glob patterns like *.log
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1); // Get .log
        if (fileName.endsWith(ext)) {
          return true;
        }
      }

      // Check for directory glob patterns like **/.git
      if (pattern.includes('**/')) {
        const dirName = pattern.replace('**/', '');
        if (pathParts.includes(dirName)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Debounce and emit file change event
   */
  private debouncedEmit(
    relativePath: string,
    fullPath: string,
    eventType: 'rename' | 'change'
  ): void {
    // Cancel any existing pending change for this path
    const existing = this.pendingChanges.get(relativePath);
    if (existing) {
      clearTimeout(existing.timer);
    }

    // Create a new pending change with timer
    const timer = setTimeout(() => {
      this.pendingChanges.delete(relativePath);
      void this.emitChange(relativePath, fullPath, eventType);
    }, this.debounceMs);

    // Store the pending change
    this.pendingChanges.set(relativePath, {
      path: relativePath,
      action: 'modified', // Will be determined when timer fires
      timer,
    });
  }

  /**
   * Emit a file change event
   */
  private async emitChange(
    relativePath: string,
    fullPath: string,
    eventType: 'rename' | 'change'
  ): Promise<void> {
    let action: FileChangeAction;
    let sizeBytes: number | undefined;

    try {
      const stats = await stat(fullPath);
      sizeBytes = this.trackSizes ? stats.size : undefined;

      // Determine if this is a create or modify
      if (this.knownFiles.has(relativePath)) {
        action = 'modified';
      } else {
        action = 'created';
        this.knownFiles.add(relativePath);
      }
    } catch {
      // File doesn't exist - it was deleted
      action = 'deleted';
      this.knownFiles.delete(relativePath);
    }

    // If it was a rename event and file exists now but wasn't known, it's created
    if (eventType === 'rename' && action !== 'deleted' && !this.knownFiles.has(relativePath)) {
      action = 'created';
      this.knownFiles.add(relativePath);
    }

    const event: FileChangedEvent = {
      type: 'file_changed',
      workOrderId: '', // Will be set by caller
      runId: '', // Will be set by caller
      path: relativePath,
      action,
      ...(sizeBytes !== undefined && { sizeBytes }),
      timestamp: new Date().toISOString(),
    };

    logger.debug(
      { path: relativePath, action, sizeBytes },
      'Emitting file change event'
    );

    // Notify all callbacks
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        logger.error({ err: error }, 'Error in file change callback');
      }
    }
  }

  /**
   * Mark a file as known (for accurate create/modify detection)
   */
  markFileKnown(relativePath: string): void {
    this.knownFiles.add(relativePath);
  }

  /**
   * Clear the known files set
   */
  clearKnownFiles(): void {
    this.knownFiles.clear();
  }

  /**
   * Get the count of registered callbacks
   */
  getCallbackCount(): number {
    return this.callbacks.length;
  }
}

/**
 * Create a FileWatcher instance with context for a specific work order run
 */
export interface FileWatcherWithContext {
  watcher: FileWatcher;
  start: () => void;
  stop: () => void;
  onFileChange: (callback: (event: FileChangedEvent) => void) => void;
}

/**
 * Create a file watcher with work order context
 */
export function createFileWatcher(
  workspacePath: string,
  workOrderId: string,
  runId: string,
  options?: FileWatcherOptions
): FileWatcherWithContext {
  const watcher = new FileWatcher(workspacePath, options);

  return {
    watcher,
    start: (): void => watcher.start(),
    stop: (): void => watcher.stop(),
    onFileChange: (callback: (event: FileChangedEvent) => void): void => {
      watcher.onFileChange((event) => {
        // Inject work order context
        callback({
          ...event,
          workOrderId,
          runId,
        });
      });
    },
  };
}
