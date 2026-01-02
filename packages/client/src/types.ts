/**
 * AgentGate Client SDK Type Definitions
 */

// Client configuration
export interface AgentGateClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  fetch?: typeof fetch;
}

// Workspace source types
export type WorkspaceSource =
  | { type: 'local'; path: string }
  | { type: 'github'; repo: string; branch?: string }
  | { type: 'github-new'; repo: string; template?: string };

// Work order types
export interface WorkOrderSummary {
  id: string;
  taskPrompt: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  workspaceSource: WorkspaceSource;
  agentType: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
}

export interface WorkOrderDetail extends WorkOrderSummary {
  maxIterations: number;
  maxTime: number;
  runs: RunSummary[];
  harness?: {
    profile: string | null;
    loopStrategy: { mode: string; maxIterations: number };
    verification: { waitForCI: boolean; skipLevels: string[] };
  };
}

export interface CreateWorkOrderOptions {
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  agentType?: string;
  harness?: {
    profile?: string;
    loopStrategy?: {
      mode?: 'fixed' | 'hybrid' | 'ralph' | 'custom';
      maxIterations?: number;
      completionCriteria?: string[];
      requireCI?: boolean;
    };
    verification?: {
      waitForCI?: boolean;
      skipLevels?: ('L0' | 'L1' | 'L2' | 'L3')[];
    };
    gitOps?: {
      mode?: 'local' | 'push-only' | 'github-pr';
      draftPR?: boolean;
    };
    limits?: {
      maxWallClockSeconds?: number;
      networkAllowed?: boolean;
    };
  };
}

// Run types
export interface RunSummary {
  id: string;
  status: 'queued' | 'building' | 'running' | 'succeeded' | 'failed' | 'canceled';
  startedAt: string;
  completedAt?: string;
  iterationCount: number;
}

export interface RunDetail extends RunSummary {
  workOrderId: string;
  iterations: IterationSummary[];
  branchName?: string;
  prUrl?: string;
}

export interface IterationSummary {
  number: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  verification?: {
    l0Passed: boolean;
    l1Passed: boolean;
    overallPassed: boolean;
  };
}

// Profile types
export interface ProfileSummary {
  name: string;
  description: string | null;
  extends: string | null;
  isBuiltIn: boolean;
}

export interface ProfileDetail extends ProfileSummary {
  loopStrategy?: {
    mode: string;
    maxIterations: number;
    completionCriteria?: string[];
    requireCI?: boolean;
  };
  verification?: {
    waitForCI?: boolean;
    skipLevels?: string[];
  };
  gitOps?: {
    mode?: string;
    draftPR?: boolean;
  };
  limits?: {
    maxWallClockSeconds?: number;
    networkAllowed?: boolean;
  };
  resolved?: {
    inheritanceChain: string[];
    configHash: string;
  };
}

export interface CreateProfileOptions {
  name: string;
  description?: string;
  extends?: string;
  loopStrategy?: Partial<ProfileDetail['loopStrategy']>;
  verification?: Partial<ProfileDetail['verification']>;
  gitOps?: Partial<ProfileDetail['gitOps']>;
  limits?: Partial<ProfileDetail['limits']>;
}

// Audit types
export interface AuditRecord {
  runId: string;
  workOrderId: string;
  startedAt: string;
  completedAt: string | null;
  initialConfig: ConfigSnapshot;
  finalConfig: ConfigSnapshot | null;
  snapshotCount: number;
  changeCount: number;
  configHashChanged: boolean;
}

export interface ConfigSnapshot {
  id: string;
  runId: string;
  iteration: number;
  snapshotAt: string;
  configHash: string;
  config: Record<string, unknown>;
}

export interface ConfigChange {
  iteration: number;
  path: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  initiator: 'user' | 'strategy' | 'system';
  changedAt: string;
}

// Stream event types
export interface StreamEvent {
  type: string;
  runId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
}
