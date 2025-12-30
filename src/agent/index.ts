/**
 * Agent Driver Module
 *
 * Provides the infrastructure for executing AI coding agents with
 * configurable constraints, tool restrictions, and output parsing.
 */

// Re-export types
export type {
  AgentDriver,
  AgentRequest,
  AgentResult,
  AgentStructuredOutput,
  AgentConstraints,
  ContextPointers,
  DriverCapabilities,
  TokenUsage,
} from './driver.js';

// Registry
export {
  driverRegistry,
  register,
  get,
  list,
  getDefault,
  setDefault,
  has,
  unregister,
  clear,
} from './registry.js';

// Constraints
export {
  DEFAULT_ALLOWED_TOOLS,
  DEFAULT_DISALLOWED_TOOLS,
  DEFAULT_CONSTRAINTS,
  mergeConstraints,
  validateConstraints,
  createMinimalConstraints,
  createPermissiveConstraints,
  type ConstraintValidationResult,
} from './constraints.js';

// Defaults
export {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  MAX_TURNS_LIMIT,
  DEFAULT_AGENT_CONSTRAINTS,
  EMPTY_CONTEXT_POINTERS,
  CLAUDE_CODE_CAPABILITIES,
  createDefaultRequest,
  buildGatePlanSystemPrompt,
  buildFeedbackSystemPrompt,
} from './defaults.js';

// Command builder
export {
  buildPrompt,
  buildSystemPromptAppend,
  buildClaudeCommand,
  buildCommandString,
} from './command-builder.js';

// Output parser
export {
  parseOutput,
  extractSessionId,
  extractTokenUsage,
  extractResult,
  isErrorOutput,
  extractErrorMessage,
} from './output-parser.js';

// Claude Code driver (subprocess-based, legacy)
export {
  ClaudeCodeDriver,
  createClaudeCodeDriver,
  type ClaudeCodeDriverConfig,
} from './claude-code-driver.js';

// Claude Agent SDK driver (recommended)
export {
  ClaudeAgentSDKDriver,
  createClaudeAgentSDKDriver,
  type ClaudeAgentSDKDriverConfig,
  type SDKAgentResult,
} from './claude-agent-sdk-driver.js';

// SDK message parser
export {
  isSystemMessage,
  isAssistantMessage,
  isUserMessage,
  isResultMessage,
  isSuccessResult,
  isErrorResult,
  extractToolUses,
  MessageCollector,
  type ToolCallRecord,
  type ExtractedResult,
} from './sdk-message-parser.js';

// SDK options builder
export {
  buildSDKOptions,
  createTimeoutController,
  clearControllerTimeout,
} from './sdk-options-builder.js';

// SDK hooks utilities
export {
  createToolLoggingHook,
  createFileChangeHook,
  createBlockingHook,
  createDefaultBlockingHook,
  combineHookMatchers,
  DEFAULT_BLOCKED_PATTERNS,
  type ToolUseEvent,
  type ToolEventHandler,
} from './sdk-hooks.js';

// OpenAI Codex driver
export {
  OpenAICodexDriver,
  createOpenAICodexDriver,
  type OpenAICodexDriverConfig,
  type CodexAgentResult,
} from './openai-codex-driver.js';

// OpenAI Agents SDK driver
export {
  OpenAIAgentsDriver,
  createOpenAIAgentsDriver,
  type OpenAIAgentsDriverConfig,
  type AgentsSDKResult,
} from './openai-agents-driver.js';

// OpenCode SDK driver (SST open source)
export {
  OpenCodeDriver,
  createOpenCodeDriver,
  type OpenCodeDriverConfig,
  type OpenCodeResult,
} from './opencode-driver.js';

// Initialize and register drivers
import { ClaudeAgentSDKDriver } from './claude-agent-sdk-driver.js';
import { OpenAICodexDriver } from './openai-codex-driver.js';
import { OpenAIAgentsDriver } from './openai-agents-driver.js';
import { OpenCodeDriver } from './opencode-driver.js';
import { register } from './registry.js';

// Auto-register all drivers
// Claude SDK is registered first and becomes the default
const claudeDriver = new ClaudeAgentSDKDriver();
register(claudeDriver);

// Register OpenAI drivers (available when OPENAI_API_KEY is set)
const codexDriver = new OpenAICodexDriver();
register(codexDriver);

const agentsDriver = new OpenAIAgentsDriver();
register(agentsDriver);

// Register OpenCode driver (available when opencode is installed)
const openCodeDriver = new OpenCodeDriver();
register(openCodeDriver);
