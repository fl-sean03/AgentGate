/**
 * React Query hook for listing runs
 */

import { useQuery } from '@tanstack/react-query';
import { listRuns, ListRunsParams } from '../api/runs';

export function useRuns(params?: ListRunsParams) {
  return useQuery({
    queryKey: ['runs', params],
    queryFn: () => listRuns(params),
  });
}
