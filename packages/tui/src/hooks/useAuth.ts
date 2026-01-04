import { useState, useEffect, useCallback } from 'react';
import open from 'open';
import { getAuthManager, AuthManager } from '../api/auth.js';
import { getApiClient } from '../api/client.js';
import type { AuthToken } from '../api/types.js';

interface UseAuthResult {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: { email: string; name?: string; avatar?: string } | null;
  startAuth: () => Promise<void>;
  logout: () => void;
}

export function useAuth(apiUrl?: string, token?: string): UseAuthResult {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<{
    email: string;
    name?: string;
    avatar?: string;
  } | null>(null);

  const authManager = getAuthManager();

  // Check initial auth state
  useEffect(() => {
    if (token) {
      // Token provided via CLI
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    if (apiUrl) {
      authManager.setApiUrl(apiUrl);
    }

    const isAuth = authManager.isAuthenticated();
    setIsAuthenticated(isAuth);
    if (isAuth) {
      setUser(authManager.getUser());
    }
    setIsLoading(false);
  }, [apiUrl, token, authManager]);

  const startAuth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getApiClient(apiUrl, token);

      // Initiate device auth flow
      const deviceAuth = await client.initiateDeviceAuth();

      // Open browser to verification URL
      try {
        await open(deviceAuth.verificationUrl);
      } catch {
        // If browser fails to open, user will need to manually visit the URL
        console.log(
          `Please visit: ${deviceAuth.verificationUrl}\nCode: ${deviceAuth.userCode}`
        );
      }

      // Poll for completion
      const startTime = Date.now();
      const timeout = deviceAuth.expiresIn * 1000;
      const interval = (deviceAuth.interval || 5) * 1000;

      while (Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, interval));

        const result = await client.pollDeviceAuth(deviceAuth.deviceCode);
        if (result) {
          // Auth completed
          authManager.setToken(result);
          setIsAuthenticated(true);
          setUser({
            email: result.user.email,
            name: result.user.name,
            avatar: result.user.avatar,
          });
          setIsLoading(false);
          return;
        }
      }

      throw new Error('Authentication timed out');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  }, [apiUrl, token, authManager]);

  const logout = useCallback(() => {
    authManager.clearToken();
    setIsAuthenticated(false);
    setUser(null);
  }, [authManager]);

  return {
    isAuthenticated,
    isLoading,
    error,
    user,
    startAuth,
    logout,
  };
}
