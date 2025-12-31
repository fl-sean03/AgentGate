import { z } from 'zod';
import { submitRequestSchema } from './work-order.js';

// Integration Strategy
export const IntegrationStrategy = {
  MANUAL: 'manual',
  AUTO_MERGE: 'auto-merge',
  AUTO_SQUASH: 'auto-squash',
  CUSTOM: 'custom',
} as const;

export type IntegrationStrategy = (typeof IntegrationStrategy)[keyof typeof IntegrationStrategy];

// Spawn Limits Schema
export const spawnLimitsSchema = z.object({
  maxDepth: z.number().int().min(1).max(10).default(3),
  maxChildren: z.number().int().min(1).max(100).default(10),
  maxTotalDescendants: z.number().int().min(1).max(1000).default(100),
});

export type SpawnLimits = z.infer<typeof spawnLimitsSchema>;

// Child Work Order Request Schema
export const childWorkOrderRequestSchema = z.object({
  taskPrompt: z.string().min(1).max(10000),
  siblingIndex: z.number().int().nonnegative().optional(),
  integrationStrategy: z.nativeEnum(IntegrationStrategy).default(IntegrationStrategy.MANUAL),
  // Inherit most fields from parent, but allow overrides
  maxIterations: z.number().int().min(1).max(10).optional(),
  maxWallClockSeconds: z.number().int().min(60).max(86400).optional(),
});

export type ChildWorkOrderRequest = z.infer<typeof childWorkOrderRequestSchema>;

// Spawn Request Schema
export const spawnRequestSchema = z.object({
  parentWorkOrderId: z.string().min(1),
  children: z.array(childWorkOrderRequestSchema).min(1).max(100),
  spawnLimits: spawnLimitsSchema.optional(),
});

export type SpawnRequest = z.infer<typeof spawnRequestSchema>;
