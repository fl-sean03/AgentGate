/**
 * Debug Mode System
 * Provides step-by-step execution and verbose output.
 *
 * (v0.2.27 - Thrust 19: Debug Mode & Dry Runs)
 */

import { createLogger } from '../utils/logger.js';
import { EventEmitter } from 'node:events';

const log = createLogger('debug-mode');

/**
 * Debug mode settings
 */
export interface DebugModeSettings {
  /** Enable debug mode */
  enabled: boolean;
  /** Verbose output level (0-3) */
  verbosity: number;
  /** Pause before each step */
  stepMode: boolean;
  /** Log all tool calls */
  traceTools: boolean;
  /** Log all API calls */
  traceApi: boolean;
  /** Save intermediate states */
  saveStates: boolean;
  /** Breakpoints (step IDs to pause at) */
  breakpoints: Set<string>;
}

/**
 * Debug event types
 */
export type DebugEventType =
  | 'step:before'
  | 'step:after'
  | 'breakpoint:hit'
  | 'tool:call'
  | 'api:request'
  | 'api:response'
  | 'state:changed'
  | 'pause:requested'
  | 'resume:requested';

/**
 * Debug event data
 */
export interface DebugEvent {
  type: DebugEventType;
  timestamp: Date;
  stepId?: string;
  data?: Record<string, unknown>;
}

/**
 * Step execution result
 */
export interface StepResult {
  stepId: string;
  success: boolean;
  duration: number;
  output?: unknown;
  error?: Error;
}

/**
 * Debug mode controller
 */
export class DebugMode {
  private static instance: DebugMode | null = null;
  private settings: DebugModeSettings;
  private emitter: EventEmitter;
  private paused: boolean = false;
  private resumeResolver: (() => void) | null = null;
  private stepHistory: StepResult[] = [];
  private states: Map<string, unknown> = new Map();

  private constructor(settings: Partial<DebugModeSettings> = {}) {
    this.settings = {
      enabled: false,
      verbosity: 0,
      stepMode: false,
      traceTools: false,
      traceApi: false,
      saveStates: false,
      breakpoints: new Set(),
      ...settings,
    };
    this.emitter = new EventEmitter();
  }

  /**
   * Get singleton instance
   */
  static getInstance(settings?: Partial<DebugModeSettings>): DebugMode {
    if (!DebugMode.instance) {
      DebugMode.instance = new DebugMode(settings);
    }
    return DebugMode.instance;
  }

  /**
   * Reset singleton for testing
   */
  static resetInstance(): void {
    DebugMode.instance = null;
  }

  /**
   * Check if debug mode is enabled
   */
  isEnabled(): boolean {
    return this.settings.enabled;
  }

  /**
   * Enable debug mode
   */
  enable(settings?: Partial<DebugModeSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
      enabled: true,
    };
    log.info({ settings: this.settings }, 'Debug mode enabled');
  }

  /**
   * Disable debug mode
   */
  disable(): void {
    this.settings.enabled = false;
    this.resume(); // Resume if paused
    log.info('Debug mode disabled');
  }

  /**
   * Get current settings
   */
  getSettings(): Readonly<DebugModeSettings> {
    return this.settings;
  }

  /**
   * Update settings
   */
  updateSettings(settings: Partial<DebugModeSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  /**
   * Add a breakpoint
   */
  addBreakpoint(stepId: string): void {
    this.settings.breakpoints.add(stepId);
    log.debug({ stepId }, 'Breakpoint added');
  }

  /**
   * Remove a breakpoint
   */
  removeBreakpoint(stepId: string): void {
    this.settings.breakpoints.delete(stepId);
    log.debug({ stepId }, 'Breakpoint removed');
  }

  /**
   * Clear all breakpoints
   */
  clearBreakpoints(): void {
    this.settings.breakpoints.clear();
    log.debug('All breakpoints cleared');
  }

  /**
   * Check if execution is paused
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Request pause
   */
  pause(): void {
    this.paused = true;
    this.emit({ type: 'pause:requested', timestamp: new Date() });
    log.info('Pause requested');
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.resumeResolver) {
      this.resumeResolver();
      this.resumeResolver = null;
    }
    this.paused = false;
    this.emit({ type: 'resume:requested', timestamp: new Date() });
    log.info('Execution resumed');
  }

  /**
   * Wait if paused or at breakpoint
   */
  async waitIfPaused(stepId?: string): Promise<void> {
    if (!this.settings.enabled) return;

    // Check for breakpoint
    if (stepId && this.settings.breakpoints.has(stepId)) {
      this.emit({ type: 'breakpoint:hit', timestamp: new Date(), stepId });
      log.info({ stepId }, 'Breakpoint hit');
      this.paused = true;
    }

    // Check for step mode
    if (this.settings.stepMode) {
      this.paused = true;
    }

    // Wait if paused
    if (this.paused) {
      await new Promise<void>((resolve) => {
        this.resumeResolver = resolve;
      });
    }
  }

  /**
   * Execute a step with debugging
   */
  async executeStep<T>(
    stepId: string,
    name: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();

    // Emit before event
    this.emit({
      type: 'step:before',
      timestamp: new Date(),
      stepId,
      data: { name },
    });

    // Wait if paused
    await this.waitIfPaused(stepId);

    if (this.settings.verbosity >= 1) {
      log.info({ stepId, name }, 'Executing step');
    }

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      const stepResult: StepResult = {
        stepId,
        success: true,
        duration,
        output: this.settings.verbosity >= 2 ? result : undefined,
      };
      this.stepHistory.push(stepResult);

      // Emit after event
      this.emit({
        type: 'step:after',
        timestamp: new Date(),
        stepId,
        data: { name, success: true, duration },
      });

      if (this.settings.verbosity >= 1) {
        log.info({ stepId, name, duration }, 'Step completed');
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      const stepResult: StepResult = {
        stepId,
        success: false,
        duration,
        error: err,
      };
      this.stepHistory.push(stepResult);

      // Emit after event
      this.emit({
        type: 'step:after',
        timestamp: new Date(),
        stepId,
        data: { name, success: false, duration, error: err.message },
      });

      if (this.settings.verbosity >= 1) {
        log.error({ stepId, name, duration, error: err.message }, 'Step failed');
      }

      throw error;
    }
  }

  /**
   * Trace a tool call
   */
  traceToolCall(tool: string, args: unknown, result?: unknown): void {
    if (!this.settings.enabled || !this.settings.traceTools) return;

    this.emit({
      type: 'tool:call',
      timestamp: new Date(),
      data: { tool, args, result },
    });

    if (this.settings.verbosity >= 2) {
      log.debug({ tool, args, result }, 'Tool call');
    }
  }

  /**
   * Trace an API request
   */
  traceApiRequest(method: string, url: string, body?: unknown): void {
    if (!this.settings.enabled || !this.settings.traceApi) return;

    this.emit({
      type: 'api:request',
      timestamp: new Date(),
      data: { method, url, body },
    });

    if (this.settings.verbosity >= 2) {
      log.debug({ method, url }, 'API request');
    }
  }

  /**
   * Trace an API response
   */
  traceApiResponse(method: string, url: string, status: number, body?: unknown): void {
    if (!this.settings.enabled || !this.settings.traceApi) return;

    this.emit({
      type: 'api:response',
      timestamp: new Date(),
      data: { method, url, status, body },
    });

    if (this.settings.verbosity >= 2) {
      log.debug({ method, url, status }, 'API response');
    }
  }

  /**
   * Save state snapshot
   */
  saveState(key: string, state: unknown): void {
    if (!this.settings.enabled || !this.settings.saveStates) return;

    this.states.set(key, structuredClone(state));

    this.emit({
      type: 'state:changed',
      timestamp: new Date(),
      data: { key },
    });

    if (this.settings.verbosity >= 3) {
      log.debug({ key }, 'State saved');
    }
  }

  /**
   * Get saved state
   */
  getState(key: string): unknown {
    return this.states.get(key);
  }

  /**
   * Get all saved states
   */
  getAllStates(): Map<string, unknown> {
    return new Map(this.states);
  }

  /**
   * Get step history
   */
  getStepHistory(): readonly StepResult[] {
    return this.stepHistory;
  }

  /**
   * Clear history and states
   */
  clear(): void {
    this.stepHistory = [];
    this.states.clear();
    log.debug('Debug history cleared');
  }

  /**
   * Subscribe to debug events
   */
  on(event: DebugEventType, handler: (event: DebugEvent) => void): void {
    this.emitter.on(event, handler);
  }

  /**
   * Unsubscribe from debug events
   */
  off(event: DebugEventType, handler: (event: DebugEvent) => void): void {
    this.emitter.off(event, handler);
  }

  /**
   * Emit debug event
   */
  private emit(event: DebugEvent): void {
    this.emitter.emit(event.type, event);
  }

  /**
   * Format step history for display
   */
  formatHistory(): string {
    const lines = ['Step History:'];

    for (const step of this.stepHistory) {
      const status = step.success ? '✓' : '✗';
      const duration = `${step.duration}ms`;
      lines.push(`  ${status} ${step.stepId} (${duration})`);
      if (step.error) {
        lines.push(`    Error: ${step.error.message}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Get debug mode instance
 */
export function getDebugMode(settings?: Partial<DebugModeSettings>): DebugMode {
  return DebugMode.getInstance(settings);
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return getDebugMode().isEnabled();
}

/**
 * Reset debug mode for testing
 */
export function resetDebugMode(): void {
  DebugMode.resetInstance();
}
