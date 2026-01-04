import { useState, useEffect, useCallback } from 'react';
import { getApiClient } from '../api/client.js';
import { useAppStore } from '../store/app.js';
import type { Run } from '../api/types.js';

interface UseRunsResult {
  runs: Run[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

const PAGE_SIZE = 20;

export function useRuns(statusFilter?: string): UseRunsResult {
  const { runs, setRuns } = useAppStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const fetchRuns = useCallback(
    async (pageNum: number, append = false) => {
      setIsLoading(true);
      setError(null);

      try {
        const client = getApiClient();
        const response = await client.getRuns(pageNum, PAGE_SIZE, statusFilter);

        if (append) {
          setRuns([...runs, ...response.items]);
        } else {
          setRuns(response.items);
        }

        setHasMore(response.hasMore);
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch runs');
      } finally {
        setIsLoading(false);
      }
    },
    [runs, setRuns, statusFilter]
  );

  useEffect(() => {
    fetchRuns(1);
  }, [statusFilter]); // Refetch when filter changes

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) {
      return;
    }
    await fetchRuns(page + 1, true);
  }, [hasMore, isLoading, page, fetchRuns]);

  const refetch = useCallback(async () => {
    setPage(1);
    await fetchRuns(1);
  }, [fetchRuns]);

  return {
    runs,
    isLoading,
    error,
    hasMore,
    loadMore,
    refetch,
  };
}
