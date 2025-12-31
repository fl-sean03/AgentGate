import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle, XCircle, FileText, TrendingUp } from 'lucide-react';
import { useWorkOrders } from '../hooks';
import { LoadingSpinner, ErrorDisplay } from '../components/common';
import { StatusBadge } from '../components/work-orders';
import type { WorkOrder } from '../types/work-order';

export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useWorkOrders();

  if (isLoading) {
    return <LoadingSpinner message="Loading dashboard..." />;
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load dashboard"
        message={error instanceof Error ? error.message : 'An unknown error occurred'}
        onRetry={() => refetch()}
      />
    );
  }

  const workOrders = data?.work_orders || [];

  const stats = {
    total: workOrders.length,
    running: workOrders.filter(wo => wo.status === 'running').length,
    succeeded: workOrders.filter(wo => wo.status === 'succeeded').length,
    failed: workOrders.filter(wo => wo.status === 'failed').length,
  };

  const recentWorkOrders = [...workOrders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const handleWorkOrderClick = (id: string) => {
    navigate(`/work-orders/${id}`);
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={FileText}
          title="Total Work Orders"
          value={stats.total}
          color="blue"
        />
        <StatCard
          icon={Clock}
          title="Running"
          value={stats.running}
          color="yellow"
        />
        <StatCard
          icon={CheckCircle}
          title="Succeeded"
          value={stats.succeeded}
          color="green"
        />
        <StatCard
          icon={XCircle}
          title="Failed"
          value={stats.failed}
          color="red"
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Recent Work Orders</h2>
          </div>
          {workOrders.length > 0 && (
            <button
              onClick={() => navigate('/work-orders')}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all
            </button>
          )}
        </div>
        {recentWorkOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-500 mb-4">No work orders yet</p>
            <button
              onClick={() => navigate('/work-orders')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create your first work order
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {recentWorkOrders.map((workOrder) => (
              <WorkOrderRow
                key={workOrder.id}
                workOrder={workOrder}
                onClick={() => handleWorkOrderClick(workOrder.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: number;
  color: 'blue' | 'yellow' | 'green' | 'red';
}

function StatCard({ icon: Icon, title, value, color }: StatCardProps) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    green: 'text-green-600 bg-green-50',
    red: 'text-red-600 bg-red-50',
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-sm font-medium text-gray-600">{title}</h2>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

interface WorkOrderRowProps {
  workOrder: WorkOrder;
  onClick: () => void;
}

function WorkOrderRow({ workOrder, onClick }: WorkOrderRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full px-6 py-4 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <StatusBadge status={workOrder.status} />
            <span className="text-xs text-gray-500 font-mono">{workOrder.id}</span>
          </div>
          <p className="text-sm text-gray-900 truncate">{workOrder.prompt}</p>
        </div>
        <div className="flex-shrink-0 text-xs text-gray-500">
          {new Date(workOrder.created_at).toLocaleDateString()}
        </div>
      </div>
    </button>
  );
}
