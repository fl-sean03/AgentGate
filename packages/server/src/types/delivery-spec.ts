/**
 * Delivery Spec Types (v0.2.24)
 *
 * Defines how results are delivered: git operations, PR creation, notifications.
 *
 * @module types/delivery-spec
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// GIT SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Git operation mode
 */
export type GitModeType = 'local' | 'push' | 'github-pr';

/**
 * Git specification
 */
export interface GitSpec {
  /** Git operation mode */
  mode: GitModeType;
  /** Branch name prefix (default: 'agentgate/') */
  branchPrefix?: string;
  /** Override full branch name */
  branchName?: string;
  /** Commit message prefix (default: '[AgentGate]') */
  commitPrefix?: string;
  /** Template for commit message */
  commitTemplate?: string;
  /** Auto-commit changes (default: true) */
  autoCommit?: boolean;
  /** Auto-push changes (default: false) */
  autoPush?: boolean;
  /** Sign commits with GPG */
  signCommits?: boolean;
}

export const gitSpecSchema = z.object({
  mode: z.enum(['local', 'push', 'github-pr']),
  branchPrefix: z.string().optional(),
  branchName: z.string().optional(),
  commitPrefix: z.string().optional(),
  commitTemplate: z.string().optional(),
  autoCommit: z.boolean().optional(),
  autoPush: z.boolean().optional(),
  signCommits: z.boolean().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// PR SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-merge configuration
 */
export interface AutoMergeSpec {
  /** Enable auto-merge */
  enabled: boolean;
  /** Merge method */
  method?: 'merge' | 'squash' | 'rebase';
  /** Wait for checks before merging */
  waitForChecks?: boolean;
  /** Delete branch after merge */
  deleteOnMerge?: boolean;
}

export const autoMergeSpecSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(['merge', 'squash', 'rebase']).optional(),
  waitForChecks: z.boolean().optional(),
  deleteOnMerge: z.boolean().optional(),
});

/**
 * Pull request specification
 */
export interface PRSpec {
  /** Whether to create a PR */
  create: boolean;
  /** Create as draft PR */
  draft?: boolean;
  /** PR title (template with {task}, {date}) */
  title?: string;
  /** PR body (template) */
  body?: string;
  /** Labels to add */
  labels?: string[];
  /** Reviewers to request */
  reviewers?: string[];
  /** Assignees to add */
  assignees?: string[];
  /** Auto-merge configuration */
  autoMerge?: AutoMergeSpec;
  /** Base branch for the PR */
  base?: string;
}

export const prSpecSchema = z.object({
  create: z.boolean(),
  draft: z.boolean().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  reviewers: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  autoMerge: autoMergeSpecSchema.optional(),
  base: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Slack notification
 */
export interface SlackNotification {
  type: 'slack';
  /** Webhook URL */
  webhook: string;
  /** Channel to post to */
  channel?: string;
  /** Message template */
  template?: string;
}

/**
 * Webhook notification
 */
export interface WebhookNotification {
  type: 'webhook';
  /** Webhook URL */
  url: string;
  /** HTTP method */
  method?: 'POST' | 'PUT';
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * Email notification
 */
export interface EmailNotification {
  type: 'email';
  /** Recipients */
  to: string[];
  /** Email subject template */
  subject?: string;
  /** Email body template */
  template?: string;
}

/**
 * Union of all notification types
 */
export type NotificationConfig =
  | SlackNotification
  | WebhookNotification
  | EmailNotification;

export const slackNotificationSchema = z.object({
  type: z.literal('slack'),
  webhook: z.string().url(),
  channel: z.string().optional(),
  template: z.string().optional(),
});

export const webhookNotificationSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT']).optional(),
  headers: z.record(z.string()).optional(),
});

export const emailNotificationSchema = z.object({
  type: z.literal('email'),
  to: z.array(z.string().email()).min(1),
  subject: z.string().optional(),
  template: z.string().optional(),
});

export const notificationConfigSchema = z.discriminatedUnion('type', [
  slackNotificationSchema,
  webhookNotificationSchema,
  emailNotificationSchema,
]);

/**
 * Notification specification
 */
export interface NotificationSpec {
  /** Notifications on success */
  onSuccess?: NotificationConfig[];
  /** Notifications on failure */
  onFailure?: NotificationConfig[];
}

export const notificationSpecSchema = z.object({
  onSuccess: z.array(notificationConfigSchema).optional(),
  onFailure: z.array(notificationConfigSchema).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete delivery specification
 */
export interface DeliverySpec {
  /** Git configuration */
  git: GitSpec;
  /** PR configuration */
  pr?: PRSpec;
  /** Notification configuration */
  notifications?: NotificationSpec;
}

export const deliverySpecSchema = z.object({
  git: gitSpecSchema,
  pr: prSpecSchema.optional(),
  notifications: notificationSpecSchema.optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY RESULTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result from a commit operation
 */
export interface CommitResult {
  success: boolean;
  sha?: string;
  filesCommitted: string[];
  error?: string;
}

/**
 * Result from a push operation
 */
export interface PushResultType {
  success: boolean;
  remote?: string;
  branch?: string;
  error?: string;
}

/**
 * Result from a PR creation
 */
export interface PRResult {
  success: boolean;
  prNumber?: number;
  url?: string;
  error?: string;
}

/**
 * Result from a notification
 */
export interface NotificationResult {
  type: string;
  success: boolean;
  error?: string;
}

/**
 * Complete delivery result
 */
export interface DeliveryResult {
  success: boolean;
  mode: GitModeType;
  commit?: CommitResult;
  push?: PushResultType;
  pr?: PRResult;
  notifications?: NotificationResult[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

export function isSlackNotification(
  config: NotificationConfig
): config is SlackNotification {
  return config.type === 'slack';
}

export function isWebhookNotification(
  config: NotificationConfig
): config is WebhookNotification {
  return config.type === 'webhook';
}

export function isEmailNotification(
  config: NotificationConfig
): config is EmailNotification {
  return config.type === 'email';
}
