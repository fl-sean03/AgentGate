/**
 * Connection status indicator for WebSocket connection
 */

import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import type { ConnectionState } from '../../api/websocket';

export interface ConnectionStatusProps {
  connectionState: ConnectionState;
  onReconnect?: () => void;
}

/**
 * Visual indicator for WebSocket connection status
 */
export function ConnectionStatus({ connectionState, onReconnect }: ConnectionStatusProps) {
  const getStatusConfig = () => {
    switch (connectionState) {
      case 'connected':
        return {
          icon: <Wifi className="w-4 h-4" />,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          label: 'Connected',
          showReconnect: false,
        };
      case 'connecting':
        return {
          icon: <RefreshCw className="w-4 h-4 animate-spin" />,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          label: 'Connecting...',
          showReconnect: false,
        };
      case 'disconnected':
        return {
          icon: <WifiOff className="w-4 h-4" />,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          label: 'Disconnected',
          showReconnect: true,
        };
      case 'error':
        return {
          icon: <WifiOff className="w-4 h-4" />,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          label: 'Connection Error',
          showReconnect: true,
        };
    }
  };

  const config = getStatusConfig();

  const handleClick = () => {
    if (config.showReconnect && onReconnect) {
      onReconnect();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!config.showReconnect}
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all
        ${config.bgColor} ${config.borderColor} ${config.color}
        ${config.showReconnect ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
      `}
      title={config.showReconnect ? 'Click to reconnect' : undefined}
    >
      {config.icon}
      <span className="text-sm font-medium">{config.label}</span>
    </button>
  );
}
