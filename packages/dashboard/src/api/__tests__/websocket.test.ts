import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketClient } from '../websocket';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  readyState = 0; // CONNECTING
  sent: string[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose();
    }
  }

  // Test helpers
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) {
      this.onopen();
    }
  }

  simulateMessage(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateError() {
    this.readyState = 3;
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }

  simulateClose() {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose();
    }
  }
}

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    MockWebSocket.instances = [];
    // Mock WebSocket globally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.WebSocket = MockWebSocket as any;
    localStorage.clear();
    client = new WebSocketClient({ url: 'ws://localhost:3000/ws' });
  });

  afterEach(() => {
    client.disconnect();
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should create WebSocket connection', () => {
      client.connect();

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3000/ws');
    });

    it('should not create duplicate connections', () => {
      client.connect();
      client.connect();

      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should include API key in URL if available', () => {
      localStorage.setItem('agentgate_api_key', 'test-key');
      const newClient = new WebSocketClient({ url: 'ws://localhost:3000/ws' });

      newClient.connect();

      expect(MockWebSocket.instances[0].url).toContain('token=test-key');
      newClient.disconnect();
    });

    it('should update connection state to connecting', () => {
      const stateChanges: string[] = [];
      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      newClient.connect();

      expect(stateChanges).toContain('connecting');
      newClient.disconnect();
    });

    it('should update connection state to connected on open', () => {
      const stateChanges: string[] = [];
      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      newClient.connect();
      MockWebSocket.instances[0].simulateOpen();

      expect(stateChanges).toContain('connected');
      newClient.disconnect();
    });
  });

  describe('disconnect', () => {
    it('should close WebSocket connection', () => {
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      client.disconnect();

      expect(MockWebSocket.instances[0].readyState).toBe(3); // CLOSED
    });

    it('should update connection state to disconnected', () => {
      const stateChanges: string[] = [];
      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      newClient.connect();
      MockWebSocket.instances[0].simulateOpen();
      newClient.disconnect();

      expect(stateChanges[stateChanges.length - 1]).toBe('disconnected');
    });
  });

  describe('subscribe', () => {
    it('should call handler when message is received', () => {
      const handler = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      client.subscribe(handler);
      MockWebSocket.instances[0].simulateMessage({
        type: 'workorder:updated',
        data: { id: 'wo-123', status: 'running' },
      });

      expect(handler).toHaveBeenCalledWith({
        type: 'workorder:updated',
        data: { id: 'wo-123', status: 'running' },
      });
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      const unsubscribe = client.subscribe(handler);
      unsubscribe();

      MockWebSocket.instances[0].simulateMessage({
        type: 'workorder:updated',
        data: {},
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      client.subscribe(handler1);
      client.subscribe(handler2);

      MockWebSocket.instances[0].simulateMessage({
        type: 'workorder:created',
        data: { id: 'wo-123' },
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(client.isConnected()).toBe(false);
    });

    it('should return true when connected', () => {
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      expect(client.isConnected()).toBe(true);
    });

    it('should return false after disconnect', () => {
      client.connect();
      MockWebSocket.instances[0].simulateOpen();
      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('getConnectionState', () => {
    it('should return disconnected initially', () => {
      expect(client.getConnectionState()).toBe('disconnected');
    });

    it('should return connecting when connecting', () => {
      client.connect();

      expect(client.getConnectionState()).toBe('connecting');
    });

    it('should return connected when open', () => {
      client.connect();
      MockWebSocket.instances[0].simulateOpen();

      expect(client.getConnectionState()).toBe('connected');
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON messages', () => {
      const handler = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();
      client.subscribe(handler);

      // Simulate invalid JSON
      if (MockWebSocket.instances[0].onmessage) {
        MockWebSocket.instances[0].onmessage({ data: 'invalid json' });
      }

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle messages without required fields', () => {
      const handler = vi.fn();
      client.connect();
      MockWebSocket.instances[0].simulateOpen();
      client.subscribe(handler);

      MockWebSocket.instances[0].simulateMessage({
        // Missing 'type' field - intentionally invalid for testing
        data: { id: 'test' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should catch errors in event handlers', () => {
      const handler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const handler2 = vi.fn();

      client.connect();
      MockWebSocket.instances[0].simulateOpen();
      client.subscribe(handler);
      client.subscribe(handler2);

      // Should not throw, and handler2 should still be called
      expect(() => {
        MockWebSocket.instances[0].simulateMessage({
          type: 'workorder:updated',
          data: { id: 'wo-123' },
        });
      }).not.toThrow();

      expect(handler).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should update state to error on WebSocket error', () => {
      const stateChanges: string[] = [];
      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        onConnectionStateChange: (state) => stateChanges.push(state),
      });

      newClient.connect();
      MockWebSocket.instances[0].simulateError();

      expect(stateChanges).toContain('error');
      newClient.disconnect();
    });
  });

  describe('reconnection', () => {
    it('should attempt to reconnect on close', async () => {
      vi.useFakeTimers();

      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnectInterval: 1000,
      });

      newClient.connect();
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateClose();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(1100);

      // Should have created a second connection attempt
      expect(MockWebSocket.instances.length).toBeGreaterThan(1);

      vi.useRealTimers();
      newClient.disconnect();
    });

    it('should not reconnect when intentionally closed', async () => {
      vi.useFakeTimers();

      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnectInterval: 1000,
      });

      newClient.connect();
      MockWebSocket.instances[0].simulateOpen();
      newClient.disconnect();

      // Fast-forward time
      await vi.advanceTimersByTimeAsync(2000);

      // Should not create additional connections
      expect(MockWebSocket.instances).toHaveLength(1);

      vi.useRealTimers();
    });

    it('should respect maxReconnectAttempts', async () => {
      vi.useFakeTimers();

      const newClient = new WebSocketClient({
        url: 'ws://localhost:3000/ws',
        reconnectInterval: 100,
        maxReconnectAttempts: 2,
      });

      newClient.connect();
      MockWebSocket.instances[0].simulateClose();

      // Fast-forward through multiple reconnect attempts
      await vi.advanceTimersByTimeAsync(500);

      // Should be 1 initial + 2 reconnect attempts = 3 total
      expect(MockWebSocket.instances.length).toBeLessThanOrEqual(3);

      vi.useRealTimers();
      newClient.disconnect();
    });
  });
});
