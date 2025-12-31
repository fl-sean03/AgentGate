/**
 * Subscription detector for Claude Code.
 * Detects and validates Claude subscription credentials from ~/.claude/.credentials.json
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type {
  ClaudeCredentials,
  ClaudeOAuthCredentials,
  SubscriptionStatus,
  SubscriptionType,
  SubscriptionValidation,
} from '../types/subscription.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('subscription-detector');

/**
 * Default credentials file path
 */
const CREDENTIALS_FILENAME = '.credentials.json';
const CLAUDE_DIR = '.claude';

/**
 * Get the path to Claude credentials file
 */
export function getCredentialsPath(): string {
  return join(homedir(), CLAUDE_DIR, CREDENTIALS_FILENAME);
}

/**
 * Check if credentials file exists
 */
export function credentialsExist(): boolean {
  const path = getCredentialsPath();
  return existsSync(path);
}

/**
 * Type guard for ClaudeOAuthCredentials
 */
function isClaudeOAuthCredentials(value: unknown): value is ClaudeOAuthCredentials {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.accessToken === 'string' &&
    typeof obj.refreshToken === 'string' &&
    typeof obj.expiresAt === 'number' &&
    Array.isArray(obj.scopes) &&
    typeof obj.subscriptionType === 'string' &&
    typeof obj.rateLimitTier === 'string'
  );
}

/**
 * Type guard for ClaudeCredentials
 */
function isClaudeCredentials(value: unknown): value is ClaudeCredentials {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // claudeAiOauth is optional but must be valid if present
  if (obj.claudeAiOauth !== undefined) {
    return isClaudeOAuthCredentials(obj.claudeAiOauth);
  }

  return true;
}

/**
 * Parse credentials file
 */
export async function parseCredentials(path: string): Promise<ClaudeCredentials | null> {
  try {
    const content = await readFile(path, 'utf-8');
    const parsed: unknown = JSON.parse(content);

    if (!isClaudeCredentials(parsed)) {
      logger.warn({ path }, 'Credentials file has invalid structure');
      return null;
    }

    return parsed;
  } catch (error) {
    logger.debug({ error, path }, 'Failed to parse credentials file');
    return null;
  }
}

/**
 * Check if OAuth token is expired
 */
export function isTokenExpired(credentials: ClaudeOAuthCredentials): boolean {
  // Add 5 minute buffer before expiration
  const bufferMs = 5 * 60 * 1000;
  return Date.now() > credentials.expiresAt - bufferMs;
}

/**
 * Check if subscription type is valid for use (pro or max)
 */
export function isValidSubscriptionType(type: SubscriptionType): boolean {
  return type === 'pro' || type === 'max';
}

/**
 * Validate subscription credentials
 */
export function validateSubscription(
  credentials: ClaudeOAuthCredentials
): SubscriptionValidation {
  // Check if token is expired
  if (isTokenExpired(credentials)) {
    return {
      valid: false,
      subscription: null,
      error: 'Subscription token has expired. Run "claude login" to refresh.',
    };
  }

  // Check subscription type
  if (!isValidSubscriptionType(credentials.subscriptionType)) {
    return {
      valid: false,
      subscription: null,
      error: `No active subscription (type: ${credentials.subscriptionType}). Claude Pro or Max required.`,
    };
  }

  return {
    valid: true,
    subscription: credentials,
    error: null,
  };
}

/**
 * Detect subscription status
 * Main entry point for subscription detection
 */
export async function detectSubscription(): Promise<SubscriptionStatus> {
  const credentialsPath = getCredentialsPath();

  // Check if credentials file exists
  if (!credentialsExist()) {
    logger.debug({ path: credentialsPath }, 'Credentials file not found');
    return {
      available: false,
      credentialsPath: null,
      subscriptionType: null,
      rateLimitTier: null,
      isExpired: false,
      expiresAt: null,
      error: 'Claude credentials not found. Run "claude login" to authenticate.',
    };
  }

  // Parse credentials
  const credentials = await parseCredentials(credentialsPath);
  if (!credentials) {
    return {
      available: false,
      credentialsPath,
      subscriptionType: null,
      rateLimitTier: null,
      isExpired: false,
      expiresAt: null,
      error: 'Failed to parse Claude credentials file.',
    };
  }

  // Check for OAuth credentials
  if (!credentials.claudeAiOauth) {
    return {
      available: false,
      credentialsPath,
      subscriptionType: null,
      rateLimitTier: null,
      isExpired: false,
      expiresAt: null,
      error: 'No OAuth credentials found. Run "claude login" to authenticate.',
    };
  }

  const oauth = credentials.claudeAiOauth;
  const expired = isTokenExpired(oauth);
  const expiresAt = new Date(oauth.expiresAt);

  // Check if valid subscription
  if (!isValidSubscriptionType(oauth.subscriptionType)) {
    return {
      available: false,
      credentialsPath,
      subscriptionType: oauth.subscriptionType,
      rateLimitTier: oauth.rateLimitTier,
      isExpired: expired,
      expiresAt,
      error: `Free tier detected. Claude Pro or Max subscription required.`,
    };
  }

  // Check expiration
  if (expired) {
    return {
      available: false,
      credentialsPath,
      subscriptionType: oauth.subscriptionType,
      rateLimitTier: oauth.rateLimitTier,
      isExpired: true,
      expiresAt,
      error: 'Subscription token expired. Run "claude login" to refresh.',
    };
  }

  // All checks passed
  logger.info(
    {
      subscriptionType: oauth.subscriptionType,
      rateLimitTier: oauth.rateLimitTier,
      expiresAt: expiresAt.toISOString(),
    },
    'Valid subscription detected'
  );

  return {
    available: true,
    credentialsPath,
    subscriptionType: oauth.subscriptionType,
    rateLimitTier: oauth.rateLimitTier,
    isExpired: false,
    expiresAt,
    error: null,
  };
}

/**
 * Get subscription credentials if available
 * Returns null if not available or invalid
 */
export async function getSubscriptionCredentials(): Promise<ClaudeOAuthCredentials | null> {
  const credentialsPath = getCredentialsPath();

  if (!credentialsExist()) {
    return null;
  }

  const credentials = await parseCredentials(credentialsPath);
  if (!credentials?.claudeAiOauth) {
    return null;
  }

  const validation = validateSubscription(credentials.claudeAiOauth);
  if (!validation.valid) {
    return null;
  }

  return credentials.claudeAiOauth;
}
