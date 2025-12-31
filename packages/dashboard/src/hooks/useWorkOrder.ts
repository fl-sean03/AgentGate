/**
 * React Query hook for fetching a single work order
 */

import { useQuery } from '@tanstack/react-query';
import { getWorkOrder } from '../api/work-orders';

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => {
      if (!id) {
        throw new Error('Work order ID is required');
      }
      return getWorkOrder(id);
    },
    enabled: !!id,
  });
}
