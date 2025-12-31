import { Clock, GitBranch, FolderOpen, Archive } from 'lucide-react';
import { WorkOrder } from '../../types/work-order';
import { StatusBadge } from './StatusBadge';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  onClick?: () => void;
}

export function WorkOrderCard({ workOrder, onClick }: WorkOrderCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  };

  const getWorkspaceIcon = () => {
    switch (workOrder.workspace_source.type) {
      case 'git':
        return <GitBranch className="w-4 h-4" />;
      case 'local':
        return <FolderOpen className="w-4 h-4" />;
      case 'archive':
        return <Archive className="w-4 h-4" />;
    }
  };

  const getWorkspaceLabel = () => {
    const source = workOrder.workspace_source;
    switch (source.type) {
      case 'git':
        return source.url ? `${source.url}${source.branch ? `@${source.branch}` : ''}` : 'Git Repository';
      case 'local':
        return source.path || 'Local Workspace';
      case 'archive':
        return source.path || 'Archive';
    }
  };

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow ${
        onClick ? 'cursor-pointer' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <StatusBadge status={workOrder.status} />
        <div className="flex items-center text-xs text-gray-500">
          <Clock className="w-3 h-3 mr-1" />
          {formatDate(workOrder.created_at)}
        </div>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-900 line-clamp-2">{workOrder.prompt}</p>
      </div>

      <div className="flex items-center text-xs text-gray-600">
        {getWorkspaceIcon()}
        <span className="ml-1 truncate">{getWorkspaceLabel()}</span>
      </div>

      {workOrder.error_message && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-red-600 line-clamp-2">
            {workOrder.error_message}
          </p>
        </div>
      )}
    </div>
  );
}
