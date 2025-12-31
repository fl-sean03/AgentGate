import { Run } from '../../types/run';
import { RunCard } from '../runs/RunCard';

interface WorkOrderTimelineProps {
  runs: Run[];
}

export function WorkOrderTimeline({ runs }: WorkOrderTimelineProps) {
  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Run History</h2>
        <div className="text-center py-8 text-gray-500">
          No runs yet. This work order hasn't been executed.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Run History ({runs.length})
      </h2>
      <div className="space-y-4">
        {runs.map((run) => (
          <RunCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}
