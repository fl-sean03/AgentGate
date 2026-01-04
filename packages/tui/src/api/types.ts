// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Error type
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Repository
export interface Repository {
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  pushedAt: Date;
  private: boolean;
}

// Work Order
export interface WorkOrder {
  id: string;
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  agentType: string;
  maxIterations: number;
  gatePlanSource: string;
  status: WorkOrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceSource {
  type: 'github';
  owner: string;
  repo: string;
  ref: string;
}

export type WorkOrderStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

// Run
export interface Run {
  id: string;
  workOrderId: string;
  status: RunStatus;
  iteration: number;
  maxIterations: number;
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  prUrl?: string;
  error?: RunError;
  filesChanged?: string[];
  verification?: VerificationResult;
  workOrder?: WorkOrder;
}

export type RunStatus =
  | 'queued'
  | 'leased'
  | 'building'
  | 'snapshotting'
  | 'running'
  | 'verifying'
  | 'feedback'
  | 'ci_polling'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'interrupted';

export interface RunError {
  level: 'L0' | 'L1' | 'L2' | 'L3';
  message: string;
  details?: string;
  file?: string;
  line?: number;
}

export interface VerificationResult {
  L0?: VerificationLevel;
  L1?: VerificationLevel;
  L2?: VerificationLevel;
  L3?: VerificationLevel;
}

export interface VerificationLevel {
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  details?: string[];
}

// SSE Event Types
export interface AgentActivityEvent {
  type: 'agent:activity';
  timestamp: Date;
  tool: 'Read' | 'Edit' | 'Write' | 'Bash' | 'Glob' | 'Grep' | 'Task';
  file?: string;
  command?: string;
  output?: string;
  description?: string;
}

export interface VerificationProgressEvent {
  type: 'verification:progress';
  level: 'L0' | 'L1' | 'L2' | 'L3';
  status: 'running' | 'passed' | 'failed';
  progress?: {
    current: number;
    total: number;
  };
  details?: string;
}

export interface RunCompletedEvent {
  type: 'run:completed';
  result: 'succeeded' | 'failed' | 'canceled';
  prUrl?: string;
  error?: RunError;
}

export type StreamEvent =
  | AgentActivityEvent
  | VerificationProgressEvent
  | RunCompletedEvent;

// Auth
export interface AuthToken {
  token: string;
  refreshToken: string;
  expiresAt: Date;
  user: {
    email: string;
    name?: string;
    avatar?: string;
  };
}

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  interval: number;
}

// Create Work Order Request
export interface CreateWorkOrderRequest {
  taskPrompt: string;
  workspaceSource: WorkspaceSource;
  agentType?: string;
  maxIterations?: number;
  gatePlanSource?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
