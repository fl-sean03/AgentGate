import { useState, useEffect, useCallback, useMemo } from 'react';
import { getApiClient } from '../api/client.js';
import { useAppStore } from '../store/app.js';
import type { Repository } from '../api/types.js';

interface UseReposResult {
  repos: Repository[];
  filteredRepos: Repository[];
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  refetch: () => Promise<void>;
}

export function useRepos(): UseReposResult {
  const { repos, setRepos, reposLoaded, setReposLoaded } = useAppStore();
  const [isLoading, setIsLoading] = useState(!reposLoaded);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchRepos = useCallback(async (force = false) => {
    if (reposLoaded && !force) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = getApiClient();
      const fetchedRepos = await client.getRepos();

      // Sort by pushedAt descending
      fetchedRepos.sort(
        (a, b) => b.pushedAt.getTime() - a.pushedAt.getTime()
      );

      setRepos(fetchedRepos);
      setReposLoaded(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch repositories'
      );
    } finally {
      setIsLoading(false);
    }
  }, [reposLoaded, setRepos, setReposLoaded]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const refetch = useCallback(async () => {
    await fetchRepos(true);
  }, [fetchRepos]);

  const filteredRepos = useMemo(() => {
    if (!searchTerm) {
      return repos;
    }

    const term = searchTerm.toLowerCase();
    return repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(term) ||
        (repo.description?.toLowerCase().includes(term) ?? false)
    );
  }, [repos, searchTerm]);

  return {
    repos,
    filteredRepos,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    refetch,
  };
}
