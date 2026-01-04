import EventSource from 'eventsource';
import { getAuthManager } from './auth.js';
import type {
  StreamEvent,
  AgentActivityEvent,
  VerificationProgressEvent,
  RunCompletedEvent,
} from './types.js';

type EventCallback<T> = (event: T) => void;

interface StreamCallbacks {
  onActivity?: EventCallback<AgentActivityEvent>;
  onVerification?: EventCallback<VerificationProgressEvent>;
  onComplete?: EventCallback<RunCompletedEvent>;
  onError?: EventCallback<Error>;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export class RunStream {
  private eventSource: EventSource | null = null;
  private runId: string;
  private baseUrl: string;
  private token: string;
  private callbacks: StreamCallbacks = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private abortController: AbortController | null = null;

  constructor(runId: string, baseUrl?: string, token?: string) {
    this.runId = runId;
    this.baseUrl = baseUrl || getAuthManager().getApiUrl();
    this.token = token || getAuthManager().getToken() || '';
  }

  connect(callbacks: StreamCallbacks): void {
    this.callbacks = callbacks;
    this.abortController = new AbortController();
    this.createConnection();
  }

  private createConnection(): void {
    const url = `${this.baseUrl}/api/v1/runs/${this.runId}/stream`;

    this.eventSource = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      this.callbacks.onConnect?.();
    };

    this.eventSource.onerror = (error) => {
      if (this.abortController?.signal.aborted) {
        return;
      }

      this.callbacks.onDisconnect?.();

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        setTimeout(() => {
          if (!this.abortController?.signal.aborted) {
            this.createConnection();
          }
        }, delay);
      } else {
        this.callbacks.onError?.(
          new Error('Max reconnection attempts reached')
        );
      }
    };

    // Handle different event types
    this.eventSource.addEventListener('agent:activity', (event) => {
      try {
        const data = JSON.parse(event.data) as Omit<AgentActivityEvent, 'type'>;
        this.callbacks.onActivity?.({
          type: 'agent:activity',
          ...data,
          timestamp: new Date(data.timestamp),
        });
      } catch (error) {
        console.error('Failed to parse agent activity event:', error);
      }
    });

    this.eventSource.addEventListener('verification:start', (event) => {
      try {
        const data = JSON.parse(event.data) as Omit<VerificationProgressEvent, 'type'>;
        this.callbacks.onVerification?.({
          type: 'verification:progress',
          ...data,
        });
      } catch (error) {
        console.error('Failed to parse verification start event:', error);
      }
    });

    this.eventSource.addEventListener('verification:progress', (event) => {
      try {
        const data = JSON.parse(event.data) as Omit<VerificationProgressEvent, 'type'>;
        this.callbacks.onVerification?.({
          type: 'verification:progress',
          ...data,
        });
      } catch (error) {
        console.error('Failed to parse verification progress event:', error);
      }
    });

    this.eventSource.addEventListener('run:completed', (event) => {
      try {
        const data = JSON.parse(event.data) as Omit<RunCompletedEvent, 'type'>;
        this.callbacks.onComplete?.({
          type: 'run:completed',
          ...data,
        });
        this.disconnect();
      } catch (error) {
        console.error('Failed to parse run completed event:', error);
      }
    });

    this.eventSource.addEventListener('run:error', (event) => {
      try {
        const data = JSON.parse(event.data) as { message: string };
        this.callbacks.onError?.(new Error(data.message));
        this.disconnect();
      } catch (error) {
        console.error('Failed to parse run error event:', error);
      }
    });
  }

  disconnect(): void {
    this.abortController?.abort();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Factory function for creating streams
export function createRunStream(
  runId: string,
  baseUrl?: string,
  token?: string
): RunStream {
  return new RunStream(runId, baseUrl, token);
}
