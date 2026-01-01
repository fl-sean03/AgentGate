import type { ToolCallRecord } from './sdk.js';

// Agent Request
export interface AgentRequest {
  workspacePath: string;
  taskPrompt: string;
  gatePlanSummary: string;
  constraints: AgentConstraints;
  priorFeedback: string | null;
  contextPointers: ContextPointers;
  timeoutMs: number;
  sessionId: string | null;
  // Optional spawn configuration for recursive agent spawning
  spawnLimits?: {
    maxDepth: number;
    maxChildren: number;
    maxTotalDescendants: number;
  } | null;
  workOrderId?: string | null;
}

// Agent Result
export interface AgentResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput: AgentStructuredOutput | null;
  sessionId: string | null;
  tokensUsed: TokenUsage | null;
  durationMs: number;
  // SDK-specific fields (optional, populated by claude-agent-sdk driver)
  totalCostUsd?: number;
  toolCalls?: ToolCallRecord[];
  model?: string;
  turns?: number;
}

// Agent Structured Output
export interface AgentStructuredOutput {
  result: string;
  session_id?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Token Usage
export interface TokenUsage {
  input: number;
  output: number;
}

// Agent Constraints
export interface AgentConstraints {
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns: number;
  permissionMode: 'plan' | 'acceptEdits' | 'bypassPermissions';
  additionalSystemPrompt: string | null;
}

// Context Pointers
export interface ContextPointers {
  manifestPath: string | null;
  testsPath: string | null;
  docsPath: string | null;
  gatePlanPath: string | null;
  srcPath: string | null;
}

// Driver Capabilities
export interface DriverCapabilities {
  supportsSessionResume: boolean;
  supportsStructuredOutput: boolean;
  supportsToolRestriction: boolean;
  supportsTimeout: boolean;
  maxTurns: number;
  // SDK-specific capabilities
  supportsHooks?: boolean;
  supportsSandbox?: boolean;
  supportsStreaming?: boolean;
  supportsCostTracking?: boolean;
  billingMethod?: 'api-key' | 'subscription';
}

// Driver Interface
export interface AgentDriver {
  readonly name: string;
  readonly version: string;
  execute(request: AgentRequest): Promise<AgentResult>;
  isAvailable(): Promise<boolean>;
  getCapabilities(): DriverCapabilities;
}
