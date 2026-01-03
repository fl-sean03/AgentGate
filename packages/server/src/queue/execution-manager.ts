import { EventEmitter } from 'events';
import type { Logger } from 'pino';
import { createLogger } from '../utils/logger.js';
import type { SandboxProvider, SandboxConfig, Sandbox } from '../sandbox/types.js';
import type { SlotHandle } from './resource-monitor.js';
import { ResourceMonitor } from './resource-monitor.js';
import { WorkOrderStateMachine } from './state-machine.js';
import {
  Execution,
  ExecutionResult,
  ExecutionStatus,
  classifyError,
} from './execution-types.js';

/**
 * Configuration for execution manager.
 */
export interface ExecutionManagerConfig {
  executionTimeoutMs: number;      // Max execution time
  gracefulShutdownMs: number;      // Time to wait for graceful stop
  cleanupDelayMs: number;          // Delay before sandbox cleanup
  enableSandbox: boolean;          // Enable SDK sandbox mode (fixes issue #66)
}

const DEFAULT_CONFIG: ExecutionManagerConfig = {
  executionTimeoutMs: 3600000,     // 1 hour
  gracefulShutdownMs: 30000,       // 30 seconds
  cleanupDelayMs: 1000,            // 1 second
  enableSandbox: true,             // Default to sandbox enabled
};

/**
 * Events emitted by ExecutionManager.
 */
export interface ExecutionManagerEvents {
  'execution-started': (execution: Execution) => void;
  'execution-completed': (workOrderId: string, result: ExecutionResult) => void;
  'execution-failed': (workOrderId: string, error: Error) => void;
}

/**
 * Work order data required for execution.
 */
export interface WorkOrderData {
  id: string;
  workspacePath: string;
  command: string;
  args?: string[];
  environment?: Record<string, string>;
}

/**
 * Manages execution lifecycle with sandbox ownership.
 *
 * This class owns the complete lifecycle of sandbox execution:
 * - Creates sandbox before execution
 * - Tracks active executions with clear ownership
 * - Prevents cleanup race conditions through ownership model
 * - Handles graceful and forceful cancellation
 * - Reports execution results through state machine
 */
export class ExecutionManager extends EventEmitter {
  private readonly logger: Logger;
  private readonly config: ExecutionManagerConfig;
  private readonly executions: Map<string, Execution> = new Map();

  constructor(
    private readonly sandboxProvider: SandboxProvider,
    private readonly resourceMonitor: ResourceMonitor,
    config: Partial<ExecutionManagerConfig> = {}
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('execution-manager');
  }

  /**
   * Execute a work order in a sandbox.
   * This method owns the entire lifecycle: create sandbox, run, cleanup.
   */
  async execute(
    workOrder: WorkOrderData,
    stateMachine: WorkOrderStateMachine,
    slot: SlotHandle
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Create execution record
    const execution: Execution = {
      workOrderId: workOrder.id,
      slotHandle: slot,
      stateMachine,
      startedAt: new Date(),
      status: 'preparing',
    };

    this.executions.set(workOrder.id, execution);

    this.logger.info(
      { workOrderId: workOrder.id, slotId: slot.id, enableSandbox: this.config.enableSandbox },
      'Starting execution'
    );

    try {
      // Phase 1: Create sandbox
      execution.status = 'preparing';
      const sandbox = await this.createSandbox(workOrder);
      execution.sandbox = sandbox;

      // Transition to RUNNING
      stateMachine.ready({ sandboxId: sandbox.id });
      execution.status = 'running';

      this.emit('execution-started', execution);

      // Phase 2: Execute with timeout
      const result = await this.runWithTimeout(
        sandbox,
        workOrder.command,
        workOrder.args ?? [],
        this.config.executionTimeoutMs
      );

      // Phase 3: Cleanup
      execution.status = 'cleanup';
      await this.cleanupSandbox(sandbox);

      // Success
      const executionResult: ExecutionResult = {
        success: result.exitCode === 0,
        exitCode: result.exitCode,
        output: result.output,
        durationMs: Date.now() - startTime,
        retryable: false,
      };

      // Transition to COMPLETED
      stateMachine.complete({
        exitCode: result.exitCode,
        output: result.output,
      });

      this.logger.info(
        { workOrderId: workOrder.id, result: executionResult },
        'Execution completed'
      );

      this.emit('execution-completed', workOrder.id, executionResult);
      return executionResult;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Classify the error
      const classifiedError = classifyError(err);

      this.logger.error(
        { workOrderId: workOrder.id, error: classifiedError },
        'Execution failed'
      );

      // Cleanup sandbox if it exists
      if (execution.sandbox) {
        execution.status = 'cleanup';
        await this.cleanupSandbox(execution.sandbox).catch((cleanupErr: unknown) => {
          this.logger.error(
            { workOrderId: workOrder.id, err: cleanupErr },
            'Failed to cleanup sandbox after error'
          );
        });
      }

      // Transition to WAITING_RETRY or FAILED
      stateMachine.fail({
        message: classifiedError.message,
        retryable: classifiedError.retryable,
      });

      const executionResult: ExecutionResult = {
        success: false,
        exitCode: -1,
        output: '',
        error: classifiedError.message,
        durationMs: Date.now() - startTime,
        retryable: classifiedError.retryable,
      };

      this.emit('execution-failed', workOrder.id, err);
      return executionResult;

    } finally {
      // Always release slot and remove execution
      execution.status = 'completed';
      this.resourceMonitor.releaseSlot(slot);
      this.executions.delete(workOrder.id);

      this.logger.debug(
        { workOrderId: workOrder.id },
        'Execution record cleaned up'
      );
    }
  }

  /**
   * Create a sandbox for the work order.
   */
  private async createSandbox(workOrder: WorkOrderData): Promise<Sandbox> {
    const config: SandboxConfig = {
      workspacePath: workOrder.workspacePath,
      ...(workOrder.environment && { env: workOrder.environment }),
    };

    this.logger.debug(
      { workOrderId: workOrder.id, config, enableSandbox: this.config.enableSandbox },
      'Creating sandbox'
    );

    try {
      const sandbox = await this.sandboxProvider.createSandbox(config);

      this.logger.info(
        { workOrderId: workOrder.id, sandboxId: sandbox.id },
        'Sandbox created'
      );

      return sandbox;
    } catch (error) {
      this.logger.error(
        { workOrderId: workOrder.id, error },
        'Failed to create sandbox'
      );
      throw error;
    }
  }

  /**
   * Run a command in the sandbox with timeout.
   */
  private async runWithTimeout(
    sandbox: Sandbox,
    command: string,
    args: string[],
    timeoutMs: number
  ): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      sandbox
        .execute(command, args)
        .then(result => {
          clearTimeout(timeout);
          resolve({
            exitCode: result.exitCode,
            output: result.stdout + result.stderr,
          });
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Cleanup a sandbox with graceful shutdown.
   */
  private async cleanupSandbox(sandbox: Sandbox): Promise<void> {
    this.logger.debug(
      { sandboxId: sandbox.id },
      'Cleaning up sandbox'
    );

    // Small delay to allow any pending I/O
    await new Promise(r => setTimeout(r, this.config.cleanupDelayMs));

    await sandbox.destroy();

    this.logger.info(
      { sandboxId: sandbox.id },
      'Sandbox destroyed'
    );
  }

  /**
   * Get the sandbox configuration setting.
   * This is used to wire sandbox config from config.sdk.enableSandbox to the driver.
   */
  isSandboxEnabled(): boolean {
    return this.config.enableSandbox;
  }

  /**
   * Get an active execution by work order ID.
   */
  getExecution(workOrderId: string): Execution | undefined {
    return this.executions.get(workOrderId);
  }

  /**
   * Get all active executions.
   */
  getActiveExecutions(): Execution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Cancel an active execution.
   */
  async cancel(workOrderId: string): Promise<boolean> {
    const execution = this.executions.get(workOrderId);
    if (!execution) {
      this.logger.warn(
        { workOrderId },
        'Cannot cancel: execution not found'
      );
      return false;
    }

    this.logger.info(
      { workOrderId, status: execution.status },
      'Cancelling execution'
    );

    // If sandbox exists, destroy it (this will cause execute() to fail)
    if (execution.sandbox) {
      await execution.sandbox.destroy().catch((err: unknown) => {
        this.logger.error(
          { workOrderId, err },
          'Error destroying sandbox during cancel'
        );
      });
    }

    return true;
  }

  /**
   * Cancel all active executions.
   */
  async cancelAll(): Promise<void> {
    this.logger.warn(
      { count: this.executions.size },
      'Cancelling all executions'
    );

    const cancelPromises = Array.from(this.executions.keys()).map(id =>
      this.cancel(id)
    );

    await Promise.all(cancelPromises);
  }

  /**
   * Get execution statistics.
   */
  getStats(): {
    activeCount: number;
    statuses: Record<ExecutionStatus, number>;
  } {
    const statuses: Record<ExecutionStatus, number> = {
      preparing: 0,
      running: 0,
      cleanup: 0,
      completed: 0,
    };

    for (const execution of this.executions.values()) {
      statuses[execution.status]++;
    }

    return {
      activeCount: this.executions.size,
      statuses,
    };
  }
}
