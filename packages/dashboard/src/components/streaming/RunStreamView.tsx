/**
 * RunStreamView - Comprehensive run detail view with tabbed streaming output
 */

import { useState, useEffect } from 'react';
import { Activity, Wrench, MessageSquare, FileIcon, AlertCircle } from 'lucide-react';
import { ProgressHeader } from './ProgressHeader';
import { AgentActivityPanel } from './AgentActivityPanel';
import { ToolCallsTab } from './ToolCallsTab';
import { OutputTab } from './OutputTab';
import { FilesTab } from './FilesTab';
import { ErrorsTab } from './ErrorsTab';
import { useRunStream } from '../../hooks/useRunStream';

export interface RunStreamViewProps {
  workOrderId: string;
  maxEvents?: number;
  className?: string;
}

type TabId = 'activity' | 'tools' | 'output' | 'files' | 'errors';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  getBadge?: () => number | undefined;
}

export function RunStreamView({
  workOrderId,
  maxEvents = 500,
  className = '',
}: RunStreamViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('activity');

  const {
    events,
    toolCalls,
    files,
    errors,
    outputs,
    progress,
    isSubscribed,
    connectionState,
    subscribe,
    unsubscribe,
  } = useRunStream({ maxEvents });

  // Subscribe on mount
  useEffect(() => {
    if (workOrderId) {
      subscribe(workOrderId);
    }
    return () => {
      unsubscribe();
    };
  }, [workOrderId, subscribe, unsubscribe]);

  const tabs: TabConfig[] = [
    {
      id: 'activity',
      label: 'Activity',
      icon: <Activity className="w-4 h-4" />,
      getBadge: () => (events.length > 0 ? events.length : undefined),
    },
    {
      id: 'tools',
      label: 'Tools',
      icon: <Wrench className="w-4 h-4" />,
      getBadge: () => (toolCalls.length > 0 ? toolCalls.length : undefined),
    },
    {
      id: 'output',
      label: 'Output',
      icon: <MessageSquare className="w-4 h-4" />,
      getBadge: () => (outputs.length > 0 ? outputs.length : undefined),
    },
    {
      id: 'files',
      label: 'Files',
      icon: <FileIcon className="w-4 h-4" />,
      getBadge: () => (files.length > 0 ? files.length : undefined),
    },
    {
      id: 'errors',
      label: 'Errors',
      icon: <AlertCircle className="w-4 h-4" />,
      getBadge: () => (errors.length > 0 ? errors.length : undefined),
    },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'activity':
        return (
          <AgentActivityPanel
            workOrderId={workOrderId}
            maxEvents={maxEvents}
            autoScroll={true}
            className="border-0"
          />
        );
      case 'tools':
        return <ToolCallsTab toolCalls={toolCalls} />;
      case 'output':
        return <OutputTab outputs={outputs} />;
      case 'files':
        return <FilesTab files={files} />;
      case 'errors':
        return <ErrorsTab errors={errors} />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex flex-col bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Progress header */}
      <ProgressHeader progress={progress} className="border-b border-gray-200 rounded-none rounded-t-lg" />

      {/* Tab navigation */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => {
          const badge = tab.getBadge?.();
          const isActive = activeTab === tab.id;
          const hasErrors = tab.id === 'errors' && errors.length > 0;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }
                ${hasErrors && !isActive ? 'text-red-600' : ''}
              `}
            >
              <span className={hasErrors && !isActive ? 'text-red-600' : ''}>{tab.icon}</span>
              <span>{tab.label}</span>
              {badge !== undefined && (
                <span
                  className={`
                    px-1.5 py-0.5 text-xs rounded-full
                    ${isActive
                      ? 'bg-blue-100 text-blue-700'
                      : hasErrors
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }
                  `}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Connection status */}
        <div className="flex items-center ml-auto px-4">
          <div className="flex items-center gap-2">
            <span
              className={`
                w-2 h-2 rounded-full
                ${connectionState === 'connected' && isSubscribed
                  ? 'bg-green-500 animate-pulse'
                  : connectionState === 'connecting'
                    ? 'bg-yellow-500 animate-pulse'
                    : connectionState === 'error'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                }
              `}
            />
            <span className="text-xs text-gray-500">
              {connectionState === 'connected' && isSubscribed
                ? 'Live'
                : connectionState === 'connecting'
                  ? 'Connecting...'
                  : connectionState === 'error'
                    ? 'Error'
                    : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 p-4 min-h-[400px]">{renderTabContent()}</div>
    </div>
  );
}
