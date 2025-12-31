/**
 * React Query hook for fetching a single run
 */

import { useQuery } from '@tanstack/react-query';
import { getRun } from '../api/runs';

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ['runs', id],
    queryFn: () => {
      if (!id) {
        throw new Error('Run ID is required');
      }
      return getRun(id);
    },
    enabled: !!id,
  });
}
