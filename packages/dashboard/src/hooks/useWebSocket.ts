/**
 * React hook for WebSocket connection management
 */

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getWebSocketClient,
  type WebSocketMessage,
  type ConnectionState,
} from '../api/websocket';
import type { WorkOrder } from '../types/work-order';
import type { Run } from '../types/run';

export interface UseWebSocketOptions {
  autoConnect?: boolean;
}

export interface UseWebSocketReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

/**
 * Hook to manage WebSocket connection and integrate with React Query
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { autoConnect = true } = options;
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  // Get WebSocket client instance
  const wsClient = getWebSocketClient();

  // Handle WebSocket events and update React Query cache
  const handleWebSocketEvent = useCallback(
    (event: WebSocketMessage) => {
      switch (event.type) {
        case 'workorder:created': {
          // Invalidate work orders list to fetch new data
          queryClient.invalidateQueries({ queryKey: ['work-orders'] });
          break;
        }

        case 'workorder:updated': {
          const workOrder = event.data as WorkOrder;

          // Update specific work order in cache
          queryClient.setQueryData(['work-order', workOrder.id], workOrder);

          // Invalidate work orders list to update the list view
          queryClient.invalidateQueries({ queryKey: ['work-orders'] });

          break;
        }

        case 'run:updated': {
          const run = event.data as Run;

          // Update specific run in cache
          queryClient.setQueryData(['run', run.id], run);

          // Invalidate runs list for this work order
          queryClient.invalidateQueries({
            queryKey: ['runs', run.work_order_id]
          });

          // Also invalidate the work order since run status affects it
          queryClient.invalidateQueries({
            queryKey: ['work-order', run.work_order_id]
          });

          break;
        }
      }
    },
    [queryClient]
  );

  // Connect/disconnect functions
  const connect = useCallback(() => {
    wsClient.connect();
  }, [wsClient]);

  const disconnect = useCallback(() => {
    wsClient.disconnect();
  }, [wsClient]);

  // Set up WebSocket connection
  useEffect(() => {
    // Subscribe to connection state changes
    const originalOnChange = wsClient['onConnectionStateChange'];
    wsClient['onConnectionStateChange'] = (state: ConnectionState) => {
      setConnectionState(state);
      originalOnChange?.(state);
    };

    // Subscribe to WebSocket events
    const unsubscribe = wsClient.subscribe(handleWebSocketEvent);

    // Auto-connect if enabled
    if (autoConnect) {
      wsClient.connect();
    } else {
      setConnectionState(wsClient.getConnectionState());
    }

    // Cleanup on unmount
    return () => {
      unsubscribe();
      if (autoConnect) {
        wsClient.disconnect();
      }
    };
  }, [wsClient, handleWebSocketEvent, autoConnect]);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    connect,
    disconnect,
  };
}
