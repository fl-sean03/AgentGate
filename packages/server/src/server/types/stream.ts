/**
 * Stream API Types
 *
 * Types and schemas for Server-Sent Events (SSE) streaming.
 * v0.2.17 - Thrust 4
 *
 * @module server/types/stream
 */

import { z } from 'zod';

/**
 * Stream event type enum
 */
export const streamEventType = z.enum([
  'connected',
  'run-start',
  'iteration-start',
  'iteration-complete',
  'run-complete',
  'error',
  'heartbeat',
]);

export type StreamEventType = z.infer<typeof streamEventType>;

/**
 * Base event structure
 */
export interface BaseStreamEvent {
  type: StreamEventType;
  runId: string;
  timestamp: string;
}

/**
 * Connected event - sent when client first connects
 */
export interface ConnectedEvent extends BaseStreamEvent {
  type: 'connected';
  data: {
    clientId: string;
    runStatus: string;
    currentIteration: number;
  };
}

/**
 * Run start event
 */
export interface RunStartEvent extends BaseStreamEvent {
  type: 'run-start';
  data: {
    workOrderId: string;
    maxIterations: number;
  };
}

/**
 * Iteration start event
 */
export interface IterationStartEvent extends BaseStreamEvent {
  type: 'iteration-start';
  data: {
    iteration: number;
    maxIterations: number;
  };
}

/**
 * Iteration complete event
 */
export interface IterationCompleteEvent extends BaseStreamEvent {
  type: 'iteration-complete';
  data: {
    iteration: number;
    verificationPassed: boolean;
    shouldContinue: boolean;
  };
}

/**
 * Run complete event
 */
export interface RunCompleteEvent extends BaseStreamEvent {
  type: 'run-complete';
  data: {
    status: 'succeeded' | 'failed' | 'canceled';
    totalIterations: number;
    prUrl?: string;
  };
}

/**
 * Error event
 */
export interface ErrorEvent extends BaseStreamEvent {
  type: 'error';
  data: {
    code: string;
    message: string;
    recoverable: boolean;
  };
}

/**
 * Heartbeat event - sent periodically to keep connection alive
 */
export interface HeartbeatEvent extends BaseStreamEvent {
  type: 'heartbeat';
  data: {
    serverTime: string;
  };
}

/**
 * Union of all stream event types
 */
export type StreamEvent =
  | ConnectedEvent
  | RunStartEvent
  | IterationStartEvent
  | IterationCompleteEvent
  | RunCompleteEvent
  | ErrorEvent
  | HeartbeatEvent;

/**
 * Run ID URL parameter for stream endpoints
 */
export const streamRunIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type StreamRunIdParams = z.infer<typeof streamRunIdParamsSchema>;
