import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { AuthToken } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.agentgate');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface StoredConfig {
  apiUrl?: string;
  token?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  userEmail?: string;
  userName?: string;
  userAvatar?: string;
}

export class AuthManager {
  private config: StoredConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this.config = JSON.parse(content) as StoredConfig;
      } else {
        this.config = {};
      }
    } catch {
      this.config = {};
    }
  }

  private saveConfig(): void {
    try {
      // Ensure directory exists
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      }

      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), {
        mode: 0o600,
      });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  getToken(): string | null {
    if (!this.config?.token) {
      return null;
    }

    // Check if token is expired
    if (this.config.tokenExpiresAt) {
      const expiresAt = new Date(this.config.tokenExpiresAt);
      if (expiresAt <= new Date()) {
        return null;
      }
    }

    return this.config.token;
  }

  setToken(authToken: AuthToken): void {
    this.config = {
      ...this.config,
      token: authToken.token,
      refreshToken: authToken.refreshToken,
      tokenExpiresAt: authToken.expiresAt.toISOString(),
      userEmail: authToken.user.email,
      userName: authToken.user.name,
      userAvatar: authToken.user.avatar,
    };
    this.saveConfig();
  }

  clearToken(): void {
    this.config = {
      apiUrl: this.config?.apiUrl,
    };
    this.saveConfig();
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  getUser(): { email: string; name?: string; avatar?: string } | null {
    if (!this.isAuthenticated()) {
      return null;
    }

    return {
      email: this.config?.userEmail || '',
      name: this.config?.userName,
      avatar: this.config?.userAvatar,
    };
  }

  getApiUrl(): string {
    return (
      this.config?.apiUrl ||
      process.env['AGENTGATE_API_URL'] ||
      'https://api.agentgate.dev'
    );
  }

  setApiUrl(url: string): void {
    this.config = {
      ...this.config,
      apiUrl: url,
    };
    this.saveConfig();
  }

  getRefreshToken(): string | null {
    return this.config?.refreshToken || null;
  }

  async refreshIfNeeded(): Promise<boolean> {
    if (!this.config?.tokenExpiresAt || !this.config.refreshToken) {
      return false;
    }

    const expiresAt = new Date(this.config.tokenExpiresAt);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    // Refresh if expiring within 5 minutes
    if (expiresAt.getTime() - now.getTime() > fiveMinutes) {
      return true; // Token is still valid
    }

    // TODO: Implement token refresh API call
    // For now, just return false to trigger re-login
    return false;
  }
}

// Singleton instance
let authManagerInstance: AuthManager | null = null;

export function getAuthManager(): AuthManager {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}

export function resetAuthManager(): void {
  authManagerInstance = null;
}
