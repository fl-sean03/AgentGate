/**
 * Types for Claude subscription credentials and detection.
 */

/**
 * Subscription types available for Claude
 */
export type SubscriptionType = 'free' | 'pro' | 'max';

/**
 * OAuth credentials stored by Claude Code
 */
export interface ClaudeOAuthCredentials {
  /** OAuth access token */
  accessToken: string;
  /** OAuth refresh token */
  refreshToken: string;
  /** Token expiration timestamp (ms since epoch) */
  expiresAt: number;
  /** OAuth scopes granted */
  scopes: string[];
  /** User's subscription type */
  subscriptionType: SubscriptionType;
  /** Rate limit tier */
  rateLimitTier: string;
}

/**
 * Full credentials file structure
 */
export interface ClaudeCredentials {
  /** OAuth credentials for Claude.ai */
  claudeAiOauth?: ClaudeOAuthCredentials;
}

/**
 * Result of subscription detection
 */
export interface SubscriptionStatus {
  /** Whether valid subscription credentials were found */
  available: boolean;
  /** Path to credentials file (if found) */
  credentialsPath: string | null;
  /** Subscription type (if available) */
  subscriptionType: SubscriptionType | null;
  /** Rate limit tier (if available) */
  rateLimitTier: string | null;
  /** Whether token is expired */
  isExpired: boolean;
  /** Token expiration date (if available) */
  expiresAt: Date | null;
  /** Error message if not available */
  error: string | null;
}

/**
 * Subscription validation result
 */
export interface SubscriptionValidation {
  /** Whether subscription is valid for use */
  valid: boolean;
  /** Subscription details if valid */
  subscription: ClaudeOAuthCredentials | null;
  /** Error message if invalid */
  error: string | null;
}
