import { PlayCircle } from 'lucide-react';
import { useRuns } from '../hooks';
import { LoadingSpinner, ErrorDisplay, EmptyState } from '../components/common';
import { RunCard } from '../components/runs';

export function Runs() {
  const { data, isLoading, error, refetch } = useRuns();

  if (isLoading) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Runs</h1>
        <LoadingSpinner message="Loading runs..." />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Runs</h1>
        <ErrorDisplay
          title="Failed to load runs"
          message={error instanceof Error ? error.message : 'An unknown error occurred'}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const runs = data?.runs || [];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Runs</h1>
      {runs.length === 0 ? (
        <EmptyState
          icon={PlayCircle}
          title="No runs yet"
          description="Runs will appear here when work orders are executed"
        />
      ) : (
        <div className="space-y-4">
          {runs.map((run) => (
            <RunCard
              key={run.id}
              run={run}
            />
          ))}
        </div>
      )}
    </div>
  );
}
