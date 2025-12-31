/**
 * React Query mutation hook for creating work orders
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkOrder, CreateWorkOrderRequest } from '../api/work-orders';

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateWorkOrderRequest) => createWorkOrder(request),
    onSuccess: () => {
      // Invalidate work orders list to refetch with new data
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
  });
}
