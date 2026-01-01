/**
 * SDK Hooks Utilities
 *
 * Hook integration for Claude Agent SDK including:
 * - Tool logging
 * - File change tracking
 * - Dangerous tool blocking
 * - Gate integration
 */

import { createLogger } from '../utils/index.js';
import type {
  HooksConfig,
  PreToolUseHook,
  PostToolUseHook,
  HookResult,
  SDKHooksConfig,
} from './sdk-options-builder.js';

const logger = createLogger('agent:sdk-hooks');

// ============================================================================
// File Change Tracker
// ============================================================================

/**
 * Record of a file change
 */
export interface FileChangeRecord {
  action: string;
  timestamp: Date;
}

/**
 * Tracks file modifications during agent execution
 */
export class FileChangeTracker {
  private changes: Map<string, FileChangeRecord[]> = new Map();

  /**
   * Record a change to a file
   */
  recordChange(filePath: string, action: string): void {
    if (!this.changes.has(filePath)) {
      this.changes.set(filePath, []);
    }
    this.changes.get(filePath)!.push({
      action,
      timestamp: new Date(),
    });
    logger.debug({ filePath, action }, 'File change recorded');
  }

  /**
   * Get all changed files
   */
  getChangedFiles(): string[] {
    return Array.from(this.changes.keys());
  }

  /**
   * Get change history for a specific file
   */
  getChangeHistory(filePath: string): FileChangeRecord[] {
    return this.changes.get(filePath) ?? [];
  }

  /**
   * Check if a file was modified
   */
  wasModified(filePath: string): boolean {
    return this.changes.has(filePath);
  }

  /**
   * Get total number of changes
   */
  getChangeCount(): number {
    let count = 0;
    for (const records of this.changes.values()) {
      count += records.length;
    }
    return count;
  }

  /**
   * Clear all recorded changes
   */
  clear(): void {
    this.changes.clear();
  }
}

// ============================================================================
// Hook Creators
// ============================================================================

/**
 * Create a tool logging hook
 */
export function createToolLoggerHook(): PreToolUseHook {
  return {
    callback: (tool: string, input: Record<string, unknown>): Promise<HookResult> => {
      logger.debug({ tool, input }, 'Tool invocation');
      return Promise.resolve({ allow: true });
    },
  };
}

/**
 * Create a file change tracker hook
 */
export function createFileChangeTrackerHook(
  tracker: FileChangeTracker
): PostToolUseHook {
  return {
    filter: { tools: ['Write', 'Edit'] },
    callback: (
      tool: string,
      input: Record<string, unknown>,
      _output: string
    ): Promise<void> => {
      if (tool === 'Write' || tool === 'Edit') {
        const filePath = input.file_path as string | undefined;
        if (filePath) {
          tracker.recordChange(filePath, tool);
        }
      }
      return Promise.resolve();
    },
  };
}

/**
 * Create a dangerous tool blocker hook
 */
export function createDangerousToolBlocker(
  blockedPatterns: RegExp[]
): PreToolUseHook {
  return {
    filter: { tools: ['Bash'] },
    callback: (
      tool: string,
      input: Record<string, unknown>
    ): Promise<HookResult> => {
      if (tool === 'Bash') {
        const command = input.command as string | undefined;
        if (command) {
          for (const pattern of blockedPatterns) {
            if (pattern.test(command)) {
              logger.warn(
                { command, pattern: pattern.source },
                'Blocked dangerous command'
              );
              return Promise.resolve({
                allow: false,
                reason: `Blocked dangerous command matching ${pattern.source}`,
              });
            }
          }
        }
      }
      return Promise.resolve({ allow: true });
    },
  };
}

/**
 * Create a hook that blocks file modifications to restricted paths
 */
export function createPathRestrictionHook(
  restrictedPaths: string[]
): PreToolUseHook {
  return {
    filter: { tools: ['Write', 'Edit'] },
    callback: (
      _tool: string,
      input: Record<string, unknown>
    ): Promise<HookResult> => {
      const filePath = input.file_path as string | undefined;
      if (filePath) {
        for (const restricted of restrictedPaths) {
          if (filePath.startsWith(restricted)) {
            logger.warn(
              { filePath, restrictedPath: restricted },
              'Blocked modification to restricted path'
            );
            return Promise.resolve({
              allow: false,
              reason: `Path ${restricted} is restricted`,
            });
          }
        }
      }
      return Promise.resolve({ allow: true });
    },
  };
}

// ============================================================================
// Hooks Configuration Builder
// ============================================================================

/**
 * Build SDK hooks configuration from SDKHooksConfig
 */
export function buildHooksConfig(config: SDKHooksConfig): HooksConfig {
  const hooks: HooksConfig = {};

  const preToolHooks: PreToolUseHook[] = [];
  const postToolHooks: PostToolUseHook[] = [];

  // Add logging hook
  if (config.logToolUse) {
    preToolHooks.push(createToolLoggerHook());
  }

  // Add file tracking hook
  if (config.trackFileChanges) {
    const tracker = new FileChangeTracker();
    postToolHooks.push(createFileChangeTrackerHook(tracker));
  }

  // Add blocked patterns
  if (config.blockedPatterns && config.blockedPatterns.length > 0) {
    preToolHooks.push(createDangerousToolBlocker(config.blockedPatterns));
  }

  // Add custom validators
  if (config.preToolValidators) {
    for (const validator of config.preToolValidators) {
      preToolHooks.push({ callback: validator });
    }
  }

  // Add custom handlers
  if (config.postToolHandlers) {
    for (const handler of config.postToolHandlers) {
      postToolHooks.push({ callback: handler });
    }
  }

  if (preToolHooks.length > 0) {
    hooks.PreToolUse = preToolHooks;
  }
  if (postToolHooks.length > 0) {
    hooks.PostToolUse = postToolHooks;
  }

  return hooks;
}

// ============================================================================
// Gate Integration
// ============================================================================

/**
 * Gate configuration for hook integration
 */
export interface GateConfig {
  restrictedPaths?: string[];
  blockedCommands?: RegExp[];
}

/**
 * Create hooks for gate integration
 */
export function createGateIntegrationHooks(gateConfig: GateConfig): HooksConfig {
  const hooks: HooksConfig = {};
  const preToolHooks: PreToolUseHook[] = [];

  // Block file modifications to restricted paths
  if (gateConfig.restrictedPaths && gateConfig.restrictedPaths.length > 0) {
    preToolHooks.push(createPathRestrictionHook(gateConfig.restrictedPaths));
  }

  // Block dangerous commands
  if (gateConfig.blockedCommands && gateConfig.blockedCommands.length > 0) {
    preToolHooks.push(createDangerousToolBlocker(gateConfig.blockedCommands));
  }

  if (preToolHooks.length > 0) {
    hooks.PreToolUse = preToolHooks;
  }

  return hooks;
}

/**
 * Merge multiple hook configurations
 */
export function mergeHooksConfig(...configs: HooksConfig[]): HooksConfig {
  const merged: HooksConfig = {};

  for (const config of configs) {
    if (config.PreToolUse) {
      merged.PreToolUse = [...(merged.PreToolUse ?? []), ...config.PreToolUse];
    }
    if (config.PostToolUse) {
      merged.PostToolUse = [...(merged.PostToolUse ?? []), ...config.PostToolUse];
    }
  }

  return merged;
}
