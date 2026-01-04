/**
 * Agent Capability Definitions
 * Defines capabilities that agents can declare and tasks can require.
 *
 * (v0.2.27 - Thrust 15: Agent Capability Negotiation)
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('capabilities');

/**
 * Standard capability names
 */
export const STANDARD_CAPABILITIES = {
  /** Network access capability */
  NETWORK: 'network',
  /** Filesystem access capability */
  FILESYSTEM: 'filesystem',
  /** Browser automation capability */
  BROWSER: 'browser',
  /** Shell command execution capability */
  SHELL: 'shell',
  /** Docker/container capability */
  DOCKER: 'docker',
  /** Database access capability */
  DATABASE: 'database',
  /** Code execution capability */
  CODE_EXECUTION: 'code-execution',
  /** Tool use (MCP servers, etc.) */
  TOOL_USE: 'tool-use',
} as const;

/**
 * Capability value types
 */
export type CapabilityValue = boolean | string | number | string[] | CapabilityConfig;

/**
 * Capability configuration
 */
export interface CapabilityConfig {
  /** Is this capability enabled */
  enabled: boolean;
  /** Capability version */
  version?: string;
  /** Additional configuration */
  [key: string]: unknown;
}

/**
 * Single capability declaration
 */
export interface Capability {
  /** Capability name */
  name: string;
  /** Whether the capability is available */
  enabled: boolean;
  /** Capability version (semver) */
  version?: string;
  /** Additional configuration */
  config?: Record<string, unknown>;
  /** Human-readable description */
  description?: string;
}

/**
 * Agent capabilities declaration
 */
export interface AgentCapabilities {
  /** Agent identifier */
  agentId: string;
  /** Agent type/driver name */
  agentType: string;
  /** Agent version */
  agentVersion?: string;
  /** Declared capabilities */
  capabilities: Capability[];
  /** Maximum context window tokens */
  maxTokens?: number;
  /** Maximum file size the agent can handle */
  maxFileSize?: number;
  /** Supported programming languages */
  supportedLanguages?: string[];
  /** Rate limits */
  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
}

/**
 * Capability requirement
 */
export interface CapabilityRequirement {
  /** Capability name */
  name: string;
  /** Required (must have) or preferred (nice to have) */
  required: boolean;
  /** Minimum version required */
  minVersion?: string;
  /** Additional config requirements */
  config?: Record<string, unknown>;
}

/**
 * Task requirements specification
 */
export interface TaskRequirements {
  /** Required capabilities (must have all) */
  requiredCapabilities?: CapabilityRequirement[];
  /** Preferred capabilities (nice to have) */
  preferredCapabilities?: CapabilityRequirement[];
  /** Forbidden capabilities (must not have) */
  forbiddenCapabilities?: string[];
  /** Minimum context tokens needed */
  minTokens?: number;
  /** Languages needed */
  requiredLanguages?: string[];
}

/**
 * Check if a capability is enabled
 */
export function isCapabilityEnabled(cap: Capability | undefined): boolean {
  return cap?.enabled ?? false;
}

/**
 * Get capability by name from a list
 */
export function getCapability(
  capabilities: Capability[],
  name: string
): Capability | undefined {
  return capabilities.find(c => c.name === name);
}

/**
 * Check if capabilities include a specific capability
 */
export function hasCapability(capabilities: Capability[], name: string): boolean {
  const cap = getCapability(capabilities, name);
  return isCapabilityEnabled(cap);
}

/**
 * Create a simple capability
 */
export function createCapability(
  name: string,
  enabled: boolean,
  options?: {
    version?: string;
    config?: Record<string, unknown>;
    description?: string;
  }
): Capability {
  const capability: Capability = {
    name,
    enabled,
  };
  if (options?.version !== undefined) {
    capability.version = options.version;
  }
  if (options?.config !== undefined) {
    capability.config = options.config;
  }
  if (options?.description !== undefined) {
    capability.description = options.description;
  }
  return capability;
}

/**
 * Create agent capabilities declaration
 */
export function createAgentCapabilities(
  agentId: string,
  agentType: string,
  capabilities: Capability[],
  options?: {
    agentVersion?: string;
    maxTokens?: number;
    maxFileSize?: number;
    supportedLanguages?: string[];
    rateLimits?: AgentCapabilities['rateLimits'];
  }
): AgentCapabilities {
  const agentCapabilities: AgentCapabilities = {
    agentId,
    agentType,
    capabilities,
  };
  if (options?.agentVersion !== undefined) {
    agentCapabilities.agentVersion = options.agentVersion;
  }
  if (options?.maxTokens !== undefined) {
    agentCapabilities.maxTokens = options.maxTokens;
  }
  if (options?.maxFileSize !== undefined) {
    agentCapabilities.maxFileSize = options.maxFileSize;
  }
  if (options?.supportedLanguages !== undefined) {
    agentCapabilities.supportedLanguages = options.supportedLanguages;
  }
  if (options?.rateLimits !== undefined) {
    agentCapabilities.rateLimits = options.rateLimits;
  }
  return agentCapabilities;
}

/**
 * Create a capability requirement
 */
export function requireCapability(
  name: string,
  options?: {
    required?: boolean;
    minVersion?: string;
    config?: Record<string, unknown>;
  }
): CapabilityRequirement {
  const requirement: CapabilityRequirement = {
    name,
    required: options?.required ?? true,
  };
  if (options?.minVersion !== undefined) {
    requirement.minVersion = options.minVersion;
  }
  if (options?.config !== undefined) {
    requirement.config = options.config;
  }
  return requirement;
}

/**
 * Create task requirements
 */
export function createTaskRequirements(options: TaskRequirements): TaskRequirements {
  return { ...options };
}

/**
 * Default capabilities for Claude Code driver
 */
export function getClaudeCodeCapabilities(agentId: string): AgentCapabilities {
  return createAgentCapabilities(
    agentId,
    'claude-code',
    [
      createCapability(STANDARD_CAPABILITIES.SHELL, true, {
        description: 'Execute shell commands',
      }),
      createCapability(STANDARD_CAPABILITIES.FILESYSTEM, true, {
        description: 'Read and write files',
      }),
      createCapability(STANDARD_CAPABILITIES.CODE_EXECUTION, true, {
        description: 'Execute code in various languages',
      }),
      createCapability(STANDARD_CAPABILITIES.TOOL_USE, true, {
        description: 'Use MCP tools',
      }),
      createCapability(STANDARD_CAPABILITIES.NETWORK, false, {
        description: 'Network access (disabled by default in sandbox)',
      }),
      createCapability(STANDARD_CAPABILITIES.BROWSER, false, {
        description: 'Browser automation',
      }),
      createCapability(STANDARD_CAPABILITIES.DOCKER, false, {
        description: 'Docker operations',
      }),
    ],
    {
      agentVersion: '1.0.0',
      maxTokens: 200000,
      supportedLanguages: [
        'javascript', 'typescript', 'python', 'rust', 'go',
        'java', 'c', 'cpp', 'ruby', 'php', 'swift', 'kotlin',
      ],
    }
  );
}

/**
 * Default capabilities for Claude Agent SDK driver
 */
export function getClaudeAgentSDKCapabilities(agentId: string): AgentCapabilities {
  return createAgentCapabilities(
    agentId,
    'claude-agent-sdk',
    [
      createCapability(STANDARD_CAPABILITIES.SHELL, true, {
        description: 'Execute shell commands',
      }),
      createCapability(STANDARD_CAPABILITIES.FILESYSTEM, true, {
        description: 'Read and write files',
      }),
      createCapability(STANDARD_CAPABILITIES.CODE_EXECUTION, true, {
        description: 'Execute code in various languages',
      }),
      createCapability(STANDARD_CAPABILITIES.TOOL_USE, true, {
        description: 'Use MCP and custom tools',
      }),
      createCapability(STANDARD_CAPABILITIES.NETWORK, true, {
        description: 'Network access enabled',
      }),
      createCapability(STANDARD_CAPABILITIES.BROWSER, true, {
        description: 'Browser automation available',
      }),
    ],
    {
      agentVersion: '1.0.0',
      maxTokens: 200000,
      supportedLanguages: [
        'javascript', 'typescript', 'python', 'rust', 'go',
        'java', 'c', 'cpp', 'ruby', 'php',
      ],
    }
  );
}

/**
 * Merge capabilities (later ones override earlier)
 */
export function mergeCapabilities(
  ...capabilitySets: Capability[][]
): Capability[] {
  const merged = new Map<string, Capability>();

  for (const caps of capabilitySets) {
    for (const cap of caps) {
      merged.set(cap.name, cap);
    }
  }

  return Array.from(merged.values());
}

/**
 * Filter capabilities by enabled status
 */
export function getEnabledCapabilities(capabilities: Capability[]): Capability[] {
  return capabilities.filter(c => c.enabled);
}

/**
 * Get capability names
 */
export function getCapabilityNames(capabilities: Capability[]): string[] {
  return capabilities.map(c => c.name);
}

/**
 * Log agent capabilities
 */
export function logCapabilities(agentCaps: AgentCapabilities): void {
  const enabled = getEnabledCapabilities(agentCaps.capabilities);
  log.info(
    {
      agentId: agentCaps.agentId,
      agentType: agentCaps.agentType,
      enabledCapabilities: getCapabilityNames(enabled),
      maxTokens: agentCaps.maxTokens,
      languages: agentCaps.supportedLanguages?.length,
    },
    'Agent capabilities'
  );
}
