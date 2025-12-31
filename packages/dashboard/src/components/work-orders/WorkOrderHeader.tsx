import { WorkOrder } from '../../types/work-order';
import { StatusBadge } from './StatusBadge';
import { XCircle } from 'lucide-react';
import { Button } from '../Button';

interface WorkOrderHeaderProps {
  workOrder: WorkOrder;
  onCancel?: () => void;
}

export function WorkOrderHeader({ workOrder, onCancel }: WorkOrderHeaderProps) {
  const canCancel = workOrder.status === 'queued' || workOrder.status === 'running';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Work Order #{workOrder.id}
            </h1>
            <StatusBadge status={workOrder.status} />
          </div>
          <div className="text-sm text-gray-600">
            Created {new Date(workOrder.created_at).toLocaleString()}
          </div>
        </div>
        {canCancel && onCancel && (
          <Button
            variant="secondary"
            onClick={onCancel}
            className="flex items-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
