import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  WorkOrderHeader,
  WorkOrderInfo,
  WorkOrderTimeline,
} from '../components/work-orders';
import { useWorkOrder, useRuns, useCancelWorkOrder } from '../hooks';
import { LoadingSpinner, ErrorDisplay } from '../components/common';

export function WorkOrderDetail() {
  const { id } = useParams<{ id: string }>();

  // Fetch work order from API
  const { data: workOrder, isLoading, error } = useWorkOrder(id);

  // Fetch runs for this work order
  const { data: runsData } = useRuns({ work_order_id: id });

  // Cancel work order mutation
  const cancelWorkOrderMutation = useCancelWorkOrder();

  // Handle cancel action
  const handleCancel = async () => {
    if (!id) return;

    try {
      await cancelWorkOrderMutation.mutateAsync(id);
    } catch (error) {
      console.error('Failed to cancel work order:', error);
      alert('Failed to cancel work order. Please try again.');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div>
        <Link
          to="/work-orders"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Work Orders
        </Link>
        <LoadingSpinner message="Loading work order..." />
      </div>
    );
  }

  // Error state
  if (error || !workOrder) {
    return (
      <div>
        <Link
          to="/work-orders"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Work Orders
        </Link>
        <ErrorDisplay
          title={workOrder ? "Error loading work order" : "Work Order Not Found"}
          message={
            error
              ? (error instanceof Error ? error.message : 'An unknown error occurred')
              : `The work order with ID "${id}" could not be found.`
          }
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  const runs = runsData?.runs || [];

  return (
    <div className="space-y-6">
      <Link
        to="/work-orders"
        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Work Orders
      </Link>

      <WorkOrderHeader workOrder={workOrder} onCancel={handleCancel} />

      <WorkOrderInfo workOrder={workOrder} />

      <WorkOrderTimeline runs={runs} />
    </div>
  );
}
