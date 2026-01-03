/**
 * Execution Spec Types (v0.2.24)
 *
 * Defines the execution environment: workspace, sandbox, and agent.
 *
 * @module types/execution-spec
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// WORKSPACE SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Git credentials configuration
 */
export interface GitCredentials {
  type: 'token' | 'ssh' | 'env';
  /** Token for type: 'token' */
  token?: string;
  /** SSH key path for type: 'ssh' */
  keyPath?: string;
  /** Environment variable name for type: 'env' */
  envVar?: string;
}

export const gitCredentialsSchema = z.object({
  type: z.enum(['token', 'ssh', 'env']),
  token: z.string().optional(),
  keyPath: z.string().optional(),
  envVar: z.string().optional(),
});

/**
 * Local workspace - uses existing directory
 */
export interface LocalWorkspace {
  source: 'local';
  /** Absolute path to the workspace */
  path: string;
  /** Prevent writes (for testing) */
  readonly?: boolean;
}

/**
 * Git workspace - clones from URL
 */
export interface GitWorkspace {
  source: 'git';
  /** Clone URL */
  url: string;
  /** Branch, tag, or commit ref */
  ref?: string;
  /** Clone depth */
  depth?: number;
  /** Git credentials */
  credentials?: GitCredentials;
}

/**
 * GitHub workspace - clones from GitHub
 */
export interface GitHubWorkspace {
  source: 'github';
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch, tag, or commit ref */
  ref?: string;
  /** Fork the repo before working */
  fork?: boolean;
}

/**
 * GitHub new workspace - creates new repo
 */
export interface GitHubNewWorkspace {
  source: 'github-new';
  /** Repository owner */
  owner: string;
  /** New repository name */
  repoName: string;
  /** Create as private repo */
  private?: boolean;
  /** Template repository to use */
  template?: string;
  /** Repository description */
  description?: string;
}

/**
 * Fresh workspace - creates new local directory
 */
export interface FreshWorkspace {
  source: 'fresh';
  /** Destination path */
  destPath: string;
  /** Project template */
  template?: WorkspaceTemplateType;
  /** Project name */
  projectName?: string;
}

/**
 * Available workspace templates
 */
export type WorkspaceTemplateType =
  | 'node-typescript'
  | 'node-javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'empty';

/**
 * Union of all workspace types
 */
export type WorkspaceSpec =
  | LocalWorkspace
  | GitWorkspace
  | GitHubWorkspace
  | GitHubNewWorkspace
  | FreshWorkspace;

// Workspace schemas
export const localWorkspaceSchema = z.object({
  source: z.literal('local'),
  path: z.string().min(1),
  readonly: z.boolean().optional(),
});

export const gitWorkspaceSchema = z.object({
  source: z.literal('git'),
  url: z.string().url(),
  ref: z.string().optional(),
  depth: z.number().int().min(1).optional(),
  credentials: gitCredentialsSchema.optional(),
});

export const githubWorkspaceSchema = z.object({
  source: z.literal('github'),
  owner: z.string().min(1),
  repo: z.string().min(1),
  ref: z.string().optional(),
  fork: z.boolean().optional(),
});

export const githubNewWorkspaceSchema = z.object({
  source: z.literal('github-new'),
  owner: z.string().min(1),
  repoName: z.string().min(1),
  private: z.boolean().optional(),
  template: z.string().optional(),
  description: z.string().optional(),
});

export const freshWorkspaceSchema = z.object({
  source: z.literal('fresh'),
  destPath: z.string().min(1),
  template: z.enum([
    'node-typescript',
    'node-javascript',
    'python',
    'rust',
    'go',
    'empty',
  ]).optional(),
  projectName: z.string().optional(),
});

export const workspaceSpecSchema = z.discriminatedUnion('source', [
  localWorkspaceSchema,
  gitWorkspaceSchema,
  githubWorkspaceSchema,
  githubNewWorkspaceSchema,
  freshWorkspaceSchema,
]);

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sandbox provider type
 */
export type SandboxProviderType = 'docker' | 'subprocess' | 'none';

/**
 * Network mode for sandbox
 */
export type SandboxNetworkMode = 'none' | 'bridge' | 'host';

/**
 * Resource specification
 */
export interface ResourceSpec {
  /** CPU cores */
  cpu?: number;
  /** Memory (e.g., "4Gi", "512Mi") */
  memory?: string;
  /** Disk space (e.g., "10Gi") */
  disk?: string;
  /** Timeout (e.g., "1h") */
  timeout?: string;
}

export const resourceSpecSchema = z.object({
  cpu: z.number().min(0.1).max(64).optional(),
  memory: z.string().regex(/^\d+(Mi|Gi)$/).optional(),
  disk: z.string().regex(/^\d+(Mi|Gi)$/).optional(),
  timeout: z.string().regex(/^\d+[smhd]$/).optional(),
});

/**
 * Mount specification
 */
export interface MountSpec {
  /** Source path on host */
  source: string;
  /** Target path in container */
  target: string;
  /** Mount as readonly */
  readonly?: boolean;
}

export const mountSpecSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  readonly: z.boolean().optional(),
});

/**
 * Sandbox specification
 */
export interface SandboxSpec {
  /** Sandbox provider */
  provider: SandboxProviderType;
  /** Docker image (for docker provider) */
  image?: string;
  /** Resource limits */
  resources?: ResourceSpec;
  /** Network mode */
  network?: SandboxNetworkMode;
  /** Volume mounts */
  mounts?: MountSpec[];
  /** Environment variables */
  environment?: Record<string, string>;
  /** Working directory in sandbox */
  workdir?: string;
}

export const sandboxSpecSchema = z.object({
  provider: z.enum(['docker', 'subprocess', 'none']),
  image: z.string().optional(),
  resources: resourceSpecSchema.optional(),
  network: z.enum(['none', 'bridge', 'host']).optional(),
  mounts: z.array(mountSpecSchema).optional(),
  environment: z.record(z.string()).optional(),
  workdir: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// AGENT SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Available agent drivers
 */
export type AgentDriverType =
  | 'claude-code-subscription'
  | 'claude-code-api'
  | 'claude-agent-sdk'
  | 'opencode'
  | 'openai-codex';

/**
 * Tool specification
 */
export interface ToolSpec {
  /** Tool name */
  name: string;
  /** Whether the tool is enabled */
  enabled?: boolean;
  /** Tool-specific configuration */
  config?: Record<string, unknown>;
}

export const toolSpecSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

/**
 * MCP server specification
 */
export interface MCPServerSpec {
  /** Command to run the server */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

export const mcpServerSpecSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  /** Can read/write files */
  fileSystem?: boolean;
  /** Can make network requests */
  network?: boolean;
  /** Can run shell commands */
  shell?: boolean;
  /** Can use browser automation */
  browser?: boolean;
}

export const agentCapabilitiesSchema = z.object({
  fileSystem: z.boolean().optional(),
  network: z.boolean().optional(),
  shell: z.boolean().optional(),
  browser: z.boolean().optional(),
});

/**
 * Agent specification
 */
export interface AgentSpec {
  /** Agent driver type */
  driver: AgentDriverType;
  /** Model to use */
  model?: string;
  /** Maximum tokens per request */
  maxTokens?: number;
  /** Temperature for generation */
  temperature?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Available tools */
  tools?: ToolSpec[];
  /** MCP servers */
  mcpServers?: Record<string, MCPServerSpec>;
  /** Agent capabilities */
  capabilities?: AgentCapabilities;
}

export const agentSpecSchema = z.object({
  driver: z.enum([
    'claude-code-subscription',
    'claude-code-api',
    'claude-agent-sdk',
    'opencode',
    'openai-codex',
  ]),
  model: z.string().optional(),
  maxTokens: z.number().int().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(toolSpecSchema).optional(),
  mcpServers: z.record(mcpServerSpecSchema).optional(),
  capabilities: agentCapabilitiesSchema.optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION SPEC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete execution specification
 */
export interface ExecutionSpec {
  /** Workspace configuration */
  workspace: WorkspaceSpec;
  /** Sandbox configuration (optional) */
  sandbox?: SandboxSpec;
  /** Agent configuration */
  agent: AgentSpec;
}

export const executionSpecSchema = z.object({
  workspace: workspaceSpecSchema,
  sandbox: sandboxSpecSchema.optional(),
  agent: agentSpecSchema,
});

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

export function isLocalWorkspace(ws: WorkspaceSpec): ws is LocalWorkspace {
  return ws.source === 'local';
}

export function isGitWorkspace(ws: WorkspaceSpec): ws is GitWorkspace {
  return ws.source === 'git';
}

export function isGitHubWorkspace(ws: WorkspaceSpec): ws is GitHubWorkspace {
  return ws.source === 'github';
}

export function isGitHubNewWorkspace(
  ws: WorkspaceSpec
): ws is GitHubNewWorkspace {
  return ws.source === 'github-new';
}

export function isFreshWorkspace(ws: WorkspaceSpec): ws is FreshWorkspace {
  return ws.source === 'fresh';
}
