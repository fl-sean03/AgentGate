/**
 * AgentActivityPanel - Real-time display of agent activity
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, Pause, Play, ArrowDown } from 'lucide-react';
import { EventCard } from './EventCard';
import { useRunStream } from '../../hooks/useRunStream';
import type { ConnectionState } from '../../api/websocket';

export interface AgentActivityPanelProps {
  workOrderId: string;
  maxEvents?: number;
  autoScroll?: boolean;
  className?: string;
}

interface ConnectionStatusIndicatorProps {
  connectionState: ConnectionState;
  isSubscribed: boolean;
  onReconnect: () => void;
}

function ConnectionStatusIndicator({
  connectionState,
  isSubscribed,
  onReconnect,
}: ConnectionStatusIndicatorProps) {
  const getStatusConfig = () => {
    if (connectionState === 'connected' && isSubscribed) {
      return {
        icon: <Wifi className="w-3.5 h-3.5" />,
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        label: 'Live',
        pulse: true,
      };
    }
    if (connectionState === 'connecting') {
      return {
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" />,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        label: 'Connecting...',
        pulse: false,
      };
    }
    if (connectionState === 'error') {
      return {
        icon: <WifiOff className="w-3.5 h-3.5" />,
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: 'Error',
        pulse: false,
      };
    }
    return {
      icon: <WifiOff className="w-3.5 h-3.5" />,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      label: 'Disconnected',
      pulse: false,
    };
  };

  const config = getStatusConfig();
  const showReconnect = connectionState === 'disconnected' || connectionState === 'error';

  return (
    <button
      onClick={showReconnect ? onReconnect : undefined}
      disabled={!showReconnect}
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium
        ${config.bgColor} ${config.borderColor} ${config.color}
        ${showReconnect ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
        transition-all
      `}
      title={showReconnect ? 'Click to reconnect' : undefined}
    >
      {config.icon}
      <span>{config.label}</span>
      {config.pulse && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
    </button>
  );
}

export function AgentActivityPanel({
  workOrderId,
  maxEvents = 500,
  autoScroll: initialAutoScroll = true,
  className = '',
}: AgentActivityPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(initialAutoScroll);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastScrollTopRef = useRef(0);

  const {
    events,
    isSubscribed,
    connectionState,
    subscribe,
    clearEvents,
  } = useRunStream({ maxEvents });

  // Subscribe to work order on mount
  useEffect(() => {
    if (workOrderId) {
      subscribe(workOrderId);
    }
  }, [workOrderId, subscribe]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Handle scroll events to detect manual scrolling
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    // User scrolled up - disable auto-scroll
    if (scrollTop < lastScrollTopRef.current && !isAtBottom) {
      setAutoScroll(false);
      setShowScrollToBottom(true);
    }

    // User scrolled to bottom - enable auto-scroll
    if (isAtBottom) {
      setAutoScroll(true);
      setShowScrollToBottom(false);
    }

    lastScrollTopRef.current = scrollTop;
  }, []);

  // Scroll to bottom manually
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      setAutoScroll(true);
      setShowScrollToBottom(false);
    }
  }, []);

  // Toggle auto-scroll
  const toggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev);
    if (!autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [autoScroll]);

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    subscribe(workOrderId);
  }, [subscribe, workOrderId]);

  return (
    <div className={`flex flex-col bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Live Activity</h3>
          <ConnectionStatusIndicator
            connectionState={connectionState}
            isSubscribed={isSubscribed}
            onReconnect={handleReconnect}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{events.length} events</span>
          <button
            onClick={toggleAutoScroll}
            className={`
              p-1.5 rounded border transition-colors
              ${autoScroll
                ? 'bg-blue-50 border-blue-200 text-blue-600'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }
            `}
            title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
          >
            {autoScroll ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={clearEvents}
            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Events list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[200px] max-h-[600px]"
      >
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Wifi className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium">Waiting for activity...</p>
            <p className="text-xs mt-1">Events will appear here as the agent works</p>
          </div>
        ) : (
          events.map((event, index) => (
            <EventCard
              key={`${event.timestamp}-${index}`}
              event={event}
            />
          ))
        )}
      </div>

      {/* Scroll to bottom button */}
      {showScrollToBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-2 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors"
          title="Scroll to bottom"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
