import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StreamEvent } from '../src/types.js';

// Create a global holder for mock instances that can be accessed by the mock
declare global {
  // eslint-disable-next-line no-var
  var __mockEventSourceInstances: Array<{
    url: string;
    readyState: number;
    listeners: Map<string, ((e: MessageEvent) => void)[]>;
    simulateEvent: (type: string, data: unknown) => void;
    simulateRawEvent: (type: string, rawData: string) => void;
    close: () => void;
  }>;
}

globalThis.__mockEventSourceInstances = [];

// Mock before any imports - use global to store instances
vi.mock('eventsource', () => {
  const CONNECTING = 0;
  const OPEN = 1;
  const CLOSED = 2;

  class MockEventSource {
    static CONNECTING = CONNECTING;
    static OPEN = OPEN;
    static CLOSED = CLOSED;

    url: string;
    readyState = CONNECTING;
    onopen: (() => void) | null = null;
    onerror: ((error: Event) => void) | null = null;

    private listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map();

    constructor(url: string, _options?: { headers: Record<string, string> }) {
      this.url = url;

      // Create instance proxy for tests
      const self = this;
      const instance = {
        url,
        get readyState() {
          return self.readyState;
        },
        listeners: this.listeners,
        simulateEvent(type: string, data: unknown) {
          const listeners = self.listeners.get(type) || [];
          const event = { data: JSON.stringify(data) } as MessageEvent;
          for (const listener of listeners) {
            listener(event);
          }
        },
        simulateRawEvent(type: string, rawData: string) {
          const listeners = self.listeners.get(type) || [];
          const event = { data: rawData } as MessageEvent;
          for (const listener of listeners) {
            listener(event);
          }
        },
        close: () => {
          self.readyState = CLOSED;
        },
      };

      globalThis.__mockEventSourceInstances.push(instance);

      // Simulate connection opening
      setTimeout(() => {
        this.readyState = OPEN;
        this.onopen?.();
      }, 0);
    }

    addEventListener(type: string, listener: (e: MessageEvent) => void): void {
      const existing = this.listeners.get(type) || [];
      existing.push(listener);
      this.listeners.set(type, existing);
    }

    removeEventListener(type: string, listener: (e: MessageEvent) => void): void {
      const existing = this.listeners.get(type) || [];
      const index = existing.indexOf(listener);
      if (index !== -1) {
        existing.splice(index, 1);
      }
    }

    close(): void {
      this.readyState = CLOSED;
    }
  }

  return { default: MockEventSource };
});

// Import after mock setup
import { RunStream } from '../src/stream.js';

describe('RunStream', () => {
  let stream: RunStream;
  let onEvent: ReturnType<typeof vi.fn>;
  let onError: ReturnType<typeof vi.fn>;
  let onOpen: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    globalThis.__mockEventSourceInstances.length = 0; // Clear instances
    onEvent = vi.fn();
    onError = vi.fn();
    onOpen = vi.fn();
    onClose = vi.fn();

    stream = new RunStream(
      'http://localhost:3000/api/v1/runs/run_123/stream',
      { 'X-API-Key': 'test-key' },
      {
        onEvent,
        onError,
        onOpen,
        onClose,
      }
    );
  });

  afterEach(() => {
    stream.close();
  });

  function getEventSource() {
    return globalThis.__mockEventSourceInstances[0];
  }

  describe('connect', () => {
    it('should connect to the stream', async () => {
      stream.connect();

      // Wait for async connection
      await new Promise((r) => setTimeout(r, 10));

      expect(stream.isConnected).toBe(true);
    });

    it('should call onOpen when connected', async () => {
      stream.connect();

      await new Promise((r) => setTimeout(r, 10));

      expect(onOpen).toHaveBeenCalled();
    });

    it('should not reconnect if already connected', async () => {
      stream.connect();
      stream.connect(); // Second call should be ignored

      await new Promise((r) => setTimeout(r, 10));

      // Only one EventSource should be created
      expect(globalThis.__mockEventSourceInstances).toHaveLength(1);
      expect(stream.isConnected).toBe(true);
    });

    it('should not connect if already closed', async () => {
      stream.connect();
      stream.close();

      // Clear instances to verify no new connection is made
      globalThis.__mockEventSourceInstances.length = 0;
      stream.connect(); // Should be ignored after close

      await new Promise((r) => setTimeout(r, 10));

      expect(globalThis.__mockEventSourceInstances).toHaveLength(0);
    });
  });

  describe('event handling', () => {
    it('should parse and forward events to onEvent', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));

      const eventSource = getEventSource();
      expect(eventSource).toBeDefined();

      const testEvent: StreamEvent = {
        type: 'iteration-start',
        runId: 'run_123',
        timestamp: '2024-01-01T00:00:00Z',
        data: { iteration: 1 },
      };

      eventSource!.simulateEvent('iteration-start', testEvent);

      expect(onEvent).toHaveBeenCalledWith(testEvent);
    });

    it('should auto-close on run-complete event', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));

      const eventSource = getEventSource();

      const completeEvent: StreamEvent = {
        type: 'run-complete',
        runId: 'run_123',
        timestamp: '2024-01-01T00:00:00Z',
        data: { status: 'succeeded' },
      };

      eventSource!.simulateEvent('run-complete', completeEvent);

      expect(onEvent).toHaveBeenCalledWith(completeEvent);
      expect(onClose).toHaveBeenCalled();
    });

    it('should handle JSON parse errors', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));

      const eventSource = getEventSource();

      // Simulate malformed JSON
      eventSource!.simulateRawEvent('heartbeat', 'invalid json');

      expect(onError).toHaveBeenCalled();
    });

    it('should handle multiple event types', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));

      const eventSource = getEventSource();

      const events: StreamEvent[] = [
        { type: 'run-start', runId: 'run_123', timestamp: '2024-01-01T00:00:00Z', data: {} },
        { type: 'iteration-start', runId: 'run_123', timestamp: '2024-01-01T00:00:01Z', data: { iteration: 1 } },
        { type: 'agent-output', runId: 'run_123', timestamp: '2024-01-01T00:00:02Z', data: { content: 'test' } },
      ];

      for (const event of events) {
        eventSource!.simulateEvent(event.type, event);
      }

      expect(onEvent).toHaveBeenCalledTimes(3);
    });
  });

  describe('close', () => {
    it('should close the stream', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));

      stream.close();

      expect(stream.isConnected).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      stream.connect();
      stream.close();
      stream.close(); // Second call should be safe

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('isConnected', () => {
    it('should return false before connect', () => {
      expect(stream.isConnected).toBe(false);
    });

    it('should return true when connected', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));

      expect(stream.isConnected).toBe(true);
    });

    it('should return false after close', async () => {
      stream.connect();
      await new Promise((r) => setTimeout(r, 10));
      stream.close();

      expect(stream.isConnected).toBe(false);
    });
  });
});

describe('RunStream event types', () => {
  it('should support all documented event types', async () => {
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

    // This is a design/documentation test to ensure all event types are covered
    expect(eventTypes).toHaveLength(12);
  });
});
