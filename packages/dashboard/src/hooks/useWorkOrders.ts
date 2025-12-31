/**
 * React Query hook for listing work orders
 */

import { useQuery } from '@tanstack/react-query';
import { listWorkOrders, ListWorkOrdersParams } from '../api/work-orders';

export function useWorkOrders(params?: ListWorkOrdersParams) {
  return useQuery({
    queryKey: ['work-orders', params],
    queryFn: () => listWorkOrders(params),
  });
}
