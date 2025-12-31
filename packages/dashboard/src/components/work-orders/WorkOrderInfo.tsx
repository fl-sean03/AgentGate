import { WorkOrder } from '../../types/work-order';
import { GitBranch, Folder, Archive, Clock, CheckCircle, XCircle } from 'lucide-react';

interface WorkOrderInfoProps {
  workOrder: WorkOrder;
}

function WorkspaceSourceIcon({ type }: { type: string }) {
  switch (type) {
    case 'git':
      return <GitBranch className="w-5 h-5 text-gray-500" />;
    case 'local':
      return <Folder className="w-5 h-5 text-gray-500" />;
    case 'archive':
      return <Archive className="w-5 h-5 text-gray-500" />;
    default:
      return null;
  }
}

export function WorkOrderInfo({ workOrder }: WorkOrderInfoProps) {
  const { workspace_source } = workOrder;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 space-y-6">
        {/* Task Prompt */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Task Prompt</h2>
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <p className="text-gray-800 whitespace-pre-wrap">{workOrder.prompt}</p>
          </div>
        </div>

        {/* Workspace Source */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Workspace Source</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <WorkspaceSourceIcon type={workspace_source.type} />
              <div>
                <div className="text-sm font-medium text-gray-700">Type</div>
                <div className="text-sm text-gray-900 capitalize">{workspace_source.type}</div>
              </div>
            </div>

            {workspace_source.url && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Repository URL</div>
                <div className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                  {workspace_source.url}
                </div>
              </div>
            )}

            {workspace_source.branch && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Branch</div>
                <div className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                  {workspace_source.branch}
                </div>
              </div>
            )}

            {workspace_source.commit && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Commit</div>
                <div className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                  {workspace_source.commit}
                </div>
              </div>
            )}

            {workspace_source.path && (
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Path</div>
                <div className="text-sm text-gray-900 font-mono bg-gray-50 px-3 py-2 rounded border border-gray-200">
                  {workspace_source.path}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Timeline */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Timeline</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700 font-medium">Created:</span>
              <span className="text-gray-900">{new Date(workOrder.created_at).toLocaleString()}</span>
            </div>
            {workOrder.started_at && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-blue-400" />
                <span className="text-gray-700 font-medium">Started:</span>
                <span className="text-gray-900">{new Date(workOrder.started_at).toLocaleString()}</span>
              </div>
            )}
            {workOrder.completed_at && (
              <div className="flex items-center gap-3 text-sm">
                {workOrder.status === 'succeeded' ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-gray-700 font-medium">Completed:</span>
                <span className="text-gray-900">{new Date(workOrder.completed_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {workOrder.error_message && (
          <div>
            <h2 className="text-lg font-semibold text-red-900 mb-2">Error</h2>
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <p className="text-red-800 text-sm font-mono">{workOrder.error_message}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {workOrder.result && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Result</h2>
            <div className={`rounded-lg p-4 border ${workOrder.result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                {workOrder.result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={`font-medium ${workOrder.result.success ? 'text-green-900' : 'text-red-900'}`}>
                  {workOrder.result.success ? 'Success' : 'Failed'}
                </span>
              </div>
              {workOrder.result.message && (
                <p className={`text-sm ${workOrder.result.success ? 'text-green-800' : 'text-red-800'}`}>
                  {workOrder.result.message}
                </p>
              )}
              {workOrder.result.artifacts && workOrder.result.artifacts.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">Artifacts:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {workOrder.result.artifacts.map((artifact, index) => (
                      <li key={index} className="text-sm text-gray-800 font-mono">
                        {artifact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
