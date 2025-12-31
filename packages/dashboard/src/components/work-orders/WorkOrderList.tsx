import { Grid, List, FileQuestion } from 'lucide-react';
import { useState } from 'react';
import { WorkOrder } from '../../types/work-order';
import { WorkOrderCard } from './WorkOrderCard';

interface WorkOrderListProps {
  workOrders: WorkOrder[];
  onWorkOrderClick?: (workOrder: WorkOrder) => void;
}

type ViewMode = 'grid' | 'list';

export function WorkOrderList({
  workOrders,
  onWorkOrderClick,
}: WorkOrderListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  if (workOrders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileQuestion className="w-16 h-16 text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No work orders found
        </h3>
        <p className="text-gray-500">
          Try adjusting your filters or create a new work order to get started.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded ${
              viewMode === 'grid'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-label="Grid view"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded ${
              viewMode === 'list'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-label="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-4'
        }
      >
        {workOrders.map((workOrder) => (
          <WorkOrderCard
            key={workOrder.id}
            workOrder={workOrder}
            onClick={
              onWorkOrderClick ? () => onWorkOrderClick(workOrder) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
