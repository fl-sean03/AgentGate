import { Iteration } from '../../types/run';
import { VerificationBadge } from './VerificationBadge';
import { Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface IterationCardProps {
  iteration: Iteration;
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
      return <AlertCircle className="w-5 h-5 text-gray-500" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'succeeded':
      return 'border-green-200 bg-green-50';
    case 'failed':
      return 'border-red-200 bg-red-50';
    case 'running':
      return 'border-blue-200 bg-blue-50';
    default:
      return 'border-gray-200 bg-gray-50';
  }
}

export function IterationCard({ iteration }: IterationCardProps) {
  const duration = iteration.completed_at
    ? new Date(iteration.completed_at).getTime() - new Date(iteration.started_at).getTime()
    : null;

  return (
    <div className={`rounded-lg border-2 ${getStatusColor(iteration.status)} p-4`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIcon(iteration.status)}
          <div>
            <h4 className="font-semibold text-gray-900">
              Iteration {iteration.iteration_number}
            </h4>
            <div className="text-xs text-gray-600 mt-0.5">
              Started {new Date(iteration.started_at).toLocaleString()}
            </div>
          </div>
        </div>
        {duration !== null && (
          <div className="text-xs text-gray-600">
            Duration: {(duration / 1000).toFixed(2)}s
          </div>
        )}
      </div>

      {/* Agent Actions */}
      {iteration.agent_actions && iteration.agent_actions.length > 0 && (
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-700 mb-2">Agent Actions:</div>
          <div className="space-y-1.5">
            {iteration.agent_actions.map((action, index) => (
              <div key={index} className="text-sm bg-white rounded px-3 py-2 border border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <span className="font-medium text-gray-700">{action.type}:</span>{' '}
                    <span className="text-gray-600">{action.description}</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                    {new Date(action.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Report */}
      {iteration.verification_report && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Verification Results:</div>
          <div className="flex flex-wrap gap-2">
            {iteration.verification_report.L0 && iteration.verification_report.L0.length > 0 && (
              <VerificationBadge
                level="L0"
                status={iteration.verification_report.L0[0].status}
              />
            )}
            {iteration.verification_report.L1 && iteration.verification_report.L1.length > 0 && (
              <VerificationBadge
                level="L1"
                status={iteration.verification_report.L1[0].status}
              />
            )}
            {iteration.verification_report.L2 && iteration.verification_report.L2.length > 0 && (
              <VerificationBadge
                level="L2"
                status={iteration.verification_report.L2[0].status}
              />
            )}
            {iteration.verification_report.L3 && iteration.verification_report.L3.length > 0 && (
              <VerificationBadge
                level="L3"
                status={iteration.verification_report.L3[0].status}
              />
            )}
          </div>
          <div className="text-xs text-gray-600 mt-2">
            Overall: {iteration.verification_report.overall_status} •{' '}
            {(iteration.verification_report.total_duration_ms / 1000).toFixed(2)}s
          </div>
        </div>
      )}

      {/* Error Message */}
      {iteration.error_message && (
        <div className="mt-3">
          <div className="text-sm font-medium text-red-700 mb-1">Error:</div>
          <div className="text-sm text-red-800 bg-red-100 rounded px-3 py-2 border border-red-200 font-mono">
            {iteration.error_message}
          </div>
        </div>
      )}
    </div>
  );
}
