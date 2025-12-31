import { Plus, Inbox } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  WorkOrderFilters,
  WorkOrderList,
} from '../components/work-orders';
import { WorkOrderStatus } from '../types/work-order';
import { Modal, LoadingSpinner, ErrorDisplay, EmptyState } from '../components/common';
import { WorkOrderForm } from '../components/forms';
import { useWorkOrders, useCreateWorkOrder } from '../hooks';
import type { CreateWorkOrderRequest } from '../api/work-orders';

export function WorkOrders() {
  const navigate = useNavigate();
  const [selectedStatus, setSelectedStatus] = useState<
    WorkOrderStatus | undefined
  >(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Fetch work orders from API
  const { data, isLoading, error } = useWorkOrders({
    status: selectedStatus,
  });

  // Create work order mutation
  const createWorkOrderMutation = useCreateWorkOrder();

  const filteredWorkOrders = useMemo(() => {
    if (!data?.work_orders) return [];

    let filtered = [...data.work_orders];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (wo) =>
          wo.prompt.toLowerCase().includes(query) ||
          wo.id.toLowerCase().includes(query) ||
          wo.workspace_source.url?.toLowerCase().includes(query) ||
          wo.workspace_source.path?.toLowerCase().includes(query)
      );
    }

    filtered.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return filtered;
  }, [data, searchQuery]);

  const handleWorkOrderClick = (workOrderId: string) => {
    navigate(`/work-orders/${workOrderId}`);
  };

  const handleFormSubmit = async (formData: {
    prompt: string;
    workspaceSourceType: 'local' | 'github' | 'github-new';
    sourcePath?: string;
    sourceUrl?: string;
    sourceBranch?: string;
    agentType: string;
    maxIterations: number;
    maxTime: number;
  }) => {
    try {
      // Map form data to API request
      const request: CreateWorkOrderRequest = {
        prompt: formData.prompt,
        workspace_source: {
          type: formData.workspaceSourceType === 'local' ? 'local' : 'git',
          url: formData.sourceUrl,
          branch: formData.sourceBranch,
          path: formData.sourcePath,
        },
        max_iterations: formData.maxIterations,
        max_time: formData.maxTime,
      };

      await createWorkOrderMutation.mutateAsync(request);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Failed to submit work order:', error);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Work Orders</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Work Order
        </button>
      </div>

      <WorkOrderFilters
        selectedStatus={selectedStatus}
        searchQuery={searchQuery}
        onStatusChange={setSelectedStatus}
        onSearchChange={setSearchQuery}
      />

      {isLoading ? (
        <LoadingSpinner message="Loading work orders..." />
      ) : error ? (
        <ErrorDisplay
          title="Failed to load work orders"
          message={error instanceof Error ? error.message : 'An unknown error occurred'}
          onRetry={() => window.location.reload()}
        />
      ) : filteredWorkOrders.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No work orders found"
          description={
            searchQuery || selectedStatus
              ? "Try adjusting your filters to see more results"
              : "Get started by creating your first work order"
          }
          action={
            !searchQuery && !selectedStatus ? (
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create Work Order
              </button>
            ) : undefined
          }
        />
      ) : (
        <WorkOrderList
          workOrders={filteredWorkOrders}
          onWorkOrderClick={(workOrder) => handleWorkOrderClick(workOrder.id)}
        />
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Work Order"
        size="xl"
      >
        <WorkOrderForm
          onSubmit={handleFormSubmit}
          onCancel={() => setIsModalOpen(false)}
          isSubmitting={createWorkOrderMutation.isPending}
        />
      </Modal>
    </div>
  );
}
