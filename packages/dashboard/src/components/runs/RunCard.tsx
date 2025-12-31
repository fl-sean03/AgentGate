import { useState } from 'react';
import { Run } from '../../types/run';
import { IterationCard } from './IterationCard';
import { ChevronDown, ChevronRight, PlayCircle, CheckCircle, XCircle, Clock } from 'lucide-react';

interface RunCardProps {
  run: Run;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'succeeded':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'running':
      return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
    default:
      return <PlayCircle className="w-5 h-5 text-gray-500" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'succeeded':
      return 'border-green-300 bg-green-50';
    case 'failed':
      return 'border-red-300 bg-red-50';
    case 'running':
      return 'border-blue-300 bg-blue-50';
    default:
      return 'border-gray-300 bg-gray-50';
  }
}

export function RunCard({ run }: RunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const duration = run.completed_at
    ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    : null;

  return (
    <div className={`rounded-lg border-2 ${getStatusColor(run.status)} overflow-hidden`}>
      {/* Run Header */}
      <div
        className="p-4 cursor-pointer hover:bg-opacity-80 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 flex-1">
            {getStatusIcon(run.status)}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-gray-900">Run #{run.id}</h3>
                <span className="text-xs text-gray-600 capitalize">({run.status})</span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Started {new Date(run.started_at).toLocaleString()}
              </div>
              {duration !== null && (
                <div className="text-sm text-gray-600 mt-0.5">
                  Duration: {(duration / 1000).toFixed(2)}s
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{run.total_iterations}</span>{' '}
              {run.total_iterations === 1 ? 'iteration' : 'iterations'}
            </div>
            <button className="text-gray-600 hover:text-gray-900 transition-colors">
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Error Message (when collapsed) */}
        {!isExpanded && run.error_message && (
          <div className="mt-3 text-sm text-red-700 bg-red-100 rounded px-3 py-2 border border-red-200">
            <span className="font-medium">Error:</span> {run.error_message}
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t-2 border-gray-300 bg-white p-4 space-y-4">
          {/* Iterations */}
          {run.iterations.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Iterations</h4>
              <div className="space-y-3">
                {run.iterations.map((iteration) => (
                  <IterationCard key={iteration.id} iteration={iteration} />
                ))}
              </div>
            </div>
          )}

          {/* Final Verification */}
          {run.final_verification && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Final Verification</h4>
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">Overall Status:</span>
                  <span
                    className={`text-sm font-semibold capitalize ${
                      run.final_verification.overall_status === 'passed'
                        ? 'text-green-700'
                        : run.final_verification.overall_status === 'failed'
                          ? 'text-red-700'
                          : 'text-gray-700'
                    }`}
                  >
                    {run.final_verification.overall_status}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Total Duration: {(run.final_verification.total_duration_ms / 1000).toFixed(2)}s
                </div>
              </div>
            </div>
          )}

          {/* Error Message (when expanded) */}
          {run.error_message && (
            <div>
              <h4 className="font-semibold text-red-900 mb-2">Error</h4>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-sm text-red-800 font-mono">{run.error_message}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
