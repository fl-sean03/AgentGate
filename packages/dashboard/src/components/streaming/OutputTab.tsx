/**
 * OutputTab - Display agent text output
 */

import { useState, useMemo, useCallback } from 'react';
import { Copy, Check, Search, MessageSquare } from 'lucide-react';
import type { AgentOutputEvent } from '../../types/agent-events';

export interface OutputTabProps {
  outputs: AgentOutputEvent[];
  className?: string;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function OutputTab({ outputs, className = '' }: OutputTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  // Filter outputs by search query
  const filteredOutputs = useMemo(() => {
    if (!searchQuery) return outputs;
    const query = searchQuery.toLowerCase();
    return outputs.filter((o) => o.content.toLowerCase().includes(query));
  }, [outputs, searchQuery]);

  // Combine all output for copy
  const allOutput = useMemo(() => {
    return outputs.map((o) => o.content).join('\n\n');
  }, [outputs]);

  // Copy all output
  const handleCopyAll = useCallback(async () => {
    await navigator.clipboard.writeText(allOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [allOutput]);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{outputs.length} messages</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search output..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs border border-gray-200 rounded pl-7 pr-2 py-1.5 w-40 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Copy all */}
          <button
            onClick={handleCopyAll}
            disabled={outputs.length === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span className="text-green-600">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-gray-500" />
                <span>Copy All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Output content */}
      <div className="flex-1 overflow-y-auto max-h-[500px]">
        {filteredOutputs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm">No output yet</p>
            {searchQuery ? (
              <p className="text-xs mt-1">Try adjusting your search</p>
            ) : (
              <p className="text-xs mt-1">Agent output will appear here</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOutputs.map((output, index) => (
              <div
                key={`${output.timestamp}-${index}`}
                className="bg-gray-50 rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs text-gray-500">{formatTime(output.timestamp)}</span>
                </div>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono bg-white rounded border border-gray-100 p-3 overflow-x-auto">
                    {output.content}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
