/**
 * AgentGate Client SDK SSE Stream Utilities
 */

import EventSource from 'eventsource';
import type { StreamEvent } from './types.js';

export interface StreamOptions {
  onEvent: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/**
 * SSE stream wrapper for run events
 */
export class RunStream {
  private eventSource: EventSource | null = null;
  private closed = false;

  constructor(
    private url: string,
    private headers: Record<string, string>,
    private options: StreamOptions
  ) {}

  /**
   * Start streaming events
   */
  connect(): void {
    if (this.eventSource || this.closed) return;

    this.eventSource = new EventSource(this.url, {
      headers: this.headers,
    });

    this.eventSource.onopen = () => {
      this.options.onOpen?.();
    };

    this.eventSource.onerror = () => {
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.close();
      } else {
        this.options.onError?.(new Error('Stream error'));
      }
    };

    // Listen for all event types
    const eventTypes = [
      'connected',
      'run-start',
      'iteration-start',
      'agent-output',
      'verification-start',
      'verification-complete',
      'ci-start',
      'ci-complete',
      'iteration-complete',
      'run-complete',
      'error',
      'heartbeat',
    ];

    for (const type of eventTypes) {
      this.eventSource.addEventListener(type, (e: MessageEvent) => {
        try {
          const event = JSON.parse(e.data) as StreamEvent;
          this.options.onEvent(event);

          // Auto-close on run complete
          if (type === 'run-complete') {
            this.close();
          }
        } catch (err) {
          this.options.onError?.(err as Error);
        }
      });
    }
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.closed) return;

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.closed = true;
    this.options.onClose?.();
  }

  /**
   * Check if stream is connected
   */
  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

/**
 * Create async iterator for stream events
 */
export async function* streamEvents(
  url: string,
  headers: Record<string, string>
): AsyncGenerator<StreamEvent> {
  const events: StreamEvent[] = [];
  let resolve: (() => void) | null = null;
  let error: Error | null = null;
  let done = false;

  const stream = new RunStream(url, headers, {
    onEvent: (event) => {
      events.push(event);
      resolve?.();
    },
    onError: (err) => {
      error = err;
      resolve?.();
    },
    onClose: () => {
      done = true;
      resolve?.();
    },
  });

  stream.connect();

  try {
    while (!done) {
      if (events.length > 0) {
        yield events.shift()!;
      } else if (error) {
        throw error;
      } else {
        await new Promise<void>((r) => {
          resolve = r;
        });
        resolve = null;
      }
    }

    // Yield remaining events
    while (events.length > 0) {
      yield events.shift()!;
    }
  } finally {
    stream.close();
  }
}
