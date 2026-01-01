/**
 * useRunStream hook tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '../../test/utils';
import { useRunStream } from '../useRunStream';

// Mock the websocket module
vi.mock('../../api/websocket', () => {
  const mockWsClient = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    send: vi.fn().mockReturnValue(true),
    isConnected: vi.fn().mockReturnValue(true),
    getConnectionState: vi.fn().mockReturnValue('connected' as const),
  };

  return {
    getWebSocketClient: vi.fn().mockReturnValue(mockWsClient),
    // Need to also export the types
    ConnectionState: {},
  };
});

// Get reference to the mock after it's defined
import { getWebSocketClient } from '../../api/websocket';

describe('useRunStream', () => {
  let mockWsClient: ReturnType<typeof getWebSocketClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWsClient = getWebSocketClient();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useRunStream());

      expect(result.current.events).toEqual([]);
      expect(result.current.toolCalls).toEqual([]);
      expect(result.current.files).toEqual([]);
      expect(result.current.errors).toEqual([]);
      expect(result.current.outputs).toEqual([]);
      expect(result.current.progress).toBeNull();
      expect(result.current.isSubscribed).toBe(false);
    });

    it('should auto-connect by default', () => {
      renderHook(() => useRunStream());

      expect(mockWsClient.connect).toHaveBeenCalled();
    });

    it('should not auto-connect when disabled', () => {
      (mockWsClient.connect as ReturnType<typeof vi.fn>).mockClear();
      renderHook(() => useRunStream({ autoConnect: false }));

      expect(mockWsClient.connect).not.toHaveBeenCalled();
    });
  });

  describe('subscription', () => {
    it('should subscribe to work order', () => {
      const { result } = renderHook(() => useRunStream());

      act(() => {
        result.current.subscribe('wo-123');
      });

      expect(mockWsClient.send).toHaveBeenCalledWith({
        type: 'subscribe',
        workOrderId: 'wo-123',
        filters: undefined,
      });
    });

    it('should unsubscribe from work order', () => {
      const { result } = renderHook(() => useRunStream());

      act(() => {
        result.current.subscribe('wo-123');
      });

      act(() => {
        result.current.unsubscribe();
      });

      expect(mockWsClient.send).toHaveBeenCalledWith({
        type: 'unsubscribe',
        workOrderId: 'wo-123',
      });
    });
  });

  describe('clear events', () => {
    it('should clear all events', () => {
      const { result } = renderHook(() => useRunStream());

      // Clear events (even if empty)
      act(() => {
        result.current.clearEvents();
      });

      expect(result.current.events).toEqual([]);
      expect(result.current.outputs).toEqual([]);
    });
  });

  describe('exposed state', () => {
    it('should expose connection state', () => {
      const { result } = renderHook(() => useRunStream());

      expect(result.current.connectionState).toBeDefined();
    });

    it('should expose subscribe and unsubscribe functions', () => {
      const { result } = renderHook(() => useRunStream());

      expect(typeof result.current.subscribe).toBe('function');
      expect(typeof result.current.unsubscribe).toBe('function');
    });

    it('should expose clearEvents function', () => {
      const { result } = renderHook(() => useRunStream());

      expect(typeof result.current.clearEvents).toBe('function');
    });
  });
});
