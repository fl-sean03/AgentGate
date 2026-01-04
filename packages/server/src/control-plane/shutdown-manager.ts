/**
 * Shutdown Manager - Atomic Graceful Shutdown
 *
 * Manages orderly shutdown sequence ensuring all in-flight work is
 * completed or safely terminated before the process exits.
 *
 * (v0.2.27 - Thrust 3: Atomic Graceful Shutdown)
 */

import { createLogger } from '../utils/logger.js';
import { sleep } from '../utils/timeout.js';

const log = createLogger('shutdown-manager');

/**
 * Shutdown phases in order of execution
 */
export enum ShutdownPhase {
  /** Stop accepting new work */
  STOP_ACCEPTING = 'stop_accepting',
  /** Complete in-flight requests */
  COMPLETE_REQUESTS = 'complete_requests',
  /** Interrupt running agents gracefully */
  INTERRUPT_AGENTS = 'interrupt_agents',
  /** Force kill remaining processes */
  FORCE_KILL = 'force_kill',
  /** Persist final state */
  PERSIST_STATE = 'persist_state',
  /** Close file handles and connections */
  CLOSE_RESOURCES = 'close_resources',
}

/**
 * Shutdown handler interface
 */
export interface ShutdownHandler {
  /** Unique name for this handler */
  name: string;
  /** Priority (higher = earlier in shutdown sequence) */
  priority: number;
  /** Phase this handler belongs to */
  phase: ShutdownPhase;
  /** Handler function - receives abort signal for timeout */
  handler: (signal: AbortSignal) => Promise<void>;
}

/**
 * Shutdown state
 */
export type ShutdownState =
  | 'running'      // Normal operation
  | 'shutting_down' // Graceful shutdown in progress
  | 'force_shutdown' // Force shutdown in progress
  | 'shutdown';    // Shutdown complete

/**
 * Shutdown result
 */
export interface ShutdownResult {
  /** Whether shutdown completed successfully */
  success: boolean;
  /** Time taken for shutdown in milliseconds */
  durationMs: number;
  /** Handlers that completed successfully */
  completed: string[];
  /** Handlers that failed */
  failed: Array<{ name: string; error: string }>;
  /** Handlers that timed out */
  timedOut: string[];
  /** Was this a forced shutdown? */
  forced: boolean;
}

/**
 * Default timeouts for each phase (in milliseconds)
 */
const DEFAULT_PHASE_TIMEOUTS: Record<ShutdownPhase, number> = {
  [ShutdownPhase.STOP_ACCEPTING]: 1000,     // 1 second
  [ShutdownPhase.COMPLETE_REQUESTS]: 30000, // 30 seconds
  [ShutdownPhase.INTERRUPT_AGENTS]: 30000,  // 30 seconds
  [ShutdownPhase.FORCE_KILL]: 5000,         // 5 seconds
  [ShutdownPhase.PERSIST_STATE]: 5000,      // 5 seconds
  [ShutdownPhase.CLOSE_RESOURCES]: 5000,    // 5 seconds
};

/**
 * Shutdown configuration
 */
export interface ShutdownConfig {
  /** Overall shutdown timeout in ms (default: 60000) */
  overallTimeoutMs?: number;
  /** Per-phase timeouts */
  phaseTimeouts?: Partial<Record<ShutdownPhase, number>>;
  /** Exit process after shutdown (default: true) */
  exitProcess?: boolean;
  /** Exit code on success (default: 0) */
  exitCodeSuccess?: number;
  /** Exit code on timeout (default: 1) */
  exitCodeTimeout?: number;
  /** Exit code on error (default: 1) */
  exitCodeError?: number;
}

const DEFAULT_CONFIG: Required<ShutdownConfig> = {
  overallTimeoutMs: 60000,
  phaseTimeouts: {},
  exitProcess: true,
  exitCodeSuccess: 0,
  exitCodeTimeout: 1,
  exitCodeError: 1,
};

/**
 * Singleton shutdown manager.
 *
 * Usage:
 * 1. Register handlers during initialization
 * 2. Call initiateShutdown() on SIGTERM/SIGINT
 * 3. Handlers are called in priority order within each phase
 */
export class ShutdownManager {
  private static instance: ShutdownManager | null = null;

  private readonly handlers: Map<string, ShutdownHandler> = new Map();
  private state: ShutdownState = 'running';
  private shutdownPromise: Promise<ShutdownResult> | null = null;
  private config: Required<ShutdownConfig>;

  private constructor(config: ShutdownConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the singleton instance
   */
  static getInstance(config?: ShutdownConfig): ShutdownManager {
    if (!ShutdownManager.instance) {
      ShutdownManager.instance = new ShutdownManager(config);
    }
    return ShutdownManager.instance;
  }

  /**
   * Reset the singleton (for testing)
   */
  static resetInstance(): void {
    if (ShutdownManager.instance) {
      ShutdownManager.instance.handlers.clear();
      ShutdownManager.instance.state = 'running';
      ShutdownManager.instance.shutdownPromise = null;
    }
    ShutdownManager.instance = null;
  }

  /**
   * Get current shutdown state
   */
  getState(): ShutdownState {
    return this.state;
  }

  /**
   * Check if shutdown is in progress or complete
   */
  isShuttingDown(): boolean {
    return this.state !== 'running';
  }

  /**
   * Register a shutdown handler
   *
   * @param name - Unique identifier for this handler
   * @param handler - Async function to call during shutdown
   * @param priority - Higher priority = earlier execution (default: 50)
   * @param phase - Which phase this handler belongs to (default: CLOSE_RESOURCES)
   */
  register(
    name: string,
    handler: (signal: AbortSignal) => Promise<void>,
    priority: number = 50,
    phase: ShutdownPhase = ShutdownPhase.CLOSE_RESOURCES
  ): void {
    if (this.handlers.has(name)) {
      log.warn({ name }, 'Replacing existing shutdown handler');
    }

    this.handlers.set(name, {
      name,
      priority,
      phase,
      handler,
    });

    log.debug({ name, priority, phase }, 'Registered shutdown handler');
  }

  /**
   * Unregister a shutdown handler
   */
  unregister(name: string): boolean {
    const existed = this.handlers.delete(name);
    if (existed) {
      log.debug({ name }, 'Unregistered shutdown handler');
    }
    return existed;
  }

  /**
   * Get registered handlers count
   */
  getHandlerCount(): number {
    return this.handlers.size;
  }

  /**
   * Initiate graceful shutdown
   *
   * @param signal - The signal that triggered shutdown (e.g., 'SIGTERM')
   * @returns Promise that resolves when shutdown is complete
   */
  initiateShutdown(signal?: string): Promise<ShutdownResult> {
    // If already shutting down, return existing promise
    if (this.shutdownPromise) {
      log.warn({ signal }, 'Shutdown already in progress');
      return this.shutdownPromise;
    }

    log.info({ signal, handlerCount: this.handlers.size }, 'Initiating graceful shutdown');
    this.state = 'shutting_down';

    this.shutdownPromise = this.executeShutdown(false);
    return this.shutdownPromise;
  }

  /**
   * Force immediate shutdown
   *
   * @param reason - Reason for force shutdown
   * @returns Promise that resolves when shutdown is complete
   */
  async forceShutdown(reason?: string): Promise<ShutdownResult> {
    // If already in force shutdown, return existing promise
    if (this.state === 'force_shutdown' && this.shutdownPromise) {
      return this.shutdownPromise;
    }

    log.warn({ reason }, 'Initiating force shutdown');
    this.state = 'force_shutdown';

    this.shutdownPromise = this.executeShutdown(true);
    return this.shutdownPromise;
  }

  /**
   * Execute the shutdown sequence
   */
  private async executeShutdown(forced: boolean): Promise<ShutdownResult> {
    const startTime = Date.now();
    const result: ShutdownResult = {
      success: true,
      durationMs: 0,
      completed: [],
      failed: [],
      timedOut: [],
      forced,
    };

    // Create overall timeout
    const overallController = new AbortController();
    const overallTimeout = setTimeout(() => {
      overallController.abort();
    }, this.config.overallTimeoutMs);

    try {
      // Execute phases in order
      const phases = Object.values(ShutdownPhase);

      for (const phase of phases) {
        if (overallController.signal.aborted) {
          log.warn({ phase }, 'Overall timeout reached, skipping phase');
          break;
        }

        // Skip some phases on force shutdown
        if (forced && (
          phase === ShutdownPhase.COMPLETE_REQUESTS ||
          phase === ShutdownPhase.INTERRUPT_AGENTS
        )) {
          log.info({ phase }, 'Skipping phase for force shutdown');
          continue;
        }

        await this.executePhase(phase, result, overallController.signal);
      }
    } finally {
      clearTimeout(overallTimeout);
    }

    result.durationMs = Date.now() - startTime;
    this.state = 'shutdown';

    // Determine overall success
    result.success = result.failed.length === 0 && result.timedOut.length === 0;

    log.info(
      {
        success: result.success,
        durationMs: result.durationMs,
        completed: result.completed.length,
        failed: result.failed.length,
        timedOut: result.timedOut.length,
        forced,
      },
      'Shutdown complete'
    );

    // Exit process if configured
    if (this.config.exitProcess) {
      const exitCode = result.success
        ? this.config.exitCodeSuccess
        : (result.timedOut.length > 0
            ? this.config.exitCodeTimeout
            : this.config.exitCodeError);

      // Use setImmediate to allow any pending I/O to complete
      setImmediate(() => {
        process.exit(exitCode);
      });
    }

    return result;
  }

  /**
   * Execute all handlers for a phase
   */
  private async executePhase(
    phase: ShutdownPhase,
    result: ShutdownResult,
    overallSignal: AbortSignal
  ): Promise<void> {
    // Get handlers for this phase, sorted by priority (descending)
    const phaseHandlers = Array.from(this.handlers.values())
      .filter(h => h.phase === phase)
      .sort((a, b) => b.priority - a.priority);

    if (phaseHandlers.length === 0) {
      return;
    }

    log.debug({ phase, handlerCount: phaseHandlers.length }, 'Executing shutdown phase');

    const phaseTimeout = this.config.phaseTimeouts[phase] ?? DEFAULT_PHASE_TIMEOUTS[phase];

    // Create phase timeout
    const phaseController = new AbortController();
    const phaseTimeoutId = setTimeout(() => {
      phaseController.abort();
    }, phaseTimeout);

    // Link to overall signal
    const abortOnOverall = (): void => {
      phaseController.abort();
    };
    overallSignal.addEventListener('abort', abortOnOverall);

    try {
      // Execute handlers in parallel within the phase
      const promises = phaseHandlers.map(async (handler) => {
        try {
          await handler.handler(phaseController.signal);
          result.completed.push(handler.name);
          log.debug({ name: handler.name, phase }, 'Handler completed');
        } catch (error) {
          if (phaseController.signal.aborted) {
            result.timedOut.push(handler.name);
            log.warn({ name: handler.name, phase }, 'Handler timed out');
          } else {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.failed.push({ name: handler.name, error: errorMessage });
            log.error({ name: handler.name, phase, error: errorMessage }, 'Handler failed');
          }
        }
      });

      await Promise.allSettled(promises);
    } finally {
      clearTimeout(phaseTimeoutId);
      overallSignal.removeEventListener('abort', abortOnOverall);
    }
  }
}

/**
 * Get the shutdown manager singleton
 */
export function getShutdownManager(config?: ShutdownConfig): ShutdownManager {
  return ShutdownManager.getInstance(config);
}

/**
 * Register a shutdown handler (convenience function)
 */
export function registerShutdownHandler(
  name: string,
  handler: (signal: AbortSignal) => Promise<void>,
  priority: number = 50,
  phase: ShutdownPhase = ShutdownPhase.CLOSE_RESOURCES
): void {
  getShutdownManager().register(name, handler, priority, phase);
}

/**
 * Install signal handlers for graceful shutdown
 */
export function installSignalHandlers(config?: ShutdownConfig): void {
  const manager = getShutdownManager(config);

  // Handle SIGTERM (container orchestrators, process managers)
  process.on('SIGTERM', () => {
    log.info('Received SIGTERM signal');
    void manager.initiateShutdown('SIGTERM');
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    log.info('Received SIGINT signal');
    void manager.initiateShutdown('SIGINT');
  });

  // Handle SIGUSR2 (nodemon restart)
  process.on('SIGUSR2', () => {
    log.info('Received SIGUSR2 signal');
    void manager.initiateShutdown('SIGUSR2');
  });

  // Handle uncaught exceptions with force shutdown
  process.on('uncaughtException', (error) => {
    log.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
    void manager.forceShutdown(`Uncaught exception: ${error.message}`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    log.error({ reason: message }, 'Unhandled promise rejection');
    // Don't force shutdown on unhandled rejections, just log
  });

  log.info('Signal handlers installed');
}

/**
 * Wait for shutdown to complete (for use in tests or controlled shutdown)
 */
export async function waitForShutdown(): Promise<ShutdownResult | null> {
  const manager = getShutdownManager();
  if (!manager.isShuttingDown()) {
    return null;
  }
  return manager.initiateShutdown();
}
