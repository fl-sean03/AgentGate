import { Search } from 'lucide-react';
import { WorkOrderStatus } from '../../types/work-order';

interface WorkOrderFiltersProps {
  selectedStatus?: WorkOrderStatus;
  searchQuery: string;
  onStatusChange: (status?: WorkOrderStatus) => void;
  onSearchChange: (query: string) => void;
}

const statusOptions: Array<{ value: WorkOrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'canceled', label: 'Canceled' },
];

export function WorkOrderFilters({
  selectedStatus,
  searchQuery,
  onStatusChange,
  onSearchChange,
}: WorkOrderFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search work orders..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {statusOptions.map((option) => {
          const isActive =
            option.value === 'all'
              ? !selectedStatus
              : selectedStatus === option.value;

          return (
            <button
              key={option.value}
              onClick={() =>
                onStatusChange(option.value === 'all' ? undefined : option.value)
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
