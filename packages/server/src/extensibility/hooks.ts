/**
 * Hook System - Provides extension points for customization.
 * Allows plugins to intercept and modify behavior at key points.
 *
 * (v0.2.27 - Phase 3: Extensibility Framework)
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('hooks');

/**
 * Hook execution timing
 */
export type HookTiming = 'before' | 'after' | 'around';

/**
 * Hook priority (higher = earlier execution)
 */
export type HookPriority = number;

/**
 * Hook handler function
 */
export type HookHandler<TContext = unknown, TResult = void> = (
  context: TContext,
  next?: () => Promise<TResult>
) => Promise<TResult | void>;

/**
 * Registered hook entry
 */
interface HookEntry<TContext, TResult> {
  name: string;
  handler: HookHandler<TContext, TResult>;
  priority: HookPriority;
  timing: HookTiming;
  enabled: boolean;
}

/**
 * Hook execution result
 */
export interface HookResult<T> {
  /** Whether execution completed successfully */
  success: boolean;
  /** Result value (if any) */
  result?: T;
  /** Hooks that were executed */
  executed: string[];
  /** Hooks that failed */
  failed: Array<{ name: string; error: string }>;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Hook registry for a specific hook point
 */
export class HookRegistry<TContext = unknown, TResult = void> {
  private readonly hooks: Map<string, HookEntry<TContext, TResult>> = new Map();
  private readonly hookName: string;

  constructor(name: string) {
    this.hookName = name;
  }

  /**
   * Register a hook handler
   */
  register(
    name: string,
    handler: HookHandler<TContext, TResult>,
    options: {
      priority?: HookPriority;
      timing?: HookTiming;
    } = {}
  ): void {
    const entry: HookEntry<TContext, TResult> = {
      name,
      handler,
      priority: options.priority ?? 50,
      timing: options.timing ?? 'after',
      enabled: true,
    };

    this.hooks.set(name, entry);
    log.debug({ hookPoint: this.hookName, hookName: name }, 'Hook registered');
  }

  /**
   * Unregister a hook handler
   */
  unregister(name: string): boolean {
    const existed = this.hooks.delete(name);
    if (existed) {
      log.debug({ hookPoint: this.hookName, hookName: name }, 'Hook unregistered');
    }
    return existed;
  }

  /**
   * Enable a hook
   */
  enable(name: string): boolean {
    const entry = this.hooks.get(name);
    if (entry) {
      entry.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a hook
   */
  disable(name: string): boolean {
    const entry = this.hooks.get(name);
    if (entry) {
      entry.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Get all registered hooks
   */
  getHooks(): Array<{ name: string; priority: number; timing: HookTiming; enabled: boolean }> {
    return Array.from(this.hooks.values()).map(h => ({
      name: h.name,
      priority: h.priority,
      timing: h.timing,
      enabled: h.enabled,
    }));
  }

  /**
   * Execute all hooks for a given timing
   */
  async execute(
    context: TContext,
    timing: HookTiming = 'after'
  ): Promise<HookResult<TResult>> {
    const startTime = Date.now();
    const result: HookResult<TResult> = {
      success: true,
      executed: [],
      failed: [],
      durationMs: 0,
    };

    // Get hooks for this timing, sorted by priority (higher first)
    const hooks = Array.from(this.hooks.values())
      .filter(h => h.enabled && h.timing === timing)
      .sort((a, b) => b.priority - a.priority);

    for (const hook of hooks) {
      try {
        await hook.handler(context);
        result.executed.push(hook.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.failed.push({ name: hook.name, error: message });
        result.success = false;
        log.error(
          { hookPoint: this.hookName, hookName: hook.name, error: message },
          'Hook execution failed'
        );
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Execute with around hooks (middleware pattern)
   */
  async executeAround(
    context: TContext,
    coreAction: () => Promise<TResult>
  ): Promise<HookResult<TResult>> {
    const startTime = Date.now();
    const result: HookResult<TResult> = {
      success: true,
      executed: [],
      failed: [],
      durationMs: 0,
    };

    // Get around hooks, sorted by priority
    const aroundHooks = Array.from(this.hooks.values())
      .filter(h => h.enabled && h.timing === 'around')
      .sort((a, b) => b.priority - a.priority);

    // Build middleware chain
    let chain = coreAction;
    for (const hook of aroundHooks.reverse()) {
      const next = chain;
      chain = async () => {
        try {
          const hookResult = await hook.handler(context, next);
          result.executed.push(hook.name);
          return hookResult as TResult;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result.failed.push({ name: hook.name, error: message });
          throw error;
        }
      };
    }

    try {
      result.result = await chain();
    } catch (error) {
      result.success = false;
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
    log.debug({ hookPoint: this.hookName }, 'All hooks cleared');
  }
}

/**
 * Global hook manager
 */
export class HookManager {
  private static instance: HookManager | null = null;
  private readonly registries: Map<string, HookRegistry<unknown, unknown>> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    HookManager.instance = null;
  }

  /**
   * Get or create a hook registry
   */
  getRegistry<TContext = unknown, TResult = void>(
    name: string
  ): HookRegistry<TContext, TResult> {
    let registry = this.registries.get(name);
    if (!registry) {
      registry = new HookRegistry(name);
      this.registries.set(name, registry);
    }
    return registry as HookRegistry<TContext, TResult>;
  }

  /**
   * Register a hook at a specific hook point
   */
  register<TContext = unknown, TResult = void>(
    hookPoint: string,
    name: string,
    handler: HookHandler<TContext, TResult>,
    options?: { priority?: number; timing?: HookTiming }
  ): void {
    const registry = this.getRegistry<TContext, TResult>(hookPoint);
    registry.register(name, handler, options);
  }

  /**
   * Unregister a hook
   */
  unregister(hookPoint: string, name: string): boolean {
    const registry = this.registries.get(hookPoint);
    if (registry) {
      return registry.unregister(name);
    }
    return false;
  }

  /**
   * Get all hook points
   */
  getHookPoints(): string[] {
    return Array.from(this.registries.keys());
  }

  /**
   * Clear all hooks
   */
  clearAll(): void {
    for (const registry of this.registries.values()) {
      registry.clear();
    }
    this.registries.clear();
  }
}

// ============================================================
// Predefined Hook Points
// ============================================================

/**
 * Work order lifecycle hook points
 */
export const WORK_ORDER_HOOKS = {
  BEFORE_SUBMIT: 'workOrder:beforeSubmit',
  AFTER_SUBMIT: 'workOrder:afterSubmit',
  BEFORE_START: 'workOrder:beforeStart',
  AFTER_START: 'workOrder:afterStart',
  BEFORE_COMPLETE: 'workOrder:beforeComplete',
  AFTER_COMPLETE: 'workOrder:afterComplete',
  ON_ERROR: 'workOrder:onError',
  ON_CANCEL: 'workOrder:onCancel',
} as const;

/**
 * Sandbox lifecycle hook points
 */
export const SANDBOX_HOOKS = {
  BEFORE_CREATE: 'sandbox:beforeCreate',
  AFTER_CREATE: 'sandbox:afterCreate',
  BEFORE_EXECUTE: 'sandbox:beforeExecute',
  AFTER_EXECUTE: 'sandbox:afterExecute',
  BEFORE_DESTROY: 'sandbox:beforeDestroy',
  AFTER_DESTROY: 'sandbox:afterDestroy',
} as const;

/**
 * Agent lifecycle hook points
 */
export const AGENT_HOOKS = {
  BEFORE_RUN: 'agent:beforeRun',
  AFTER_RUN: 'agent:afterRun',
  ON_OUTPUT: 'agent:onOutput',
  ON_ERROR: 'agent:onError',
  ON_TIMEOUT: 'agent:onTimeout',
} as const;

/**
 * Get the global hook manager
 */
export function getHookManager(): HookManager {
  return HookManager.getInstance();
}

/**
 * Register a hook (convenience function)
 */
export function registerHook<TContext = unknown, TResult = void>(
  hookPoint: string,
  name: string,
  handler: HookHandler<TContext, TResult>,
  options?: { priority?: number; timing?: HookTiming }
): void {
  getHookManager().register(hookPoint, name, handler, options);
}
