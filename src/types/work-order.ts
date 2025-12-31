import { z } from 'zod';

// Work Order Status
export const WorkOrderStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
} as const;

export type WorkOrderStatus = (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

// Agent Types
export const AgentType = {
  CLAUDE_CODE: 'claude-code',
} as const;

export type AgentType = (typeof AgentType)[keyof typeof AgentType];

// Gate Plan Source
export const GatePlanSource = {
  VERIFY_PROFILE: 'verify-profile',
  CI_WORKFLOW: 'ci-workflow',
  AUTO: 'auto',
  DEFAULT: 'default',
} as const;

export type GatePlanSource = (typeof GatePlanSource)[keyof typeof GatePlanSource];

// Workspace Templates for fresh workspaces
export const WorkspaceTemplate = {
  MINIMAL: 'minimal',
  TYPESCRIPT: 'typescript',
  PYTHON: 'python',
} as const;

export type WorkspaceTemplate = (typeof WorkspaceTemplate)[keyof typeof WorkspaceTemplate];

// Workspace Source
export const workspaceSourceSchema = z.discriminatedUnion('type', [
  // Local source - existing directory
  z.object({
    type: z.literal('local'),
    path: z.string().min(1),
  }),
  // Git source - clone from URL (deprecated, use 'github' instead)
  z.object({
    type: z.literal('git'),
    url: z.string().url(),
    branch: z.string().optional(),
  }),
  // Fresh source - create new workspace (deprecated, use 'github-new' instead)
  z.object({
    type: z.literal('fresh'),
    destPath: z.string().min(1),
    template: z.nativeEnum(WorkspaceTemplate).optional(),
    projectName: z.string().optional(),
  }),
  // GitHub source - existing GitHub repository (v0.2.4)
  z.object({
    type: z.literal('github'),
    owner: z.string().min(1),
    repo: z.string().min(1),
    branch: z.string().optional(),
  }),
  // GitHub New source - create new GitHub repository (v0.2.4)
  z.object({
    type: z.literal('github-new'),
    owner: z.string().min(1),
    repoName: z.string().min(1),
    private: z.boolean().optional(),
    template: z.nativeEnum(WorkspaceTemplate).optional(),
  }),
]);

export type WorkspaceSource = z.infer<typeof workspaceSourceSchema>;

// Type helpers for workspace sources
export type LocalSource = Extract<WorkspaceSource, { type: 'local' }>;
export type GitSource = Extract<WorkspaceSource, { type: 'git' }>;
export type FreshSource = Extract<WorkspaceSource, { type: 'fresh' }>;
export type GitHubSource = Extract<WorkspaceSource, { type: 'github' }>;
export type GitHubNewSource = Extract<WorkspaceSource, { type: 'github-new' }>;

// Execution Policies
export const executionPoliciesSchema = z.object({
  networkAllowed: z.boolean().default(false),
  allowedPaths: z.array(z.string()).default([]),
  forbiddenPatterns: z.array(z.string()).default([
    '**/.env',
    '**/.env.*',
    '**/secrets/**',
    '**/*.pem',
    '**/*.key',
    '**/credentials.json',
    '**/service-account*.json',
  ]),
  maxDiskMb: z.number().positive().optional(),
});

export type ExecutionPolicies = z.infer<typeof executionPoliciesSchema>;

// Work Order
export interface WorkOrder {
  id: string;
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  agentType: AgentType;
  maxIterations: number;
  maxWallClockSeconds: number;
  gatePlanSource: GatePlanSource;
  policies: ExecutionPolicies;
  createdAt: Date;
  status: WorkOrderStatus;
  runId?: string;
  completedAt?: Date;
  error?: string;
}

// Submit Request Schema
export const submitRequestSchema = z.object({
  taskPrompt: z.string().min(1).max(10000),
  workspaceSource: workspaceSourceSchema,
  agentType: z.nativeEnum(AgentType).default(AgentType.CLAUDE_CODE),
  maxIterations: z.number().int().min(1).max(10).default(3),
  maxWallClockSeconds: z.number().int().min(60).max(86400).default(3600),
  gatePlanSource: z.nativeEnum(GatePlanSource).default(GatePlanSource.AUTO),
  policies: executionPoliciesSchema.optional(),
});

export type SubmitRequest = z.infer<typeof submitRequestSchema>;

// List Filters
export const listFiltersSchema = z.object({
  status: z.nativeEnum(WorkOrderStatus).optional(),
  limit: z.number().int().positive().max(100).default(20),
  offset: z.number().int().nonnegative().default(0),
});

export type ListFilters = z.infer<typeof listFiltersSchema>;
