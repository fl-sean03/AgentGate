/**
 * Subscription Detector Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isTokenExpired,
  isValidSubscriptionType,
  validateSubscription,
} from '../src/agent/subscription-detector.js';
import type { ClaudeOAuthCredentials, SubscriptionType } from '../src/types/subscription.js';

describe('Subscription Detector', () => {
  describe('isTokenExpired', () => {
    it('should return false for valid future token', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000, // 1 hour from now
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
      };

      expect(isTokenExpired(credentials)).toBe(false);
    });

    it('should return true for expired token', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() - 3600000, // 1 hour ago
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
      };

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return true for token expiring within 5 minutes', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 60000, // 1 minute from now (within 5 min buffer)
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
      };

      expect(isTokenExpired(credentials)).toBe(true);
    });

    it('should return false for token expiring in more than 5 minutes', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 600000, // 10 minutes from now
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
      };

      expect(isTokenExpired(credentials)).toBe(false);
    });
  });

  describe('isValidSubscriptionType', () => {
    it('should return true for "pro"', () => {
      expect(isValidSubscriptionType('pro')).toBe(true);
    });

    it('should return true for "max"', () => {
      expect(isValidSubscriptionType('max')).toBe(true);
    });

    it('should return false for "free"', () => {
      expect(isValidSubscriptionType('free')).toBe(false);
    });
  });

  describe('validateSubscription', () => {
    it('should return valid for unexpired max subscription', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
      };

      const result = validateSubscription(credentials);
      expect(result.valid).toBe(true);
      expect(result.subscription).toEqual(credentials);
      expect(result.error).toBeNull();
    });

    it('should return valid for unexpired pro subscription', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        scopes: ['user:inference'],
        subscriptionType: 'pro',
        rateLimitTier: 'default_claude_pro',
      };

      const result = validateSubscription(credentials);
      expect(result.valid).toBe(true);
      expect(result.subscription).toEqual(credentials);
    });

    it('should return invalid for expired subscription', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() - 3600000, // expired
        scopes: ['user:inference'],
        subscriptionType: 'max',
        rateLimitTier: 'default_claude_max_20x',
      };

      const result = validateSubscription(credentials);
      expect(result.valid).toBe(false);
      expect(result.subscription).toBeNull();
      expect(result.error).toContain('expired');
    });

    it('should return invalid for free subscription', () => {
      const credentials: ClaudeOAuthCredentials = {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: Date.now() + 3600000,
        scopes: ['user:inference'],
        subscriptionType: 'free',
        rateLimitTier: 'default_free',
      };

      const result = validateSubscription(credentials);
      expect(result.valid).toBe(false);
      expect(result.subscription).toBeNull();
      expect(result.error).toContain('free');
    });
  });
});
