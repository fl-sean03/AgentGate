import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRun } from '../hooks';
import { LoadingSpinner, ErrorDisplay } from '../components/common';
import { VerificationBadge } from '../components/runs';

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading, error, refetch } = useRun(id);

  if (isLoading) {
    return (
      <div>
        <Link
          to="/runs"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Runs
        </Link>
        <LoadingSpinner message="Loading run..." />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div>
        <Link
          to="/runs"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Runs
        </Link>
        <ErrorDisplay
          title={run ? "Error loading run" : "Run Not Found"}
          message={
            error
              ? (error instanceof Error ? error.message : 'An unknown error occurred')
              : `The run with ID "${id}" could not be found.`
          }
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/runs"
        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Runs
      </Link>
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <h1 className="text-3xl font-bold text-gray-900">Run Details</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${
            run.status === 'succeeded' ? 'bg-green-100 text-green-800' :
            run.status === 'failed' ? 'bg-red-100 text-red-800' :
            run.status === 'running' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {run.status}
          </span>
        </div>
        <p className="text-sm text-gray-500 font-mono">{run.id}</p>
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Work Order</label>
            <Link
              to={`/work-orders/${run.work_order_id}`}
              className="text-blue-600 hover:text-blue-700 mt-1 font-mono text-sm block"
            >
              {run.work_order_id}
            </Link>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Total Iterations</label>
            <p className="text-gray-900 mt-1">{run.total_iterations}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Started</label>
            <p className="text-gray-900 mt-1">
              {new Date(run.started_at).toLocaleString()}
            </p>
          </div>
          {run.completed_at && (
            <div>
              <label className="text-sm font-medium text-gray-700">Completed</label>
              <p className="text-gray-900 mt-1">
                {new Date(run.completed_at).toLocaleString()}
              </p>
            </div>
          )}
          {run.final_verification && (
            <div>
              <label className="text-sm font-medium text-gray-700">Final Verification</label>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Overall Status:</span>
                  <span className={`text-sm font-semibold capitalize ${
                    run.final_verification.overall_status === 'passed' ? 'text-green-700' :
                    run.final_verification.overall_status === 'failed' ? 'text-red-700' :
                    'text-gray-700'
                  }`}>
                    {run.final_verification.overall_status}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  Duration: {(run.final_verification.total_duration_ms / 1000).toFixed(2)}s
                </div>
                {run.final_verification.L0 && run.final_verification.L0.length > 0 && (
                  <div className="mt-2">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">L0 Tests</h4>
                    <div className="space-y-1">
                      {run.final_verification.L0.map((result, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <VerificationBadge level={result.level} status={result.status} />
                          {result.test_name && (
                            <span className="text-sm text-gray-600">{result.test_name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {run.error_message && (
            <div>
              <label className="text-sm font-medium text-gray-700">Error Message</label>
              <pre className="bg-red-50 text-red-900 p-4 rounded mt-2 font-mono text-xs overflow-x-auto border border-red-200">
                {run.error_message}
              </pre>
            </div>
          )}
          {run.iterations.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">Iterations</label>
              <div className="mt-2 space-y-2">
                {run.iterations.map((iteration) => (
                  <div key={iteration.id} className="bg-gray-50 p-3 rounded border border-gray-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        Iteration #{iteration.iteration_number}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded capitalize ${
                        iteration.status === 'succeeded' ? 'bg-green-100 text-green-800' :
                        iteration.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {iteration.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
