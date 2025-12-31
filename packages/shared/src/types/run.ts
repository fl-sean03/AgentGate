import { z } from 'zod';

// Run Status
export const RunStatus = {
  QUEUED: 'queued',
  BUILDING: 'building',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

// Iteration Status
export const IterationStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type IterationStatus = (typeof IterationStatus)[keyof typeof IterationStatus];

// Verification Result
export interface VerificationResult {
  l0Passed: boolean;
  l1Passed: boolean;
  l2Passed?: boolean;
  l3Passed?: boolean;
  overallPassed: boolean;
  details?: {
    l0?: { message?: string };
    l1?: { tests: Array<{ name: string; passed: boolean; output?: string }> };
    l2?: { tests: Array<{ name: string; passed: boolean; output?: string }> };
    l3?: { checks: Array<{ name: string; passed: boolean; message?: string }> };
  };
}

// Iteration Summary
export interface IterationSummary {
  number: number;
  status: IterationStatus;
  startedAt?: string;
  completedAt?: string;
  verification?: VerificationResult;
}

// Run Summary
export interface RunSummary {
  id: string;
  status: RunStatus;
  startedAt?: string;
  completedAt?: string;
  iterationCount: number;
}

// Run Detail
export interface RunDetail extends RunSummary {
  workOrderId: string;
  branchName?: string;
  prUrl?: string;
  iterations: IterationSummary[];
}

// Run Metrics (v0.2.5)
export interface RunMetrics {
  totalDurationMs: number;
  agentDurationMs: number;
  verificationDurationMs: number;
  iterationMetrics: IterationMetrics[];
}

export interface IterationMetrics {
  iterationNumber: number;
  durationMs: number;
  agentDurationMs: number;
  verificationDurationMs: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  codeChanges?: {
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    linesAdded: number;
    linesDeleted: number;
  };
}

// List Runs Query Schema
export const listRunsQuerySchema = z.object({
  workOrderId: z.string().optional(),
  status: z.nativeEnum(RunStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
