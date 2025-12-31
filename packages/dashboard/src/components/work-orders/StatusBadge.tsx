import { WorkOrderStatus } from '../../types/work-order';

interface StatusBadgeProps {
  status: WorkOrderStatus;
  className?: string;
}

const statusConfig: Record<
  WorkOrderStatus,
  { label: string; className: string }
> = {
  queued: {
    label: 'Queued',
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  running: {
    label: 'Running',
    className: 'bg-blue-100 text-blue-700 border-blue-300',
  },
  succeeded: {
    label: 'Succeeded',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-700 border-red-300',
  },
  canceled: {
    label: 'Canceled',
    className: 'bg-orange-100 text-orange-700 border-orange-300',
  },
};

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}
