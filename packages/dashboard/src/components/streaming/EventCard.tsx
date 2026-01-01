/**
 * EventCard component for rendering individual agent events
 */

import { useState, memo } from 'react';
import {
  BookOpen,
  FileEdit,
  Pencil,
  Terminal,
  Search,
  FolderSearch,
  Globe,
  MessageSquare,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Play,
  CheckCircle,
  XCircle,
  BarChart3,
  FileIcon,
} from 'lucide-react';
import type { AgentEvent, AgentToolName } from '../../types/agent-events';

export interface EventCardProps {
  event: AgentEvent;
  expanded?: boolean;
  onToggle?: () => void;
}

interface EventConfig {
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  textColor: string;
  label: string;
}

function getToolConfig(tool: AgentToolName): EventConfig {
  switch (tool) {
    case 'Read':
      return {
        icon: <BookOpen className="w-4 h-4" />,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-700',
        label: 'Read',
      };
    case 'Write':
      return {
        icon: <FileEdit className="w-4 h-4" />,
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-700',
        label: 'Write',
      };
    case 'Edit':
      return {
        icon: <Pencil className="w-4 h-4" />,
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-700',
        label: 'Edit',
      };
    case 'Bash':
      return {
        icon: <Terminal className="w-4 h-4" />,
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        textColor: 'text-yellow-700',
        label: 'Bash',
      };
    case 'Grep':
      return {
        icon: <Search className="w-4 h-4" />,
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        textColor: 'text-purple-700',
        label: 'Grep',
      };
    case 'Glob':
      return {
        icon: <FolderSearch className="w-4 h-4" />,
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        textColor: 'text-purple-700',
        label: 'Glob',
      };
    case 'WebFetch':
    case 'WebSearch':
      return {
        icon: <Globe className="w-4 h-4" />,
        bgColor: 'bg-cyan-50',
        borderColor: 'border-cyan-200',
        textColor: 'text-cyan-700',
        label: tool,
      };
    default:
      return {
        icon: <Terminal className="w-4 h-4" />,
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        textColor: 'text-gray-700',
        label: 'Tool',
      };
  }
}

function getEventConfig(event: AgentEvent): EventConfig {
  switch (event.type) {
    case 'agent_tool_call':
      return getToolConfig(event.tool);
    case 'agent_tool_result': {
      const baseConfig = {
        icon: event.success ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <XCircle className="w-4 h-4" />
        ),
        bgColor: event.success ? 'bg-green-50' : 'bg-red-50',
        borderColor: event.success ? 'border-green-200' : 'border-red-200',
        textColor: event.success ? 'text-green-700' : 'text-red-700',
        label: event.success ? 'Success' : 'Error',
      };
      return baseConfig;
    }
    case 'agent_output':
      return {
        icon: <MessageSquare className="w-4 h-4" />,
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        textColor: 'text-gray-700',
        label: 'Output',
      };
    case 'file_changed':
      return {
        icon: <FileIcon className="w-4 h-4" />,
        bgColor:
          event.action === 'created'
            ? 'bg-green-50'
            : event.action === 'deleted'
              ? 'bg-red-50'
              : 'bg-yellow-50',
        borderColor:
          event.action === 'created'
            ? 'border-green-200'
            : event.action === 'deleted'
              ? 'border-red-200'
              : 'border-yellow-200',
        textColor:
          event.action === 'created'
            ? 'text-green-700'
            : event.action === 'deleted'
              ? 'text-red-700'
              : 'text-yellow-700',
        label: event.action.charAt(0).toUpperCase() + event.action.slice(1),
      };
    case 'progress_update':
      return {
        icon: <BarChart3 className="w-4 h-4" />,
        bgColor: 'bg-cyan-50',
        borderColor: 'border-cyan-200',
        textColor: 'text-cyan-700',
        label: 'Progress',
      };
    case 'agent_error':
      return {
        icon: <AlertCircle className="w-4 h-4" />,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-700',
        label: 'Error',
      };
    case 'run_started':
      return {
        icon: <Play className="w-4 h-4" />,
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-700',
        label: 'Run Started',
      };
    case 'run_completed':
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-700',
        label: 'Completed',
      };
    case 'run_failed':
      return {
        icon: <XCircle className="w-4 h-4" />,
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-700',
        label: 'Failed',
      };
    default:
      return {
        icon: <MessageSquare className="w-4 h-4" />,
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        textColor: 'text-gray-700',
        label: 'Event',
      };
  }
}

function getEventSummary(event: AgentEvent): string {
  switch (event.type) {
    case 'agent_tool_call': {
      const input = event.input;
      if (event.tool === 'Read' && input.file_path) {
        return `Reading ${input.file_path}`;
      }
      if (event.tool === 'Write' && input.file_path) {
        return `Writing ${input.file_path}`;
      }
      if (event.tool === 'Edit' && input.file_path) {
        return `Editing ${input.file_path}`;
      }
      if (event.tool === 'Bash' && input.command) {
        const cmd = String(input.command);
        return cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd;
      }
      if (event.tool === 'Grep' && input.pattern) {
        return `Searching for: ${input.pattern}`;
      }
      if (event.tool === 'Glob' && input.pattern) {
        return `Finding files: ${input.pattern}`;
      }
      if ((event.tool === 'WebFetch' || event.tool === 'WebSearch') && input.url) {
        return `Fetching ${input.url}`;
      }
      return `Invoking ${event.tool}`;
    }
    case 'agent_tool_result': {
      const preview = event.contentPreview;
      if (preview.length > 80) {
        return preview.slice(0, 77) + '...';
      }
      return preview;
    }
    case 'agent_output': {
      const content = event.content;
      if (content.length > 100) {
        return content.slice(0, 97) + '...';
      }
      return content;
    }
    case 'file_changed':
      return event.path;
    case 'progress_update':
      return `${event.percentage}% - ${event.currentPhase}`;
    case 'agent_error':
      return event.message;
    case 'run_started':
      return `Run #${event.runNumber} started`;
    case 'run_completed':
      return event.prUrl ? `PR created: ${event.prUrl}` : 'Run completed successfully';
    case 'run_failed':
      return event.error;
    default:
      return 'Unknown event';
  }
}

function getEventDetails(event: AgentEvent): string | null {
  switch (event.type) {
    case 'agent_tool_call':
      return JSON.stringify(event.input, null, 2);
    case 'agent_tool_result':
      return event.contentPreview;
    case 'agent_output':
      return event.content;
    case 'agent_error':
      return event.details ? JSON.stringify(event.details, null, 2) : null;
    case 'run_failed':
      return event.error;
    default:
      return null;
  }
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function EventCardComponent({ event, expanded = false, onToggle }: EventCardProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [copied, setCopied] = useState(false);

  const config = getEventConfig(event);
  const summary = getEventSummary(event);
  const details = getEventDetails(event);
  const hasDetails = details !== null;

  const handleToggle = () => {
    if (hasDetails) {
      setIsExpanded(!isExpanded);
      onToggle?.();
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (details) {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`
        rounded-lg border ${config.borderColor} ${config.bgColor}
        transition-all duration-150
      `}
    >
      <div
        className={`
          flex items-start gap-3 p-3 cursor-pointer
          ${hasDetails ? 'hover:opacity-80' : ''}
        `}
        onClick={handleToggle}
      >
        {/* Expand/collapse chevron */}
        <div className="flex-shrink-0 w-4 h-4 mt-0.5">
          {hasDetails ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500" />
            )
          ) : null}
        </div>

        {/* Icon */}
        <div className={`flex-shrink-0 ${config.textColor}`}>{config.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`
              text-xs font-medium px-1.5 py-0.5 rounded
              ${config.bgColor} ${config.textColor} border ${config.borderColor}
            `}
            >
              {config.label}
            </span>
            {event.type === 'agent_tool_result' && (
              <span className="text-xs text-gray-500">{event.durationMs}ms</span>
            )}
          </div>
          <p className="text-sm text-gray-700 mt-1 break-words font-mono">{summary}</p>
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 text-xs text-gray-500">{formatTime(event.timestamp)}</div>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-0">
          <div className="relative">
            <pre className="text-xs bg-white rounded border border-gray-200 p-3 overflow-x-auto max-h-64 overflow-y-auto font-mono">
              {details}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-500" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const EventCard = memo(EventCardComponent);
