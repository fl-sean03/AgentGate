/**
 * ProgressHeader - Progress indicator for run execution
 */

import { Clock, Wrench, BarChart3 } from 'lucide-react';
import type { ProgressState } from '../../types/agent-events';

export interface ProgressHeaderProps {
  progress: ProgressState | null;
  className?: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function ProgressHeader({ progress, className = '' }: ProgressHeaderProps) {
  if (!progress) {
    return (
      <div className={`bg-gray-50 rounded-lg border border-gray-200 p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Waiting for progress...</p>
            <p className="text-xs text-gray-400">Progress data will appear once the agent starts</p>
          </div>
        </div>
      </div>
    );
  }

  const { percentage, currentPhase, toolCallCount, elapsedSeconds, estimatedRemainingSeconds } =
    progress;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">{currentPhase}</span>
          <span className="text-sm font-semibold text-blue-600">{percentage}%</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm">
        {/* Tool calls */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-purple-50 flex items-center justify-center">
            <Wrench className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Tool Calls</p>
            <p className="font-semibold text-gray-900">{toolCallCount}</p>
          </div>
        </div>

        {/* Elapsed time */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Elapsed</p>
            <p className="font-semibold text-gray-900">{formatDuration(elapsedSeconds)}</p>
          </div>
        </div>

        {/* ETA */}
        {estimatedRemainingSeconds !== undefined && estimatedRemainingSeconds > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">ETA</p>
              <p className="font-semibold text-gray-900">
                {formatDuration(estimatedRemainingSeconds)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
