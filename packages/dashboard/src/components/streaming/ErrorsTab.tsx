/**
 * ErrorsTab - Display errors and warnings
 */

import { useState, memo } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, Copy, Check, AlertTriangle } from 'lucide-react';
import type { AgentErrorEvent } from '../../types/agent-events';

export interface ErrorsTabProps {
  errors: AgentErrorEvent[];
  className?: string;
}

interface ErrorItemProps {
  error: AgentErrorEvent;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function ErrorItemComponent({ error }: ErrorItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasDetails = error.details && Object.keys(error.details).length > 0;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = hasDetails
      ? `${error.message}\n\nDetails:\n${JSON.stringify(error.details, null, 2)}`
      : error.message;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-start gap-3 p-3 ${hasDetails ? 'cursor-pointer hover:bg-red-100' : ''}`}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        {/* Expand chevron */}
        <div className="flex-shrink-0 w-4 h-4 mt-0.5">
          {hasDetails ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-red-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-red-500" />
            )
          ) : null}
        </div>

        {/* Error icon */}
        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-red-800 break-words">{error.message}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-red-600">Work Order: {error.workOrderId}</span>
            {error.runId !== 'unknown' && (
              <span className="text-xs text-red-600">Run: {error.runId}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-red-100 rounded transition-colors"
            title="Copy error"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-red-500" />
            )}
          </button>
          <span className="text-xs text-red-500">{formatTime(error.timestamp)}</span>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && hasDetails && (
        <div className="px-3 pb-3 pt-0">
          <div className="text-xs font-medium text-red-700 mb-1">Details</div>
          <pre className="text-xs bg-white rounded border border-red-200 p-2 overflow-x-auto max-h-40 overflow-y-auto font-mono">
            {JSON.stringify(error.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

const ErrorItem = memo(ErrorItemComponent);

export function ErrorsTab({ errors, className = '' }: ErrorsTabProps) {
  if (errors.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-gray-500 ${className}`}>
        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
          <Check className="w-6 h-6 text-green-500" />
        </div>
        <p className="text-sm font-medium">No errors</p>
        <p className="text-xs mt-1">All operations completed successfully</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <span className="text-sm font-medium text-red-700">{errors.length} error(s)</span>
      </div>

      {/* Error list */}
      <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2">
        {errors.map((error, index) => (
          <ErrorItem key={`${error.timestamp}-${index}`} error={error} />
        ))}
      </div>
    </div>
  );
}
