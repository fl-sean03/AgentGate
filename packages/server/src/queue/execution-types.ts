import type { Sandbox } from '../sandbox/types.js';
import type { SlotHandle } from './resource-monitor.js';
import type { WorkOrderStateMachine } from './state-machine.js';

/**
 * Execution status.
 */
export type ExecutionStatus =
  | 'preparing'  // Setting up sandbox
  | 'running'    // Agent executing
  | 'cleanup'    // Tearing down sandbox
  | 'completed'  // Finished (success or failure)
  ;

/**
 * Active execution record.
 */
export interface Execution {
  readonly workOrderId: string;
  readonly slotHandle: SlotHandle;
  readonly stateMachine: WorkOrderStateMachine;
  readonly startedAt: Date;
  status: ExecutionStatus;
  sandbox?: Sandbox;
  output?: string;
  error?: Error;
}

/**
 * Result of an execution.
 */
export interface ExecutionResult {
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
  durationMs: number;
  retryable: boolean;
}

/**
 * Execution error with retry classification.
 */
export interface ExecutionError {
  message: string;
  code: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

/**
 * Known error codes for classification.
 */
export const ErrorCodes = {
  // Retryable errors
  SANDBOX_CREATION_FAILED: 'SANDBOX_CREATION_FAILED',
  TIMEOUT: 'TIMEOUT',
  OOM_KILLED: 'OOM_KILLED',
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Non-retryable errors
  INVALID_WORK_ORDER: 'INVALID_WORK_ORDER',
  AGENT_FATAL_ERROR: 'AGENT_FATAL_ERROR',
  CANCELLED: 'CANCELLED',
} as const;

/**
 * Classify an error as retryable or not.
 */
export function classifyError(error: Error, exitCode?: number): ExecutionError {
  const message = error.message.toLowerCase();

  // OOM killed (exit code 137 = 128 + SIGKILL(9))
  if (exitCode === 137 || message.includes('oom') || message.includes('out of memory')) {
    return {
      message: error.message,
      code: ErrorCodes.OOM_KILLED,
      retryable: true,
      details: { exitCode },
    };
  }

  // Timeout
  if (message.includes('timeout') || message.includes('timed out')) {
    return {
      message: error.message,
      code: ErrorCodes.TIMEOUT,
      retryable: true,
    };
  }

  // Network errors
  if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
    return {
      message: error.message,
      code: ErrorCodes.NETWORK_ERROR,
      retryable: true,
    };
  }

  // Sandbox creation failures are often transient
  if (message.includes('sandbox') || message.includes('container')) {
    return {
      message: error.message,
      code: ErrorCodes.SANDBOX_CREATION_FAILED,
      retryable: true,
    };
  }

  // Exit code -1 usually means killed (our previous bug)
  if (exitCode === -1) {
    return {
      message: error.message,
      code: ErrorCodes.OOM_KILLED,
      retryable: true,
      details: { exitCode },
    };
  }

  // Default: not retryable
  return {
    message: error.message,
    code: ErrorCodes.AGENT_FATAL_ERROR,
    retryable: false,
  };
}
