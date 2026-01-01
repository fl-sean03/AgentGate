/**
 * ToolCallsTab - Display tool calls in structured format
 */

import { useState, useMemo, memo } from 'react';
import {
  BookOpen,
  FileEdit,
  Pencil,
  Terminal,
  Search,
  FolderSearch,
  Globe,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  Copy,
  Check,
} from 'lucide-react';
import type { ToolCallWithResult, AgentToolName } from '../../types/agent-events';

export interface ToolCallsTabProps {
  toolCalls: ToolCallWithResult[];
  className?: string;
}

interface ToolCallItemProps {
  toolCall: ToolCallWithResult;
}

function getToolIcon(tool: AgentToolName): React.ReactNode {
  switch (tool) {
    case 'Read':
      return <BookOpen className="w-4 h-4" />;
    case 'Write':
      return <FileEdit className="w-4 h-4" />;
    case 'Edit':
      return <Pencil className="w-4 h-4" />;
    case 'Bash':
      return <Terminal className="w-4 h-4" />;
    case 'Grep':
      return <Search className="w-4 h-4" />;
    case 'Glob':
      return <FolderSearch className="w-4 h-4" />;
    case 'WebFetch':
    case 'WebSearch':
      return <Globe className="w-4 h-4" />;
    default:
      return <Terminal className="w-4 h-4" />;
  }
}

function getToolColor(tool: AgentToolName): { bg: string; text: string; border: string } {
  switch (tool) {
    case 'Read':
      return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'Write':
    case 'Edit':
      return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    case 'Bash':
      return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
    case 'Grep':
    case 'Glob':
      return { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
    case 'WebFetch':
    case 'WebSearch':
      return { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  }
}

function getToolSummary(toolCall: ToolCallWithResult): string {
  const { call } = toolCall;
  const input = call.input;

  switch (call.tool) {
    case 'Read':
      return input.file_path ? String(input.file_path) : 'Reading file...';
    case 'Write':
      return input.file_path ? String(input.file_path) : 'Writing file...';
    case 'Edit':
      return input.file_path ? String(input.file_path) : 'Editing file...';
    case 'Bash': {
      const cmd = input.command ? String(input.command) : 'Executing command...';
      return cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
    }
    case 'Grep':
      return input.pattern ? `Pattern: ${input.pattern}` : 'Searching...';
    case 'Glob':
      return input.pattern ? `Pattern: ${input.pattern}` : 'Finding files...';
    case 'WebFetch':
    case 'WebSearch':
      return input.url ? String(input.url) : 'Fetching...';
    default:
      return 'Executing...';
  }
}

function ToolCallItemComponent({ toolCall }: ToolCallItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedInput, setCopiedInput] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  const { call, result } = toolCall;
  const colors = getToolColor(call.tool);
  const isPending = !result;
  const isSuccess = result?.success ?? true;

  const handleCopyInput = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(JSON.stringify(call.input, null, 2));
    setCopiedInput(true);
    setTimeout(() => setCopiedInput(false), 2000);
  };

  const handleCopyOutput = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (result) {
      await navigator.clipboard.writeText(result.contentPreview);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`}>
      {/* Header */}
      <div
        className="flex items-start gap-3 p-3 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand chevron */}
        <div className="flex-shrink-0 w-4 h-4 mt-0.5">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
        </div>

        {/* Tool icon */}
        <div className={`flex-shrink-0 ${colors.text}`}>{getToolIcon(call.tool)}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
            >
              {call.tool}
            </span>

            {/* Status indicator */}
            {isPending ? (
              <span className="flex items-center gap-1 text-xs text-yellow-600">
                <Clock className="w-3 h-3 animate-spin" />
                Pending
              </span>
            ) : isSuccess ? (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="w-3 h-3" />
                Success
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <XCircle className="w-3 h-3" />
                Failed
              </span>
            )}

            {/* Duration */}
            {result && (
              <span className="text-xs text-gray-500">{result.durationMs}ms</span>
            )}
          </div>

          <p className="text-sm text-gray-700 mt-1 truncate font-mono">
            {getToolSummary(toolCall)}
          </p>
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 text-xs text-gray-500">
          {new Date(call.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 space-y-3">
          {/* Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Input</span>
              <button
                onClick={handleCopyInput}
                className="p-1 hover:bg-white rounded transition-colors"
                title="Copy input"
              >
                {copiedInput ? (
                  <Check className="w-3 h-3 text-green-600" />
                ) : (
                  <Copy className="w-3 h-3 text-gray-500" />
                )}
              </button>
            </div>
            <pre className="text-xs bg-white rounded border border-gray-200 p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {result && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">
                  Output ({result.contentLength} chars)
                </span>
                <button
                  onClick={handleCopyOutput}
                  className="p-1 hover:bg-white rounded transition-colors"
                  title="Copy output"
                >
                  {copiedOutput ? (
                    <Check className="w-3 h-3 text-green-600" />
                  ) : (
                    <Copy className="w-3 h-3 text-gray-500" />
                  )}
                </button>
              </div>
              <pre
                className={`
                  text-xs rounded border p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono
                  ${result.success ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}
                `}
              >
                {result.contentPreview}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ToolCallItem = memo(ToolCallItemComponent);

const TOOL_OPTIONS: AgentToolName[] = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Grep',
  'Glob',
  'WebFetch',
  'WebSearch',
  'Other',
];

export function ToolCallsTab({ toolCalls, className = '' }: ToolCallsTabProps) {
  const [filterTool, setFilterTool] = useState<AgentToolName | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter tool calls
  const filteredToolCalls = useMemo(() => {
    return toolCalls.filter((tc) => {
      // Tool filter
      if (filterTool !== 'all' && tc.call.tool !== filterTool) {
        return false;
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const inputStr = JSON.stringify(tc.call.input).toLowerCase();
        const resultStr = tc.result?.contentPreview.toLowerCase() || '';
        return inputStr.includes(query) || resultStr.includes(query);
      }

      return true;
    });
  }, [toolCalls, filterTool, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = toolCalls.length;
    const successful = toolCalls.filter((tc) => tc.result?.success).length;
    const failed = toolCalls.filter((tc) => tc.result && !tc.result.success).length;
    const pending = toolCalls.filter((tc) => !tc.result).length;
    return { total, successful, failed, pending };
  }, [toolCalls]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        {/* Stats */}
        <div className="flex items-center gap-4 text-xs">
          <span className="text-gray-600">Total: {stats.total}</span>
          <span className="text-green-600">Success: {stats.successful}</span>
          <span className="text-red-600">Failed: {stats.failed}</span>
          {stats.pending > 0 && (
            <span className="text-yellow-600">Pending: {stats.pending}</span>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Tool filter */}
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={filterTool}
              onChange={(e) => setFilterTool(e.target.value as AgentToolName | 'all')}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Tools</option>
              {TOOL_OPTIONS.map((tool) => (
                <option key={tool} value={tool}>
                  {tool}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Tool calls list */}
      <div className="flex-1 overflow-y-auto space-y-2 max-h-[500px]">
        {filteredToolCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Terminal className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm">No tool calls yet</p>
            {filterTool !== 'all' || searchQuery ? (
              <p className="text-xs mt-1">Try adjusting your filters</p>
            ) : (
              <p className="text-xs mt-1">Tool calls will appear here as the agent works</p>
            )}
          </div>
        ) : (
          filteredToolCalls.map((tc) => (
            <ToolCallItem key={tc.call.toolUseId} toolCall={tc} />
          ))
        )}
      </div>
    </div>
  );
}
