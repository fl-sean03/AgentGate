/**
 * GitHub Module
 *
 * Provides GitHub API integration utilities.
 */

// Rate Limiter (v0.2.27 - Thrust 7: GitHub Rate Limit Handling)
export {
  GitHubRateLimiter,
  getGitHubRateLimiter,
  withRateLimit,
  type RateLimitInfo,
  type RateLimitState,
  type RateLimiterOptions,
} from './rate-limiter.js';
