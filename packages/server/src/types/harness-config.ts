import { z } from 'zod';

// Loop Strategy Mode
export const LoopStrategyMode = {
  FIXED: 'fixed',
  RALPH: 'ralph',
  HYBRID: 'hybrid',
  CUSTOM: 'custom',
} as const;

export type LoopStrategyMode = (typeof LoopStrategyMode)[keyof typeof LoopStrategyMode];

// Completion Detection
export const CompletionDetection = {
  AGENT_SIGNAL: 'agent_signal',
  VERIFICATION_PASS: 'verification_pass',
  NO_CHANGES: 'no_changes',
  LOOP_DETECTION: 'loop_detection',
  CI_PASS: 'ci_pass',
} as const;

export type CompletionDetection = (typeof CompletionDetection)[keyof typeof CompletionDetection];

// Progress Tracking Mode
export const ProgressTrackingMode = {
  GIT_HISTORY: 'git_history',
  PROGRESS_FILE: 'progress_file',
  FEATURE_LIST: 'feature_list',
  VERIFICATION_LEVELS: 'verification_levels',
} as const;

export type ProgressTrackingMode =
  (typeof ProgressTrackingMode)[keyof typeof ProgressTrackingMode];

// Git Operation Mode
export const GitOperationMode = {
  LOCAL: 'local',
  PUSH_ONLY: 'push_only',
  GITHUB_PR: 'github_pr',
} as const;

export type GitOperationMode = (typeof GitOperationMode)[keyof typeof GitOperationMode];

// Fixed Strategy Config Schema
export const fixedStrategyConfigSchema = z.object({
  mode: z.literal(LoopStrategyMode.FIXED),
  maxIterations: z.number().int().min(1).max(100).default(3),
  completionDetection: z.array(z.nativeEnum(CompletionDetection)).default([
    CompletionDetection.VERIFICATION_PASS,
  ]),
});

export type FixedStrategyConfig = z.infer<typeof fixedStrategyConfigSchema>;

// Hybrid Strategy Config Schema
export const hybridStrategyConfigSchema = z.object({
  mode: z.literal(LoopStrategyMode.HYBRID),
  baseIterations: z.number().int().min(1).max(100).default(3),
  maxBonusIterations: z.number().int().min(0).max(100).default(2),
  progressThreshold: z.number().min(0).max(1).default(0.1),
  completionDetection: z.array(z.nativeEnum(CompletionDetection)).default([
    CompletionDetection.VERIFICATION_PASS,
    CompletionDetection.NO_CHANGES,
  ]),
  progressTracking: z.nativeEnum(ProgressTrackingMode).default(ProgressTrackingMode.GIT_HISTORY),
});

export type HybridStrategyConfig = z.infer<typeof hybridStrategyConfigSchema>;

// Ralph Strategy Config Schema
export const ralphStrategyConfigSchema = z.object({
  mode: z.literal(LoopStrategyMode.RALPH),
  minIterations: z.number().int().min(1).max(100).default(1),
  maxIterations: z.number().int().min(1).max(100).default(10),
  convergenceThreshold: z.number().min(0).max(1).default(0.05),
  windowSize: z.number().int().min(2).max(10).default(3),
  completionDetection: z.array(z.nativeEnum(CompletionDetection)).default([
    CompletionDetection.VERIFICATION_PASS,
    CompletionDetection.LOOP_DETECTION,
  ]),
  progressTracking: z.nativeEnum(ProgressTrackingMode).default(
    ProgressTrackingMode.VERIFICATION_LEVELS
  ),
});

export type RalphStrategyConfig = z.infer<typeof ralphStrategyConfigSchema>;

// Custom Strategy Config Schema
export const customStrategyConfigSchema = z.object({
  mode: z.literal(LoopStrategyMode.CUSTOM),
  strategyName: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  completionDetection: z.array(z.nativeEnum(CompletionDetection)).default([
    CompletionDetection.VERIFICATION_PASS,
  ]),
});

export type CustomStrategyConfig = z.infer<typeof customStrategyConfigSchema>;

// Loop Strategy Config - Discriminated Union
export const loopStrategyConfigSchema = z.discriminatedUnion('mode', [
  fixedStrategyConfigSchema,
  hybridStrategyConfigSchema,
  ralphStrategyConfigSchema,
  customStrategyConfigSchema,
]);

export type LoopStrategyConfig = z.infer<typeof loopStrategyConfigSchema>;

// Agent Driver Config Schema
export const agentDriverConfigSchema = z.object({
  type: z.enum(['claude-code-api', 'claude-code-subscription', 'claude-agent-sdk']),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
  mcpServers: z.record(z.unknown()).optional(),
});

export type AgentDriverConfig = z.infer<typeof agentDriverConfigSchema>;

// Verification Config Schema
export const verificationConfigSchema = z.object({
  skipLevels: z.array(z.enum(['lint', 'typecheck', 'test', 'blackbox', 'contracts'])).default([]),
  timeoutMs: z.number().int().positive().default(300000),
  cleanRoom: z.boolean().default(true),
  parallelTests: z.boolean().default(true),
  retryFlaky: z.boolean().default(false),
  maxRetries: z.number().int().min(0).max(5).default(0),
});

export type VerificationConfig = z.infer<typeof verificationConfigSchema>;

// Git Ops Config Schema
export const gitOpsConfigSchema = z.object({
  mode: z.nativeEnum(GitOperationMode).default(GitOperationMode.LOCAL),
  branchPrefix: z.string().default('agentgate/'),
  commitMessagePrefix: z.string().default('[AgentGate]'),
  autoCommit: z.boolean().default(true),
  autoPush: z.boolean().default(false),
  createPR: z.boolean().default(false),
  prDraft: z.boolean().default(true),
  prReviewers: z.array(z.string()).default([]),
  prLabels: z.array(z.string()).default([]),
});

export type GitOpsConfig = z.infer<typeof gitOpsConfigSchema>;

// Execution Limits Schema
export const executionLimitsSchema = z.object({
  maxWallClockSeconds: z.number().int().positive().default(3600),
  maxIterationSeconds: z.number().int().positive().default(600),
  maxTotalTokens: z.number().int().positive().optional(),
  maxIterationTokens: z.number().int().positive().optional(),
  maxDiskMb: z.number().int().positive().optional(),
  maxMemoryMb: z.number().int().positive().optional(),
  maxConcurrentAgents: z.number().int().min(1).max(10).default(1),
});

export type ExecutionLimits = z.infer<typeof executionLimitsSchema>;

// Harness Config Schema - combines all configuration sections
export const harnessConfigSchema = z.object({
  version: z.literal('1.0').default('1.0'),
  loopStrategy: loopStrategyConfigSchema.default({ mode: LoopStrategyMode.FIXED }),
  agentDriver: agentDriverConfigSchema.optional(),
  verification: verificationConfigSchema.default({}),
  gitOps: gitOpsConfigSchema.default({}),
  executionLimits: executionLimitsSchema.default({}),
  metadata: z.record(z.unknown()).optional(),
});

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

// Resolved Harness Config - after all defaults are applied
export interface ResolvedHarnessConfig {
  version: '1.0';
  loopStrategy: LoopStrategyConfig;
  agentDriver: AgentDriverConfig;
  verification: Required<VerificationConfig>;
  gitOps: Required<GitOpsConfig>;
  executionLimits: Required<ExecutionLimits>;
  metadata: Record<string, unknown>;
}

// Config Snapshot - immutable record of config at a point in time
export interface ConfigSnapshot {
  id: string;
  config: HarnessConfig;
  source: 'file' | 'api' | 'default' | 'merged';
  sourcePath?: string;
  hash: string;
  createdAt: Date;
}

// Config Change - describes a single configuration change
export interface ConfigChange {
  path: string[];
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  changedBy: 'user' | 'system' | 'merge';
  changedAt: Date;
}

// Config Audit Record - tracks configuration history
export interface ConfigAuditRecord {
  workOrderId: string;
  runId: string;
  iteration: number;
  snapshotBefore: ConfigSnapshot;
  snapshotAfter: ConfigSnapshot;
  changes: ConfigChange[];
  appliedAt: Date;
}
