/**
 * React Query mutation hook for canceling work orders
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cancelWorkOrder } from '../api/work-orders';

export function useCancelWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => cancelWorkOrder(id),
    onSuccess: (data) => {
      // Invalidate both the list and the specific work order
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders', data.id] });
    },
  });
}
