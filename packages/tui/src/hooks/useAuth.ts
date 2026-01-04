import { useCallback } from 'react';

/**
 * Authentication hook for TUI
 *
 * In self-hosted mode (OSS), authentication is always granted.
 * Users connect directly to their local server without login.
 */

interface UseAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: { email: string; name?: string; avatar?: string } | null;
  startAuth: () => Promise<void>;
  logout: () => void;
}

export function useAuth(_apiUrl?: string, _token?: string): UseAuthResult {
  // In self-hosted mode, user is always authenticated
  // No login required - uses local config and API keys

  const startAuth = useCallback(async () => {
    // No-op in self-hosted mode
  }, []);

  const logout = useCallback(() => {
    // No-op in self-hosted mode
  }, []);

  return {
    isAuthenticated: true, // Always authenticated in self-hosted mode
    isLoading: false,
    error: null,
    user: { email: 'local@agentgate.dev', name: 'Local User' },
    startAuth,
    logout,
  };
}
