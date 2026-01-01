/**
 * Profile API Types
 *
 * Types and schemas for the Profile CRUD API endpoints.
 * v0.2.17 - Thrust 2
 *
 * @module server/types/profiles
 */

import { z } from 'zod';

/**
 * Profile list item summary
 */
export const profileSummarySchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  extends: z.string().nullable(),
  isBuiltIn: z.boolean(),
});

export type ProfileSummary = z.infer<typeof profileSummarySchema>;

/**
 * Full profile detail response
 */
export const profileDetailSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  extends: z.string().nullable(),
  isBuiltIn: z.boolean(),

  loopStrategy: z
    .object({
      mode: z.string(),
      maxIterations: z.number().optional(),
      // Hybrid-specific fields
      baseIterations: z.number().optional(),
      maxBonusIterations: z.number().optional(),
      progressThreshold: z.number().optional(),
      // Completion criteria
      completionCriteria: z.array(z.string()).optional(),
      completionDetection: z.array(z.string()).optional(),
      // Ralph-specific fields
      minIterations: z.number().optional(),
      convergenceThreshold: z.number().optional(),
      windowSize: z.number().optional(),
      // Progress tracking
      progressTracking: z.string().optional(),
    })
    .optional(),

  verification: z
    .object({
      skipLevels: z.array(z.string()).optional(),
      timeoutMs: z.number().optional(),
      cleanRoom: z.boolean().optional(),
      parallelTests: z.boolean().optional(),
      retryFlaky: z.boolean().optional(),
      maxRetries: z.number().optional(),
    })
    .optional(),

  gitOps: z
    .object({
      mode: z.string().optional(),
      branchPrefix: z.string().optional(),
      commitMessagePrefix: z.string().optional(),
      autoCommit: z.boolean().optional(),
      autoPush: z.boolean().optional(),
      createPR: z.boolean().optional(),
      prDraft: z.boolean().optional(),
      prReviewers: z.array(z.string()).optional(),
      prLabels: z.array(z.string()).optional(),
    })
    .optional(),

  executionLimits: z
    .object({
      maxWallClockSeconds: z.number().optional(),
      maxIterationSeconds: z.number().optional(),
      maxTotalTokens: z.number().optional(),
      maxIterationTokens: z.number().optional(),
      maxDiskMb: z.number().optional(),
      maxMemoryMb: z.number().optional(),
      maxConcurrentAgents: z.number().optional(),
    })
    .optional(),

  // Resolved view (if requested)
  resolved: z
    .object({
      inheritanceChain: z.array(z.string()),
      configHash: z.string(),
    })
    .optional(),
});

export type ProfileDetail = z.infer<typeof profileDetailSchema>;

/**
 * Create profile request body
 */
export const createProfileBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
      'Profile name must be lowercase alphanumeric with hyphens'
    ),
  description: z.string().max(256).optional(),
  extends: z.string().optional(),

  loopStrategy: z
    .object({
      mode: z.enum(['fixed', 'hybrid', 'ralph', 'custom']).optional(),
      maxIterations: z.number().int().min(1).max(100).optional(),
      baseIterations: z.number().int().min(1).max(100).optional(),
      maxBonusIterations: z.number().int().min(0).max(100).optional(),
      progressThreshold: z.number().min(0).max(1).optional(),
      completionCriteria: z.array(z.string()).optional(),
      completionDetection: z.array(z.string()).optional(),
      minIterations: z.number().int().min(1).max(100).optional(),
      convergenceThreshold: z.number().min(0).max(1).optional(),
      windowSize: z.number().int().min(2).max(10).optional(),
      progressTracking: z.string().optional(),
    })
    .optional(),

  verification: z
    .object({
      skipLevels: z.array(z.string()).optional(),
      timeoutMs: z.number().int().positive().optional(),
      cleanRoom: z.boolean().optional(),
      parallelTests: z.boolean().optional(),
      retryFlaky: z.boolean().optional(),
      maxRetries: z.number().int().min(0).max(5).optional(),
    })
    .optional(),

  gitOps: z
    .object({
      mode: z.enum(['local', 'push_only', 'github_pr']).optional(),
      branchPrefix: z.string().optional(),
      commitMessagePrefix: z.string().optional(),
      autoCommit: z.boolean().optional(),
      autoPush: z.boolean().optional(),
      createPR: z.boolean().optional(),
      prDraft: z.boolean().optional(),
      prReviewers: z.array(z.string()).optional(),
      prLabels: z.array(z.string()).optional(),
    })
    .optional(),

  executionLimits: z
    .object({
      maxWallClockSeconds: z.number().int().min(60).max(86400).optional(),
      maxIterationSeconds: z.number().int().positive().optional(),
      maxTotalTokens: z.number().int().positive().optional(),
      maxIterationTokens: z.number().int().positive().optional(),
      maxDiskMb: z.number().int().positive().optional(),
      maxMemoryMb: z.number().int().positive().optional(),
      maxConcurrentAgents: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
});

export type CreateProfileBody = z.infer<typeof createProfileBodySchema>;

/**
 * Update profile request body (all fields optional)
 */
export const updateProfileBodySchema = createProfileBodySchema.partial().omit({ name: true });

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

/**
 * Profile name URL parameter
 */
export const profileNameParamsSchema = z.object({
  name: z.string().min(1).max(64),
});

export type ProfileNameParams = z.infer<typeof profileNameParamsSchema>;

/**
 * Profile list query parameters
 */
export const listProfilesQuerySchema = z.object({
  resolve: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type ListProfilesQuery = z.infer<typeof listProfilesQuerySchema>;

/**
 * Validation result response
 */
export const validationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    })
  ),
  warnings: z.array(
    z.object({
      path: z.string(),
      message: z.string(),
    })
  ),
  resolved: profileDetailSchema.optional(),
});

export type ValidationResult = z.infer<typeof validationResultSchema>;
